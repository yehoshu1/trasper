import { audit } from "@/server/audit";
import { prisma } from "@/server/db";
import { deriveStatus } from "@/lib/payment-status";
import { expireOverdueQuotations } from "@/server/quotations";
import { getSettings } from "@/server/settings";

/**
 * Scheduled maintenance.
 *
 * The same work runs on page load and here, so a page visit is never the only
 * thing keeping statuses honest. Every step is idempotent and never touches a
 * document number.
 */

export interface JobRunResult {
  expiredQuotations: number;
  statusesChecked: number;
  statusesChanged: number;
  ranAt: string;
}

export async function rollupProformaStatuses(): Promise<{ checked: number; changed: number }> {
  const proformas = await prisma.proforma.findMany({
    where: { status: { notIn: ["cancelled", "draft"] } },
    select: {
      id: true,
      status: true,
      totalMinor: true,
      payments: { select: { amountMinor: true } },
    },
  });

  let changed = 0;
  for (const proforma of proformas) {
    const paid = proforma.payments.reduce((sum, payment) => sum + payment.amountMinor, 0n);
    const derived = deriveStatus(proforma.totalMinor, paid);
    if (derived === proforma.status) continue;
    await prisma.$transaction(async (tx) => {
      await tx.proforma.update({ where: { id: proforma.id }, data: { status: derived } });
      await audit(tx, {
        userId: null,
        action: "rollupProformaStatus",
        entity: "Proforma",
        entityId: proforma.id,
        before: { status: proforma.status },
        after: { status: derived, paidMinor: paid, totalMinor: proforma.totalMinor },
      });
    });
    changed += 1;
  }
  return { checked: proformas.length, changed };
}

export async function runScheduledJobs(): Promise<JobRunResult> {
  await getSettings();
  const expiredQuotations = await expireOverdueQuotations();
  const rollup = await rollupProformaStatuses();
  return {
    expiredQuotations,
    statusesChecked: rollup.checked,
    statusesChanged: rollup.changed,
    ranAt: new Date().toISOString(),
  };
}
