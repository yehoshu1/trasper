import { canArchiveProforma, proformaArchiveError } from "@/lib/archive";
import { actionError, actionOk, type ActionResult } from "@/server/actions/types";
import { audit } from "@/server/audit";
import { prisma } from "@/server/db";
import { paidTotalForProforma } from "@/server/payments";

/**
 * Shared pro forma mutation. Deliberately not in a "use server" module: the
 * caller must authenticate and authorise before passing the staff userId.
 */
export async function cancelProformaCore(
  proformaId: string,
  userId: string,
  reason: string,
): Promise<{ ok: boolean; error?: string }> {
  const proforma = await prisma.proforma.findUnique({ where: { id: proformaId } });
  if (!proforma) return { ok: false, error: "Pro forma not found" };
  if (proforma.status === "cancelled") return { ok: false, error: "This pro forma is already cancelled" };

  const paid = await paidTotalForProforma(proforma.id);
  if (paid !== 0n) {
    return { ok: false, error: "Reverse the payments before cancelling this pro forma" };
  }

  const rejection: { message: string | null } = { message: null };
  await prisma
    .$transaction(async (tx) => {
      const current = await tx.proforma.findUnique({ where: { id: proforma.id } });
      if (!current || current.status === "cancelled") {
        rejection.message = "This pro forma is already cancelled";
        throw new Error("PROFORMA_CANCEL_REJECTED");
      }
      const aggregate = await tx.payment.aggregate({
        where: { proformaId: current.id },
        _sum: { amountMinor: true },
      });
      if ((aggregate._sum.amountMinor ?? 0n) !== 0n) {
        rejection.message = "Reverse the payments before cancelling this pro forma";
        throw new Error("PROFORMA_CANCEL_REJECTED");
      }
      const claimed = await tx.proforma.updateMany({
        where: { id: current.id, status: { not: "cancelled" } },
        data: {
          status: "cancelled",
          cancelledReason: reason,
          cancelledAt: new Date(),
        },
      });
      if (claimed.count === 0) {
        rejection.message = "This pro forma is already cancelled";
        throw new Error("PROFORMA_CANCEL_REJECTED");
      }
      await audit(tx, {
        userId,
        action: "cancelProforma",
        entity: "Proforma",
        entityId: current.id,
        before: { status: current.status },
        after: { status: "cancelled", reason },
      });
    })
    .catch((error) => {
      if (rejection.message) return;
      throw error;
    });
  if (rejection.message) return { ok: false, error: rejection.message };
  return { ok: true };
}

/**
 * Hide a fully paid or cancelled pro forma from the active list. It remains
 * readable, printable and part of financial reports. Caller must authorise.
 */
export async function archiveProformaCore(
  proformaId: string,
  userId: string,
): Promise<ActionResult> {
  const proforma = await prisma.proforma.findUnique({ where: { id: proformaId } });
  if (!proforma) return actionError("Pro forma not found");
  if (proforma.archivedAt) return actionError("This pro forma is already archived");
  if (!canArchiveProforma(proforma.status)) {
    return actionError(proformaArchiveError(proforma.status));
  }

  const archivedAt = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.proforma.update({
      where: { id: proforma.id },
      data: { archivedAt },
    });
    await audit(tx, {
      userId,
      action: "archiveProforma",
      entity: "Proforma",
      entityId: proforma.id,
      before: { status: proforma.status, archivedAt: null },
      after: { status: proforma.status, archivedAt },
    });
  });
  return actionOk(`Archived ${proforma.number}`);
}

/** Restore an archived pro forma to the active list. */
export async function unarchiveProformaCore(
  proformaId: string,
  userId: string,
): Promise<ActionResult> {
  const proforma = await prisma.proforma.findUnique({ where: { id: proformaId } });
  if (!proforma) return actionError("Pro forma not found");
  if (!proforma.archivedAt) return actionError("This pro forma is not archived");

  await prisma.$transaction(async (tx) => {
    await tx.proforma.update({
      where: { id: proforma.id },
      data: { archivedAt: null },
    });
    await audit(tx, {
      userId,
      action: "unarchiveProforma",
      entity: "Proforma",
      entityId: proforma.id,
      before: { status: proforma.status, archivedAt: proforma.archivedAt },
      after: { status: proforma.status, archivedAt: null },
    });
  });
  return actionOk(`Restored ${proforma.number}`);
}
