import { buildAgedDebtorReport, type AgedDebtorReport } from "@/lib/aged-debtors";
import { prisma } from "@/server/db";

export interface AgedDebtorListItem {
  id: string;
  number: string;
  customerName: string;
  customerId: string;
  quotationId: string;
  currency: string;
  balanceMinor: bigint;
  ageDays: number;
  bucket: string;
  dueDate: string;
}

export interface AgedDebtorView extends AgedDebtorReport {
  list: AgedDebtorListItem[];
}

export async function loadAgedDebtors(asOf: Date = new Date()): Promise<AgedDebtorView> {
  const proformas = await prisma.proforma.findMany({
    where: { status: { not: "cancelled" } },
    include: {
      payments: { select: { amountMinor: true } },
      quotation: {
        select: {
          id: true,
          contact: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: [{ dueDate: "asc" }, { issueDate: "asc" }],
  });

  const details = new Map(
    proformas.map((proforma) => [
      proforma.id,
      {
        number: proforma.number,
        customerName: proforma.quotation.contact.name,
        customerId: proforma.quotation.contact.id,
        quotationId: proforma.quotationId,
      },
    ]),
  );

  const report = buildAgedDebtorReport(
    proformas.map((proforma) => ({
      ref: proforma.id,
      currency: proforma.currency,
      totalMinor: proforma.totalMinor,
      paidMinor: proforma.payments.reduce((sum, payment) => sum + payment.amountMinor, 0n),
      dueDate: proforma.dueDate,
      issueDate: proforma.issueDate,
    })),
    asOf,
  );

  return {
    ...report,
    list: report.rows.map((row) => {
      const detail = row.ref ? details.get(row.ref) : undefined;
      return {
        id: row.ref ?? "",
        number: detail?.number ?? "",
        customerName: detail?.customerName ?? "",
        customerId: detail?.customerId ?? "",
        quotationId: detail?.quotationId ?? "",
        currency: row.currency,
        balanceMinor: row.balanceMinor,
        ageDays: row.ageDays,
        bucket: row.bucket,
        dueDate: (row.dueDate ?? row.issueDate).toISOString().slice(0, 10),
      };
    }),
  };
}
