"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { DateTime } from "luxon";

import { documentDateFromInput, appTimeZone, todayInAppZone } from "@/lib/dates";
import { formatMoney, parseMoneyToMinor } from "@/lib/money";
import { paymentSchema, reversePaymentSchema } from "@/lib/schemas";
import { audit } from "@/server/audit";
import { actionUser } from "@/server/guard";
import { prisma } from "@/server/db";
import { paidTotalForProforma, recalculateProformaStatus } from "@/server/payments";

function back(path: string, message?: string): never {
  redirect(`${path}${message ? `?error=${encodeURIComponent(message)}` : "?saved=1"}`);
}

export async function recordPaymentAction(formData: FormData): Promise<void> {
  const user = await actionUser("recordPayments");
  const parsed = paymentSchema.safeParse({
    proformaId: formData.get("proformaId"),
    paidOn: formData.get("paidOn"),
    amount: formData.get("amount"),
    method: formData.get("method"),
    reference: formData.get("reference") ?? "",
  });
  const rawProformaId = formData.get("proformaId")?.toString() ?? "";
  const proformaId = /^[A-Za-z0-9_-]{1,64}$/.test(rawProformaId) ? rawProformaId : "";
  if (!parsed.success) {
    back(proformaId ? `/proformas/${proformaId}` : "/proformas", parsed.error.issues[0]?.message ?? "Check the payment");
  }

  const proforma = await prisma.proforma.findUnique({ where: { id: parsed.data.proformaId } });
  if (!proforma) back("/proformas", "Pro forma not found");
  if (proforma.status === "draft") {
    back(`/proformas/${proforma.id}`, "Mark this pro forma as sent before recording payments");
  }
  if (proforma.status === "cancelled") {
    back(`/proformas/${proforma.id}`, "A cancelled pro forma cannot take payments");
  }

  const paidOn = DateTime.fromISO(parsed.data.paidOn, { zone: appTimeZone() }).startOf("day");
  if (!paidOn.isValid) back(`/proformas/${proforma.id}`, "Invalid payment date");
  if (paidOn > todayInAppZone()) {
    back(`/proformas/${proforma.id}`, "A payment cannot be dated in the future");
  }

  let amountMinor: bigint;
  try {
    amountMinor = parseMoneyToMinor(parsed.data.amount, proforma.currency);
  } catch (error) {
    back(`/proformas/${proforma.id}`, error instanceof Error ? error.message : "Invalid amount");
  }
  if (amountMinor <= 0n) back(`/proformas/${proforma.id}`, "Payment must be greater than zero");

  const paid = await paidTotalForProforma(proforma.id);
  if (paid + amountMinor > proforma.totalMinor) {
    back(
      `/proformas/${proforma.id}`,
      `That would overpay: balance is ${formatMoney(proforma.totalMinor - paid, proforma.currency)}`,
    );
  }

  // Re-check inside the transaction: the pre-check above can race another
  // accountant recording a payment at the same time.
  const rejection: { message: string | null } = { message: null };
  try {
    await prisma.$transaction(async (tx) => {
      const current = await tx.proforma.findUnique({ where: { id: proforma.id } });
      if (!current) {
        rejection.message = "Pro forma not found";
        throw new Error("PAYMENT_REJECTED");
      }
      if (current.status === "draft") {
        rejection.message = "Mark this pro forma as sent before recording payments";
        throw new Error("PAYMENT_REJECTED");
      }
      if (current.status === "cancelled") {
        rejection.message = "A cancelled pro forma cannot take payments";
        throw new Error("PAYMENT_REJECTED");
      }
      const aggregate = await tx.payment.aggregate({
        where: { proformaId: current.id },
        _sum: { amountMinor: true },
      });
      const paidNow = aggregate._sum.amountMinor ?? 0n;
      if (paidNow + amountMinor > current.totalMinor) {
        rejection.message = `That would overpay: balance is ${formatMoney(current.totalMinor - paidNow, current.currency)}`;
        throw new Error("PAYMENT_REJECTED");
      }

      const payment = await tx.payment.create({
        data: {
          proformaId: current.id,
          paidOn: documentDateFromInput(parsed.data.paidOn),
          amountMinor,
          method: parsed.data.method,
          reference: parsed.data.reference,
          recordedById: user.id,
        },
      });
      const status = await recalculateProformaStatus(tx, current.id, current.totalMinor);
      await audit(tx, {
        userId: user.id,
        action: "recordPayment",
        entity: "Payment",
        entityId: payment.id,
        before: { paid: paidNow },
        after: {
          amountMinor,
          currency: current.currency,
          method: payment.method,
          status,
        },
      });
    });
  } catch (error) {
    if (rejection.message) back(`/proformas/${proforma.id}`, rejection.message);
    throw error;
  }

  revalidatePath(`/proformas/${proforma.id}`);
  revalidatePath("/proformas");
  revalidatePath("/payments");
  back(`/proformas/${proforma.id}`);
}

