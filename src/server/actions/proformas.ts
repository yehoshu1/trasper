"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { chooseBankAccount } from "@/lib/bank-accounts";
import { documentDateFromInput, todayInAppZone } from "@/lib/dates";
import { applyTravellerNames } from "@/lib/travellers";
import {
  cancelProformaSchema,
  createProformaSchema,
  updateProformaDraftSchema,
} from "@/lib/schemas";
import { audit } from "@/server/audit";
import { actionUser } from "@/server/guard";
import { prisma } from "@/server/db";
import { allocateNumber } from "@/server/numbering";
import { getSettings } from "@/server/settings";
import { loadQuotation } from "@/server/quotations";
import { buildProformaSnapshot, DocumentError } from "@/server/documents";
import {
  archiveProformaCore,
  cancelProformaCore,
  unarchiveProformaCore,
} from "@/server/proforma-mutations";
import { errorMessage } from "@/server/actions/types";

export async function createProformaAction(formData: FormData): Promise<void> {
  let proformaId: string;
  try {
    const user = await actionUser("manageDocuments");
    const parsed = createProformaSchema.safeParse({
      quotationId: formData.get("quotationId"),
      dueDate: formData.get("dueDate") ?? "",
      terms: formData.get("terms") ?? "",
      showVat: formData.get("showVat") === "on",
      bankAccountId: formData.get("bankAccountId") || undefined,
    });
    if (!parsed.success) {
      const raw = String(formData.get("quotationId") ?? "");
      const target = /^[A-Za-z0-9_-]{1,64}$/.test(raw) ? `/quotations/${raw}` : "/quotations";
      redirect(`${target}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Check the form")}`);
    }
    const data = parsed.data;

    const quotation = await loadQuotation(data.quotationId);
    if (!quotation) redirect("/quotations?error=Quotation%20not%20found");
    if (quotation.status !== "accepted") {
      redirect(`/quotations/${quotation.id}?error=${encodeURIComponent("Only an accepted quotation can produce a pro forma")}`);
    }
    if (quotation.options.length === 0) {
      redirect(`/quotations/${quotation.id}?error=${encodeURIComponent("Add at least one journey before creating a pro forma")}`);
    }

    const existing = await prisma.proforma.findFirst({
      where: { quotationId: quotation.id, status: { not: "cancelled" } },
    });
    if (existing) {
      redirect(`/quotations/${quotation.id}?error=${encodeURIComponent(`Pro forma ${existing.number} is already active; cancel it before issuing another`)}`);
    }

    const settings = await getSettings();
    const issueDate = documentDateFromInput(todayInAppZone().toISODate()!);
    const dueDate = data.dueDate
      ? documentDateFromInput(data.dueDate)
      : new Date(issueDate.getTime() + 14 * 24 * 60 * 60 * 1000);

    const bankAccounts = await prisma.bankAccount.findMany({ where: { isArchived: false } });
    const bank = chooseBankAccount(bankAccounts, data.bankAccountId);
    const created = await prisma.$transaction(async (tx) => {
      const number = await allocateNumber(tx, "proforma", issueDate, quotation.branch);
      const snapshot = await buildProformaSnapshot(
        quotation,
        quotation.options,
        settings,
        {
          number,
          issueDate,
          dueDate,
          terms: data.terms || settings.paymentTerms,
          showVat: data.showVat,
          bankAccountId: bank?.id ?? null,
        },
      );
      const proforma = await tx.proforma.create({
        data: {
          number,
          quotationId: quotation.id,
          optionId: quotation.options[0]!.id,
          bankAccountId: bank?.id ?? quotation.bankAccountId,
          referenceNo: quotation.referenceNo,
          status: "draft",
          currency: quotation.currency,
          totalMinor: BigInt(snapshot.totalMinor),
          issueDate,
          dueDate,
          terms: snapshot.terms,
          showVat: data.showVat,
          snapshot: JSON.stringify(snapshot),
          createdById: user.id,
          lines: {
            create: snapshot.lines.map((line, index) => ({
              position: index,
              description: line.description,
              amountMinor: BigInt(line.amountMinor),
            })),
          },
        },
      });
      await audit(tx, {
        userId: user.id,
        action: "createProforma",
        entity: "Proforma",
        entityId: proforma.id,
        after: {
          number: proforma.number,
          status: "draft",
          totalMinor: proforma.totalMinor,
          quotationId: quotation.id,
          optionId: quotation.options[0]!.id,
          journeyCount: quotation.options.length,
          showVat: data.showVat,
        },
      });
      return proforma;
    });
    proformaId = created.id;
    revalidatePath(`/quotations/${quotation.id}`);
    revalidatePath("/proformas");
  } catch (error) {
    if (error instanceof DocumentError) {
      redirect(`/quotations?error=${encodeURIComponent(error.message)}`);
    }
    const digest = (error as { digest?: string } | null)?.digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) throw error;
    redirect(`/quotations?error=${encodeURIComponent(errorMessage(error))}`);
  }
  redirect(`/proformas/${proformaId}`);
}

