import {
  addMoney,
  bucketKey,
  buildReportBuckets,
  moneyCurrencies,
  type ReportBreakdownRow,
  type ReportData,
  type ReportRange,
  type ReportSummary,
  type ReportTrendRow,
} from "@/lib/reports";
import { parseFrozenTotals } from "@/lib/documents";
import { prisma } from "@/server/db";

function sumPayments(values: { amountMinor: bigint }[]): bigint {
  return values.reduce((sum, payment) => sum + payment.amountMinor, 0n);
}

function sortBreakdown(rows: ReportBreakdownRow[]): ReportBreakdownRow[] {
  return rows.sort(
    (a, b) =>
      b.quotations - a.quotations ||
      a.name.localeCompare(b.name) ||
      a.key.localeCompare(b.key),
  );
}

function breakdownRow(
  rows: Map<string, ReportBreakdownRow>,
  key: string,
  name: string,
  includeProfit: boolean,
): ReportBreakdownRow {
  const existing = rows.get(key);
  if (existing) return existing;
  const created: ReportBreakdownRow = {
    key,
    name,
    quotations: 0,
    value: {},
    profit: includeProfit ? {} : null,
  };
  rows.set(key, created);
  return created;
}

/**
 * Load and aggregate the selected report period. Cost and profit figures are
 * only loaded for roles that may see costs; callers must pass includeProfit
 * from the same capability check used to render the page.
 */
