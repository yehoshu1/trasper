"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { documentDateFromInput } from "@/lib/dates";
import { parseMoneyToMinor } from "@/lib/money";
import { instalmentSchema } from "@/lib/schemas";
import { audit } from "@/server/audit";
import { prisma } from "@/server/db";
import { actionUser } from "@/server/guard";

const formSchema = z.object({
  proformaId: z.string().min(1).max(64),
  deposit: instalmentSchema.omit({ proformaId: true }),
  balance: instalmentSchema.omit({ proformaId: true }),
});

function back(proformaId: string, message?: string): never {
  redirect(
    `/proformas/${proformaId}${message ? `?error=${encodeURIComponent(message)}` : "?saved=1#schedule"}`,
  );
}

/**
 * A deposit + balance target. It never types the pro forma status: the status
 * and the paid/outstanding split still come from the payment rows.
 */
export async function saveInstalmentsAction(formData: FormData): Promise<void> {
  const user = await actionUser("manageDocuments");
  const rawProformaId = String(formData.get("proformaId") ?? "");
  const proformaId = /^[A-Za-z0-9_-]{1,64}$/.test(rawProformaId) ? rawProformaId : "";
  if (!proformaId) redirect("/proformas?error=Pro%20forma%20not%20found");
  const parsed = formSchema.safeParse({
    proformaId,
    deposit: {
      label: formData.get("depositLabel"),
      dueDate: formData.get("depositDate"),
      amount: formData.get("depositAmount"),
    },
    balance: {
      label: formData.get("balanceLabel"),
      dueDate: formData.get("balanceDate"),
      amount: formData.get("balanceAmount"),
    },
  });
  if (!parsed.success) back(proformaId, parsed.error.issues[0]?.message ?? "Check the schedule");

  const proforma = await prisma.proforma.findUnique({ where: { id: proformaId } });
  if (!proforma) redirect("/proformas?error=Pro%20forma%20not%20found");
  if (proforma.status === "cancelled") back(proformaId, "A cancelled pro forma cannot take a schedule");

  let depositMinor: bigint;
  let balanceMinor: bigint;
  try {
    depositMinor = parseMoneyToMinor(parsed.data.deposit.amount, proforma.currency);
    balanceMinor = parseMoneyToMinor(parsed.data.balance.amount, proforma.currency);
  } catch (error) {
    back(proformaId, error instanceof Error ? error.message : "Invalid amount");
  }
  if (depositMinor <= 0n || balanceMinor <= 0n) {
    back(proformaId, "Both instalments must be greater than zero");
  }
  if (depositMinor + balanceMinor !== proforma.totalMinor) {
    back(proformaId, "Deposit and balance must add up to the pro forma total");
  }

  await prisma.$transaction(async (tx) => {
    const before = await tx.instalment.findMany({
      where: { proformaId },
      orderBy: { position: "asc" },
    });
    await tx.instalment.deleteMany({ where: { proformaId } });
    const created = await tx.instalment.createMany({
      data: [
        {
          proformaId,
          position: 0,
          label: parsed.data.deposit.label,
          dueDate: documentDateFromInput(parsed.data.deposit.dueDate),
          amountMinor: depositMinor,
        },
        {
          proformaId,
          position: 1,
          label: parsed.data.balance.label,
          dueDate: documentDateFromInput(parsed.data.balance.dueDate),
          amountMinor: balanceMinor,
        },
      ],
    });
    await audit(tx, {
      userId: user.id,
      action: "saveInstalments",
      entity: "Proforma",
      entityId: proformaId,
      before,
      after: {
        count: created.count,
        depositMinor,
        balanceMinor,
        currency: proforma.currency,
      },
    });
  });

  revalidatePath(`/proformas/${proformaId}`);
  back(proformaId);
}

export async function removeInstalmentsAction(formData: FormData): Promise<void> {
  const user = await actionUser("manageDocuments");
  const rawProformaId = String(formData.get("proformaId") ?? "");
  const proformaId = /^[A-Za-z0-9_-]{1,64}$/.test(rawProformaId) ? rawProformaId : "";
  if (!proformaId) redirect("/proformas?error=Pro%20forma%20not%20found");
  const proforma = await prisma.proforma.findUnique({ where: { id: proformaId } });
  if (!proforma) redirect("/proformas?error=Pro%20forma%20not%20found");

  await prisma.$transaction(async (tx) => {
    const before = await tx.instalment.findMany({ where: { proformaId }, orderBy: { position: "asc" } });
    await tx.instalment.deleteMany({ where: { proformaId } });
    await audit(tx, {
      userId: user.id,
      action: "removeInstalments",
      entity: "Proforma",
      entityId: proformaId,
      before,
    });
  });
  revalidatePath(`/proformas/${proformaId}`);
  back(proformaId);
}
