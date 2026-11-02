import { csvCell } from "@/lib/csv";
import { minorToDecimalString } from "@/lib/money";
import {
  REPORT_GRAIN_LABELS,
  type MoneyRecord,
  type ReportBreakdownRow,
  type ReportData,
} from "@/lib/reports";

function amount(record: MoneyRecord, currency: string): string {
  if (!currency) return "";
  return minorToDecimalString(record[currency] ?? 0n, currency);
}

function rowCurrencies(...records: (MoneyRecord | null)[]): string[] {
  const codes = new Set<string>();
  for (const record of records) {
    if (!record) continue;
    for (const [currency, value] of Object.entries(record)) {
      if (value !== 0n) codes.add(currency);
    }
  }
  return [...codes].sort();
}

function breakdownLines(
  push: (...cells: (string | number | bigint)[]) => void,
  title: string,
  rows: ReportBreakdownRow[],
  includeProfit: boolean,
): void {
  push(title);
  push(
    "Name",
    "Currency",
    "Accepted quotations",
    "Accepted value",
    ...(includeProfit ? ["Profit"] : []),
  );
  if (rows.length === 0) {
    push("No accepted quotations in this period");
    return;
  }
  for (const row of rows) {
    const currencies = rowCurrencies(row.value, row.profit);
    for (const currency of currencies.length > 0 ? currencies : [""]) {
      push(
        row.name,
        currency || "—",
        row.quotations,
        currency ? amount(row.value, currency) : "",
        ...(includeProfit ? [currency && row.profit ? amount(row.profit, currency) : ""] : []),
      );
    }
  }
}

/** One CSV with summary, period trend and the three breakdowns. */
export function buildReportCsv(data: ReportData, companyName = "Travel Agency"): string {
  const lines: string[] = [];
  const push = (...cells: (string | number | bigint)[]) => {
    lines.push(cells.map(csvCell).join(","));
  };

  push(`${companyName} quotation report`);
  push("Period", data.range.label);
  push("From", data.range.from);
  push("To", data.range.to);
  push("Grouped by", REPORT_GRAIN_LABELS[data.range.grain]);
  push(
    "Amounts",
    "Each amount is in the currency shown; no exchange-rate conversion is applied.",
  );
  if (data.summary.frozenMissing > 0) {
    push(
      "Note",
      `${data.summary.frozenMissing} accepted quotation(s) had no frozen totals and are counted but not valued.`,
    );
  }
  if (!data.includeProfit) push("Note", "Cost and profit figures are hidden for this role.");
  lines.push("");

  push("Summary");
  push(
    "Currency",
    "Quotations created",
    "Quotations sent",
    "Quotations accepted",
    "Pro formas issued",
    "Accepted value",
    "Pro forma value",
    "Payments gross",
    "Payments reversed",
    "Payments net",
    "Outstanding",
    ...(data.includeProfit ? ["Profit"] : []),
  );
  const currencies = data.currencies.length > 0 ? data.currencies : [""];
  for (const currency of currencies) {
    push(
      currency || "—",
      data.summary.quotationsCreated,
      data.summary.quotationsSent,
      data.summary.quotationsAccepted,
      data.summary.proformasIssued,
      currency ? amount(data.summary.acceptedValue, currency) : "",
      currency ? amount(data.summary.proformaValue, currency) : "",
      currency ? amount(data.summary.paymentsGross, currency) : "",
      currency ? amount(data.summary.paymentsReversed, currency) : "",
      currency ? amount(data.summary.paymentsNet, currency) : "",
      currency ? amount(data.summary.outstanding, currency) : "",
      ...(data.includeProfit
        ? [currency && data.summary.profit ? amount(data.summary.profit, currency) : ""]
        : []),
    );
  }
  lines.push("");

  push("Period breakdown");
  push(
    "Period",
    "Currency",
    "Quotations created",
    "Quotations sent",
    "Quotations accepted",
    "Pro formas issued",
    "Accepted value",
    "Payments net",
    ...(data.includeProfit ? ["Profit"] : []),
  );
  for (const row of data.trend) {
    const rowCodes = rowCurrencies(row.acceptedValue, row.payments, row.profit);
    for (const currency of rowCodes.length > 0 ? rowCodes : [""]) {
      push(
        row.label,
        currency || "—",
        row.quotations,
        row.sent,
        row.accepted,
        row.proformas,
        currency ? amount(row.acceptedValue, currency) : "",
        currency ? amount(row.payments, currency) : "",
        ...(data.includeProfit ? [currency && row.profit ? amount(row.profit, currency) : ""] : []),
      );
    }
  }
  lines.push("");

  breakdownLines(push, "By customer", data.byCustomer, data.includeProfit);
  lines.push("");
  breakdownLines(push, "By branch", data.byBranch, data.includeProfit);
  lines.push("");
  breakdownLines(push, "By airline (first flight)", data.byAirline, data.includeProfit);

  return `${lines.join("\r\n")}\r\n`;
}