type ProformaDraftInput = z.infer<typeof updateProformaDraftSchema>;

/**
 * Rebuild a draft pro forma from every journey, then apply the traveller
 * names typed into the draft. No number is allocated here: the pro forma
 * already has one from creation.
 */
async function prepareProformaDraft(proformaId: string, input: ProformaDraftInput) {
  const proforma = await prisma.proforma.findUnique({ where: { id: proformaId } });
  if (!proforma) throw new Error("Pro forma not found");
  if (proforma.status !== "draft") {
    throw new Error("Only a draft pro forma can be edited or sent");
  }

  const quotation = await loadQuotation(proforma.quotationId);
  if (!quotation) throw new Error("Quotation not found");
  if (quotation.options.length === 0) throw new Error("The quotation has no journeys");

  const settings = await getSettings();
  const bankAccounts = await prisma.bankAccount.findMany({ where: { isArchived: false } });
  const bank = chooseBankAccount(bankAccounts, input.bankAccountId);
  const dueDate = input.dueDate ? documentDateFromInput(input.dueDate) : undefined;
  const terms = input.terms || settings.paymentTerms;
  const snapshot = await buildProformaSnapshot(
    quotation,
    quotation.options,
    settings,
    {
      number: proforma.number,
      issueDate: proforma.issueDate,
      dueDate,
      terms,
      showVat: input.showVat,
      bankAccountId: bank?.id ?? proforma.bankAccountId,
    },
  );

  const names = applyTravellerNames(snapshot.passengers, input.travellerNames);
  if (names.error) throw new Error(names.error);
  snapshot.passengers = names.passengers;

  const baselineLines = snapshot.lines.map((line) => ({
    description: line.description,
    amountMinor: line.amountMinor,
  }));
  if (JSON.stringify(input.lines) !== JSON.stringify(baselineLines)) {
    // Once the draft's price lines are edited they become the document's
    // authoritative lines. The quotation's per-journey presentation can no
    // longer be assumed, so print the edited lines with one total instead.
    snapshot.lines = input.lines.map((line) => ({
      description: line.description,
      amountMinor: line.amountMinor,
    }));
    snapshot.totalMinor = snapshot.lines
      .reduce((sum, line) => sum + BigInt(line.amountMinor), 0n)
      .toString();
    snapshot.presentation = undefined;
    snapshot.journeys = undefined;
    snapshot.vatMinor = "0";
  }

  return {
    proforma,
    snapshot,
    snapshotJson: JSON.stringify(snapshot),
    dueDate: dueDate ?? null,
    terms,
    showVat: input.showVat,
    bankAccountId: bank?.id ?? proforma.bankAccountId ?? null,
  };
}

function proformaDraftData(prepared: Awaited<ReturnType<typeof prepareProformaDraft>>) {
  return {
    dueDate: prepared.dueDate,
    terms: prepared.terms,
    showVat: prepared.showVat,
    bankAccountId: prepared.bankAccountId,
    totalMinor: BigInt(prepared.snapshot.totalMinor),
    snapshot: prepared.snapshotJson,
  };
}

export async function updateProformaDraftAction(formData: FormData): Promise<void> {
  const user = await actionUser("manageDocuments");
  let lines: unknown = [];
  const rawLines = formData.get("lines");
  if (typeof rawLines === "string" && rawLines.trim()) {
    try {
      lines = JSON.parse(rawLines);
    } catch {
      redirect(`/proformas/${formData.get("proformaId")}?error=${encodeURIComponent("Could not read the price lines")}`);
    }
  }
  const parsed = updateProformaDraftSchema.safeParse({
    proformaId: formData.get("proformaId"),
    dueDate: formData.get("dueDate") ?? "",
    terms: formData.get("terms") ?? "",
    showVat: formData.get("showVat") === "on",
    bankAccountId: formData.get("bankAccountId") || undefined,
    travellerNames: formData.get("travellerNames") ?? "",
    lines,
  });
  if (!parsed.success) {
    redirect(`/proformas/${formData.get("proformaId")}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Check the draft")}`);
  }

  let prepared: Awaited<ReturnType<typeof prepareProformaDraft>>;
  try {
    prepared = await prepareProformaDraft(parsed.data.proformaId, parsed.data);
  } catch (error) {
    redirect(`/proformas/${parsed.data.proformaId}?error=${encodeURIComponent(errorMessage(error))}`);
  }

  await prisma.$transaction(async (tx) => {
    await tx.proformaLine.deleteMany({ where: { proformaId: prepared.proforma.id } });
    await tx.proforma.update({
      where: { id: prepared.proforma.id },
      data: {
        ...proformaDraftData(prepared),
        lines: {
          create: prepared.snapshot.lines.map((line, index) => ({
            position: index,
            description: line.description,
            amountMinor: BigInt(line.amountMinor),
          })),
        },
      },
    });
    await audit(tx, {
      userId: user.id,
      action: "updateProformaDraft",
      entity: "Proforma",
      entityId: prepared.proforma.id,
      before: {
        status: prepared.proforma.status,
        totalMinor: prepared.proforma.totalMinor,
        dueDate: prepared.proforma.dueDate?.toISOString() ?? null,
      },
      after: {
        status: "draft",
        totalMinor: prepared.snapshot.totalMinor,
        dueDate: prepared.dueDate?.toISOString() ?? null,
      },
    });
  });

  revalidatePath(`/proformas/${prepared.proforma.id}`);
  revalidatePath("/proformas");
  redirect(`/proformas/${prepared.proforma.id}?saved=1`);
}