export async function loadReport(
  range: ReportRange,
  options: { includeProfit: boolean },
): Promise<ReportData> {
  const start = range.start.toJSDate();
  const end = range.endExclusive.toJSDate();

  const [
    createdQuotations,
    sentQuotations,
    acceptanceLogs,
    proformas,
    payments,
    outstandingProformas,
    branches,
    airlines,
  ] = await Promise.all([
    prisma.quotation.findMany({
      where: { createdAt: { gte: start, lt: end } },
      select: { createdAt: true },
    }),
    prisma.quotation.findMany({
      where: { sentAt: { gte: start, lt: end } },
      select: { sentAt: true },
    }),
    prisma.auditLog.findMany({
      where: {
        action: { in: ["acceptOption", "acceptQuotation"] },
        entity: "Quotation",
        at: { gte: start, lt: end },
      },
      select: { entityId: true, at: true },
      orderBy: { at: "asc" },
    }),
    prisma.proforma.findMany({
      where: { issueDate: { gte: start, lt: end }, status: { notIn: ["draft", "cancelled"] } },
      select: { issueDate: true, currency: true, totalMinor: true, status: true },
    }),
    prisma.payment.findMany({
      where: { paidOn: { gte: start, lt: end } },
      select: {
        paidOn: true,
        amountMinor: true,
        proforma: { select: { currency: true } },
      },
    }),
    prisma.proforma.findMany({
      where: {
        issueDate: { lt: end },
        status: { not: "draft" },
        OR: [{ cancelledAt: null }, { cancelledAt: { gte: end } }],
      },
      select: {
        currency: true,
        totalMinor: true,
        payments: { where: { paidOn: { lt: end } }, select: { amountMinor: true } },
      },
    }),
    prisma.branch.findMany({ select: { code: true, name: true } }),
    prisma.airline.findMany({ select: { iata: true, name: true } }),
  ]);

  const acceptanceByQuotation = new Map<string, Date>();
  for (const entry of acceptanceLogs) {
    if (!acceptanceByQuotation.has(entry.entityId)) {
      acceptanceByQuotation.set(entry.entityId, entry.at);
    }
  }
  const acceptedIds = [...acceptanceByQuotation.keys()];

  const acceptedQuotations =
    acceptedIds.length > 0
      ? await prisma.quotation.findMany({
          where: { id: { in: acceptedIds } },
          select: {
            id: true,
            branch: true,
            currency: true,
            acceptedOptionId: true,
            contact: { select: { id: true, name: true } },
            options: {
              select: {
                id: true,
                frozenTotals: true,
                segments: {
                  select: { airline: true },
                  orderBy: { position: "asc" },
                  take: 1,
                },
              },
            },
          },
        })
      : [];

  const branchNames = new Map(branches.map((branch) => [branch.code, branch.name]));
  const airlineNames = new Map(airlines.map((airline) => [airline.iata, airline.name]));

  const summary: ReportSummary = {
    quotationsCreated: createdQuotations.length,
    quotationsSent: sentQuotations.length,
    quotationsAccepted: acceptedQuotations.length,
    proformasIssued: proformas.length,
    acceptedValue: {},
    proformaValue: {},
    paymentsGross: {},
    paymentsReversed: {},
    paymentsNet: {},
    outstanding: {},
    profit: options.includeProfit ? {} : null,
    frozenMissing: 0,
  };

  const customerRows = new Map<string, ReportBreakdownRow>();
  const branchRows = new Map<string, ReportBreakdownRow>();
  const airlineRows = new Map<string, ReportBreakdownRow>();

  for (const quotation of acceptedQuotations) {
    const frozenJourneys = quotation.options
      .map((entry) => parseFrozenTotals(entry.frozenTotals))
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
    const totalMinor = frozenJourneys.reduce(
      (sum, frozen) => sum + BigInt(frozen.totals.totalMinor),
      0n,
    );
    const profitMinor = frozenJourneys.reduce(
      (sum, frozen) => sum + BigInt(frozen.totals.profitMinor),
      0n,
    );
    if (frozenJourneys.length !== quotation.options.length) summary.frozenMissing += 1;

    addMoney(summary.acceptedValue, quotation.currency, totalMinor);
    if (summary.profit) addMoney(summary.profit, quotation.currency, profitMinor);

    const customer = breakdownRow(
      customerRows,
      `${quotation.contact.id}|${quotation.currency}`,
      quotation.contact.name,
      options.includeProfit,
    );
    customer.quotations += 1;
    addMoney(customer.value, quotation.currency, totalMinor);
    if (customer.profit) addMoney(customer.profit, quotation.currency, profitMinor);

    const branchCode = quotation.branch || "—";
    const branch = breakdownRow(
      branchRows,
      `${branchCode}|${quotation.currency}`,
      branchNames.get(branchCode) ?? branchCode,
      options.includeProfit,
    );
    branch.quotations += 1;
    addMoney(branch.value, quotation.currency, totalMinor);
    if (branch.profit) addMoney(branch.profit, quotation.currency, profitMinor);

    const airlineCode = quotation.options[0]?.segments[0]?.airline ?? "Unknown";
    const airline = breakdownRow(
      airlineRows,
      `${airlineCode}|${quotation.currency}`,
      airlineNames.get(airlineCode) ?? airlineCode,
      options.includeProfit,
    );
    airline.quotations += 1;
    addMoney(airline.value, quotation.currency, totalMinor);
    if (airline.profit) addMoney(airline.profit, quotation.currency, profitMinor);
  }

  for (const proforma of proformas) {
    if (proforma.status !== "cancelled" && proforma.status !== "draft") {
      addMoney(summary.proformaValue, proforma.currency, proforma.totalMinor);
    }
  }

  for (const payment of payments) {
    const currency = payment.proforma.currency;
    if (payment.amountMinor >= 0n) {
      addMoney(summary.paymentsGross, currency, payment.amountMinor);
    } else {
      addMoney(summary.paymentsReversed, currency, payment.amountMinor);
    }
    addMoney(summary.paymentsNet, currency, payment.amountMinor);
  }

  for (const proforma of outstandingProformas) {
    const paid = sumPayments(proforma.payments);
    addMoney(summary.outstanding, proforma.currency, proforma.totalMinor - paid);
  }

  const buckets = buildReportBuckets(range.start, range.endExclusive, range.grain);
  const trend: ReportTrendRow[] = buckets.map((bucket) => ({
    ...bucket,
    quotations: 0,
    sent: 0,
    accepted: 0,
    proformas: 0,
    acceptedValue: {},
    payments: {},
    profit: options.includeProfit ? {} : null,
  }));
  const trendByKey = new Map(trend.map((row) => [row.key, row]));

  for (const quotation of createdQuotations) {
    const row = trendByKey.get(bucketKey(quotation.createdAt, range.grain));
    if (row) row.quotations += 1;
  }
  for (const quotation of sentQuotations) {
    if (!quotation.sentAt) continue;
    const row = trendByKey.get(bucketKey(quotation.sentAt, range.grain));
    if (row) row.sent += 1;
  }
  for (const quotation of acceptedQuotations) {
    const acceptedAt = acceptanceByQuotation.get(quotation.id);
    if (!acceptedAt) continue;
    const row = trendByKey.get(bucketKey(acceptedAt, range.grain));
    if (!row) continue;
    row.accepted += 1;
    for (const option of quotation.options) {
      const frozen = parseFrozenTotals(option.frozenTotals);
      if (!frozen) continue;
      addMoney(row.acceptedValue, quotation.currency, BigInt(frozen.totals.totalMinor));
      if (row.profit) {
        addMoney(row.profit, quotation.currency, BigInt(frozen.totals.profitMinor));
      }
    }
  }
  for (const proforma of proformas) {
    const row = trendByKey.get(bucketKey(proforma.issueDate, range.grain));
    if (row) row.proformas += 1;
  }
  for (const payment of payments) {
    const row = trendByKey.get(bucketKey(payment.paidOn, range.grain));
    if (row) addMoney(row.payments, payment.proforma.currency, payment.amountMinor);
  }

  if (!options.includeProfit) {
    for (const row of [...customerRows.values(), ...branchRows.values(), ...airlineRows.values()]) {
      row.profit = null;
    }
  }

  return {
    range,
    summary,
    trend,
    byCustomer: sortBreakdown([...customerRows.values()]),
    byBranch: sortBreakdown([...branchRows.values()]),
    byAirline: sortBreakdown([...airlineRows.values()]),
    currencies: moneyCurrencies(
      summary.acceptedValue,
      summary.proformaValue,
      summary.paymentsGross,
      summary.paymentsReversed,
      summary.paymentsNet,
      summary.outstanding,
      summary.profit,
    ),
    includeProfit: options.includeProfit,
  };
}

export function reportCsvFilename(range: ReportRange): string {
  return `report-${range.from}-to-${range.to}.csv`;
}
