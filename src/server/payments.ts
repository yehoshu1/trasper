import type { Prisma } from "@/generated/prisma/client";

import { deriveStatus, type ProformaStatus } from "@/lib/payment-status";
import { prisma } from "@/server/db";

/**
 * Payments are append-only; reversals are negative rows, so the sum is the
 * amount actually paid. The status rule itself is pure and lives in
 * src/lib/payment-status.ts, where it is unit-tested.
 */
export { deriveStatus, type ProformaStatus } from "@/lib/payment-status";

export async function paidTotalForProforma(proformaId: string): Promise<bigint> {
  const result = await prisma.payment.aggregate({
    where: { proformaId },
    _sum: { amountMinor: true },
  });
  return result._sum.amountMinor ?? 0n;
}

export async function recalculateProformaStatus(
  tx: Prisma.TransactionClient,
  proformaId: string,
  totalMinor: bigint,
): Promise<ProformaStatus> {
  const result = await tx.payment.aggregate({
    where: { proformaId },
    _sum: { amountMinor: true },
  });
  const paid = result._sum.amountMinor ?? 0n;
  const status = deriveStatus(totalMinor, paid);
  await tx.proforma.update({ where: { id: proformaId }, data: { status } });
  return status;
}