export async function sendProformaAction(formData: FormData): Promise<void> {
  const user = await actionUser("manageDocuments");
  let lines: unknown = [];
  const rawLines = formData.get("lines");
  if (typeof rawLines === "string" && rawLines.trim()) {
    try {
      lines = JSON.parse(rawLines);
    } catch {
      redirect(`/proformas/${formData.get("proformaId")}?error=${encodeURIComponent("Could not read the price lines")}`);
    }
  }
  const parsed = updateProformaDraftSchema.safeParse({
    proformaId: formData.get("proformaId"),
    dueDate: formData.get("dueDate") ?? "",
    terms: formData.get("terms") ?? "",
    showVat: formData.get("showVat") === "on",
    bankAccountId: formData.get("bankAccountId") || undefined,
    travellerNames: formData.get("travellerNames") ?? "",
    lines,
  });
  if (!parsed.success) {
    redirect(`/proformas/${formData.get("proformaId")}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Check the draft")}`);
  }

  let prepared: Awaited<ReturnType<typeof prepareProformaDraft>>;
  try {
    prepared = await prepareProformaDraft(parsed.data.proformaId, parsed.data);
  } catch (error) {
    redirect(`/proformas/${parsed.data.proformaId}?error=${encodeURIComponent(errorMessage(error))}`);
  }

  await prisma.$transaction(async (tx) => {
    await tx.proformaLine.deleteMany({ where: { proformaId: prepared.proforma.id } });
    await tx.proforma.update({
      where: { id: prepared.proforma.id },
      data: {
        ...proformaDraftData(prepared),
        status: "unpaid",
        sentAt: new Date(),
        lockedAt: new Date(),
        lines: {
          create: prepared.snapshot.lines.map((line, index) => ({
            position: index,
            description: line.description,
            amountMinor: BigInt(line.amountMinor),
          })),
        },
      },
    });
    await audit(tx, {
      userId: user.id,
      action: "sendProforma",
      entity: "Proforma",
      entityId: prepared.proforma.id,
      before: { status: "draft" },
      after: {
        status: "unpaid",
        totalMinor: prepared.snapshot.totalMinor,
        sentAt: new Date(),
      },
    });
  });

  revalidatePath(`/proformas/${prepared.proforma.id}`);
  revalidatePath("/proformas");
  revalidatePath("/dashboard");
  redirect(`/proformas/${prepared.proforma.id}?saved=1`);
}

export async function archiveProformaAction(formData: FormData): Promise<void> {
  await changeProformaArchive(formData, true);
}

export async function unarchiveProformaAction(formData: FormData): Promise<void> {
  await changeProformaArchive(formData, false);
}

async function changeProformaArchive(formData: FormData, archive: boolean): Promise<void> {
  const user = await actionUser("manageDocuments");
  const parsed = z
    .object({ proformaId: z.string().min(1).max(64) })
    .safeParse({ proformaId: formData.get("proformaId") });
  if (!parsed.success) redirect("/proformas?error=Invalid%20pro%20forma");

  const result = archive
    ? await archiveProformaCore(parsed.data.proformaId, user.id)
    : await unarchiveProformaCore(parsed.data.proformaId, user.id);
  if (!result.ok) {
    redirect(
      `/proformas/${parsed.data.proformaId}?error=${encodeURIComponent(result.error ?? "Could not update archive")}`,
    );
  }
  revalidatePath(`/proformas/${parsed.data.proformaId}`);
  revalidatePath("/proformas");
  redirect(`/proformas/${parsed.data.proformaId}?saved=1`);
}

export async function cancelProformaAction(formData: FormData): Promise<void> {
  const user = await actionUser("manageDocuments");
  const parsed = cancelProformaSchema.safeParse({
    proformaId: formData.get("proformaId"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    redirect(`/proformas/${formData.get("proformaId")}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Give a reason")}`);
  }

  const result = await cancelProformaCore(parsed.data.proformaId, user.id, parsed.data.reason);
  if (!result.ok) {
    redirect(`/proformas/${parsed.data.proformaId}?error=${encodeURIComponent(result.error ?? "Could not cancel")}`);
  }
  revalidatePath(`/proformas/${parsed.data.proformaId}`);
  revalidatePath("/proformas");
  redirect(`/proformas/${parsed.data.proformaId}?saved=1`);
}
