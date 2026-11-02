"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { chooseBankAccount } from "@/lib/bank-accounts";
import { documentDateFromInput, todayInAppZone } from "@/lib/dates";
import { cancelProformaSchema, createProformaSchema } from "@/lib/schemas";
import { audit } from "@/server/audit";
import { actionUser } from "@/server/guard";
import { prisma } from "@/server/db";
import { allocateNumber } from "@/server/numbering";
import { getSettings } from "@/server/settings";
import { loadQuotation } from "@/server/quotations";
import { buildProformaSnapshot, DocumentError } from "@/server/documents";
import { cancelProformaCore } from "@/server/proforma-mutations";
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
    const option = quotation.options.find((entry) => entry.id === quotation.acceptedOptionId);
    if (!option) {
      redirect(`/quotations/${quotation.id}?error=${encodeURIComponent("The accepted option could not be found")}`);
    }

    const existing = await prisma.proforma.findFirst({
      where: { quotationId: quotation.id, optionId: option.id, status: { not: "cancelled" } },
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
      const snapshot = await buildProformaSnapshot(quotation, option, settings, {
        number,
        issueDate,
        dueDate,
        terms: data.terms || settings.paymentTerms,
        showVat: data.showVat,
        bankAccountId: bank?.id ?? null,
      });
      const proforma = await tx.proforma.create({
        data: {
          number,
          quotationId: quotation.id,
          optionId: option.id,
          bankAccountId: bank?.id ?? quotation.bankAccountId,
          referenceNo: quotation.referenceNo,
          status: "unpaid",
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
          totalMinor: proforma.totalMinor,
          quotationId: quotation.id,
          optionId: option.id,
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
