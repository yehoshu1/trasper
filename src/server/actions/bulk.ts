"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { audit } from "@/server/audit";
import { prisma } from "@/server/db";
import { actionUser } from "@/server/guard";
import { actionError, actionOk, errorMessage, type ActionResult } from "@/server/actions/types";
import { cancelQuotationCore, duplicateQuotationCore } from "@/server/quotation-mutations";
import { cancelProformaCore } from "@/server/proforma-mutations";

const idsSchema = z.array(z.string().min(1).max(64)).min(1).max(200);
const reasonSchema = z.string().trim().min(3, "Give a reason").max(500);

export async function bulkDuplicateQuotationsAction(ids: string[]): Promise<ActionResult> {
  try {
    const user = await actionUser("manageQuotations");
    const parsed = idsSchema.safeParse(ids);
    if (!parsed.success) return actionError("Select at least one quotation");
    let done = 0;
    const failed: string[] = [];
    for (const id of parsed.data) {
      try {
        await duplicateQuotationCore(id, user.id);
        done += 1;
      } catch {
        failed.push(id);
      }
    }
    if (done > 0) revalidatePath("/quotations");
    return actionOk(
      `Duplicated ${done} quotation${done === 1 ? "" : "s"}${
        failed.length > 0 ? `; ${failed.length} could not be duplicated` : ""
      }.`,
    );
  } catch (error) {
    return actionError(errorMessage(error));
  }
}

export async function bulkCancelQuotationsAction(
  ids: string[],
  reason: string,
): Promise<ActionResult> {
  try {
    const user = await actionUser("manageQuotations");
    const parsedIds = idsSchema.safeParse(ids);
    const parsedReason = reasonSchema.safeParse(reason);
    if (!parsedIds.success) return actionError("Select at least one quotation");
    if (!parsedReason.success) return actionError(parsedReason.error.issues[0]?.message ?? "Give a reason");

    let done = 0;
    let skipped = 0;
    for (const id of parsedIds.data) {
      const result = await cancelQuotationCore(id, user.id, parsedReason.data);
      if (result.ok) done += 1;
      else skipped += 1;
    }
    if (done > 0) {
      revalidatePath("/quotations");
      revalidatePath("/dashboard");
    }
    return actionOk(
      `Cancelled ${done} quotation${done === 1 ? "" : "s"}${
        skipped > 0 ? `; ${skipped} skipped because the domain does not allow it` : ""
      }.`,
    );
  } catch (error) {
    return actionError(errorMessage(error));
  }
}

export async function bulkCancelProformasAction(
  ids: string[],
  reason: string,
): Promise<ActionResult> {
  try {
    const user = await actionUser("manageDocuments");
    const parsedIds = idsSchema.safeParse(ids);
    const parsedReason = reasonSchema.safeParse(reason);
    if (!parsedIds.success) return actionError("Select at least one pro forma");
    if (!parsedReason.success) return actionError(parsedReason.error.issues[0]?.message ?? "Give a reason");

    let done = 0;
    let skipped = 0;
    for (const id of parsedIds.data) {
      const result = await cancelProformaCore(id, user.id, parsedReason.data);
      if (result.ok) done += 1;
      else skipped += 1;
    }
    if (done > 0) revalidatePath("/proformas");
    return actionOk(
      `Cancelled ${done} pro forma${done === 1 ? "" : "s"}${
        skipped > 0 ? `; ${skipped} skipped (already cancelled or has payments)` : ""
      }.`,
    );
  } catch (error) {
    return actionError(errorMessage(error));
  }
}

export async function bulkArchiveContactsAction(ids: string[]): Promise<ActionResult> {
  try {
    const user = await actionUser("manageContacts");
    const parsed = idsSchema.safeParse(ids);
    if (!parsed.success) return actionError("Select at least one customer");
    let done = 0;
    for (const id of parsed.data) {
      const before = await prisma.contact.findUnique({ where: { id } });
      if (!before || before.archivedAt) continue;
      await prisma.$transaction(async (tx) => {
        const contact = await tx.contact.update({
          where: { id },
          data: { archivedAt: new Date(), version: { increment: 1 } },
        });
        await audit(tx, {
          userId: user.id,
          action: "archiveContact",
          entity: "Contact",
          entityId: id,
          before: { archivedAt: before.archivedAt },
          after: { archivedAt: contact.archivedAt, bulk: true },
        });
      });
      done += 1;
    }
    return actionOk(`Archived ${done} customer${done === 1 ? "" : "s"}.`);
  } catch (error) {
    return actionError(errorMessage(error));
  }
}