export async function reversePaymentAction(formData: FormData): Promise<void> {
  const user = await actionUser("recordPayments");
  const parsed = reversePaymentSchema.safeParse({
    paymentId: formData.get("paymentId"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    back("/payments", parsed.error.issues[0]?.message ?? "Check the reversal");
  }

  const payment = await prisma.payment.findUnique({
    where: { id: parsed.data.paymentId },
    include: { proforma: true },
  });
  if (!payment) back("/payments", "Payment not found");
  if (payment.amountMinor <= 0n) back("/payments", "A reversing entry cannot itself be reversed");
  if (payment.proforma.status === "cancelled") back("/payments", "The pro forma is cancelled");
  if (payment.proforma.archivedAt) {
    back(`/proformas/${payment.proformaId}`, "Restore this pro forma before reversing a payment");
  }

  const alreadyReversed = await prisma.payment.findFirst({ where: { reversesId: payment.id } });
  if (alreadyReversed) back("/payments", "That payment has already been reversed");

  // The unique index on reversesId is the durable guard; the in-transaction
  // check gives a friendly message instead of a database constraint error.
  const rejection: { message: string | null } = { message: null };
  try {
    await prisma.$transaction(async (tx) => {
      const current = await tx.payment.findUnique({
        where: { id: payment.id },
        include: { proforma: true },
      });
      if (!current || current.amountMinor <= 0n) {
        rejection.message = "That payment can no longer be reversed";
        throw new Error("REVERSAL_REJECTED");
      }
      if (current.proforma.status === "cancelled") {
        rejection.message = "The pro forma is cancelled";
        throw new Error("REVERSAL_REJECTED");
      }
      if (current.proforma.archivedAt) {
        rejection.message = "Restore this pro forma before reversing a payment";
        throw new Error("REVERSAL_REJECTED");
      }
      const existing = await tx.payment.findFirst({ where: { reversesId: current.id } });
      if (existing) {
        rejection.message = "That payment has already been reversed";
        throw new Error("REVERSAL_REJECTED");
      }

      const reversal = await tx.payment.create({
        data: {
          proformaId: current.proformaId,
          paidOn: documentDateFromInput(todayInAppZone().toISODate()!),
          amountMinor: -current.amountMinor,
          method: current.method,
          reference: `Reversal: ${parsed.data.reason}`,
          reversesId: current.id,
          recordedById: user.id,
        },
      });
      await recalculateProformaStatus(tx, current.proformaId, current.proforma.totalMinor);
      await audit(tx, {
        userId: user.id,
        action: "reversePayment",
        entity: "Payment",
        entityId: reversal.id,
        before: { paymentId: current.id, amountMinor: current.amountMinor },
        after: { reversedBy: reversal.id, reason: parsed.data.reason },
      });
    });
  } catch (error) {
    if (rejection.message) back(`/proformas/${payment.proformaId}`, rejection.message);
    if ((error as { code?: string }).code === "P2002") {
      back(`/proformas/${payment.proformaId}`, "That payment has already been reversed");
    }
    throw error;
  }

  revalidatePath(`/proformas/${payment.proformaId}`);
  revalidatePath("/proformas");
  revalidatePath("/payments");
  back(`/proformas/${payment.proformaId}`);
}

