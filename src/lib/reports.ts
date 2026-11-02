import { DateTime } from "luxon";

import { appTimeZone } from "./dates";

/** Reporting periods and grouping used by the reports page and CSV export. */

export const REPORT_PERIOD_OPTIONS = [
  ["today", "Today"],
  ["week", "This week"],
  ["month", "This month"],
  ["quarter", "This quarter"],
  ["year", "This year"],
  ["last_year", "Last year"],
  ["last_3_years", "Last 3 years"],
  ["last_5_years", "Last 5 years"],
  ["custom", "Custom range"],
] as const;

export type ReportPeriod = (typeof REPORT_PERIOD_OPTIONS)[number][0];

export const REPORT_GRAIN_OPTIONS = [
  ["day", "Day"],
  ["week", "Week"],
  ["month", "Month"],
  ["quarter", "Quarter"],
  ["year", "Year"],
] as const;

export type ReportGrain = (typeof REPORT_GRAIN_OPTIONS)[number][0];

export interface ReportRange {
  period: ReportPeriod;
  grain: ReportGrain;
  /** Inclusive start, at the start of the day in the agency time zone. */
  start: DateTime;
  /** Exclusive end. */
  endExclusive: DateTime;
  /** Inclusive ISO dates for the form and links. */
  from: string;
  to: string;
  label: string;
  periodLabel: string;
}

export type MoneyRecord = Record<string, bigint>;

export interface ReportSummary {
  quotationsCreated: number;
  quotationsSent: number;
  quotationsAccepted: number;
  proformasIssued: number;
  acceptedValue: MoneyRecord;
  proformaValue: MoneyRecord;
  paymentsGross: MoneyRecord;
  paymentsReversed: MoneyRecord;
  paymentsNet: MoneyRecord;
  outstanding: MoneyRecord;
  profit: MoneyRecord | null;
  frozenMissing: number;
}

export interface ReportTrendRow {
  key: string;
  label: string;
  quotations: number;
  sent: number;
  accepted: number;
  proformas: number;
  acceptedValue: MoneyRecord;
  payments: MoneyRecord;
  profit: MoneyRecord | null;
}

export interface ReportBreakdownRow {
  key: string;
  name: string;
  quotations: number;
  value: MoneyRecord;
  profit: MoneyRecord | null;
}

export interface ReportData {
  range: ReportRange;
  summary: ReportSummary;
  trend: ReportTrendRow[];
  byCustomer: ReportBreakdownRow[];
  byBranch: ReportBreakdownRow[];
  byAirline: ReportBreakdownRow[];
  currencies: string[];
  includeProfit: boolean;
}

export const REPORT_PERIOD_LABELS = Object.fromEntries(
  REPORT_PERIOD_OPTIONS,
) as Record<ReportPeriod, string>;

export const REPORT_GRAIN_LABELS = Object.fromEntries(
  REPORT_GRAIN_OPTIONS,
) as Record<ReportGrain, string>;

function isReportPeriod(value: string | undefined): value is ReportPeriod {
  return REPORT_PERIOD_OPTIONS.some(([period]) => period === value);
}

function isReportGrain(value: string | undefined): value is ReportGrain {
  return REPORT_GRAIN_OPTIONS.some(([grain]) => grain === value);
}

function parseDate(value: string | undefined): DateTime | null {
  if (!value) return null;
  const date = DateTime.fromFormat(value, "yyyy-LL-dd", { zone: appTimeZone() });
  return date.isValid ? date.startOf("day") : null;
}

function defaultGrain(start: DateTime, endExclusive: DateTime): ReportGrain {
  const days = Math.ceil(endExclusive.diff(start, "days").days);
  if (days <= 31) return "day";
  if (days <= 120) return "week";
  if (days <= 400) return "month";
  if (days <= 800) return "quarter";
  return "year";
}

export function resolveReportRange(
  input: { period?: string; from?: string; to?: string; grain?: string },
  now: DateTime = DateTime.now().setZone(appTimeZone()),
): ReportRange {
  const today = now.startOf("day");
  let period: ReportPeriod = isReportPeriod(input.period) ? input.period : "month";
  let start: DateTime;
  let endExclusive: DateTime;

  switch (period) {
    case "today":
      start = today;
      endExclusive = today.plus({ days: 1 });
      break;
    case "week":
      start = today.startOf("week");
      endExclusive = start.plus({ weeks: 1 });
      break;
    case "quarter":
      start = today.startOf("quarter");
      endExclusive = start.plus({ quarters: 1 });
      break;
    case "year":
      start = today.startOf("year");
      endExclusive = start.plus({ years: 1 });
      break;
    case "last_year":
      start = today.startOf("year").minus({ years: 1 });
      endExclusive = today.startOf("year");
      break;
    case "last_3_years":
      start = today.startOf("year").minus({ years: 2 });
      endExclusive = today.startOf("year").plus({ years: 1 });
      break;
    case "last_5_years":
      start = today.startOf("year").minus({ years: 4 });
      endExclusive = today.startOf("year").plus({ years: 1 });
      break;
    case "custom": {
      const from = parseDate(input.from);
      const to = parseDate(input.to);
      if (from && to) {
        const first = from <= to ? from : to;
        const last = from <= to ? to : from;
        start = first;
        endExclusive = last.plus({ days: 1 });
      } else {
        period = "month";
        start = today.startOf("month");
        endExclusive = start.plus({ months: 1 });
      }
      break;
    }
    case "month":
    default:
      period = "month";
      start = today.startOf("month");
      endExclusive = start.plus({ months: 1 });
      break;
  }

  const grain = isReportGrain(input.grain)
    ? input.grain
    : defaultGrain(start, endExclusive);
  const to = endExclusive.minus({ days: 1 });
  const periodLabel = REPORT_PERIOD_LABELS[period];
  const rangeLabel = `${start.toFormat("dd LLL yyyy")} – ${to.toFormat("dd LLL yyyy")}`;

  return {
    period,
    grain,
    start,
    endExclusive,
    from: start.toISODate() ?? "",
    to: to.toISODate() ?? "",
    label: `${periodLabel} · ${rangeLabel}`,
    periodLabel,
  };
}

function bucketStart(value: DateTime, grain: ReportGrain): DateTime {
  switch (grain) {
    case "week":
      return value.startOf("week");
    case "month":
      return value.startOf("month");
    case "quarter":
      return value.startOf("quarter");
    case "year":
      return value.startOf("year");
    case "day":
    default:
      return value.startOf("day");
  }
}

function nextBucket(value: DateTime, grain: ReportGrain): DateTime {
  switch (grain) {
    case "week":
      return value.plus({ weeks: 1 });
    case "month":
      return value.plus({ months: 1 });
    case "quarter":
      return value.plus({ quarters: 1 });
    case "year":
      return value.plus({ years: 1 });
    case "day":
    default:
      return value.plus({ days: 1 });
  }
}

export function bucketKey(date: Date | DateTime, grain: ReportGrain): string {
  const local = (date instanceof DateTime ? date : DateTime.fromJSDate(date)).setZone(appTimeZone());
  switch (grain) {
    case "week":
      return local.toFormat("kkkk-'W'WW");
    case "month":
      return local.toFormat("yyyy-LL");
    case "quarter":
      return local.toFormat("yyyy-'Q'q");
    case "year":
      return local.toFormat("yyyy");
    case "day":
    default:
      return local.toFormat("yyyy-LL-dd");
  }
}

function bucketLabel(value: DateTime, grain: ReportGrain): string {
  switch (grain) {
    case "week":
      return `w/c ${value.toFormat("dd LLL yyyy")}`;
    case "month":
      return value.toFormat("LLL yyyy");
    case "quarter":
      return value.toFormat("'Q'q yyyy");
    case "year":
      return value.toFormat("yyyy");
    case "day":
    default:
      return value.toFormat("dd LLL yyyy");
  }
}

export interface ReportBucket {
  key: string;
  label: string;
}

export function buildReportBuckets(
  start: DateTime,
  endExclusive: DateTime,
  grain: ReportGrain,
): ReportBucket[] {
  const buckets: ReportBucket[] = [];
  let cursor = bucketStart(start, grain);
  let guard = 0;
  while (cursor < endExclusive && guard < 5000) {
    buckets.push({ key: bucketKey(cursor, grain), label: bucketLabel(cursor, grain) });
    cursor = nextBucket(cursor, grain);
    guard += 1;
  }
  return buckets;
}

export function addMoney(target: MoneyRecord, currency: string, amount: bigint): void {
  target[currency] = (target[currency] ?? 0n) + amount;
}

export function mergeMoney(target: MoneyRecord, source: MoneyRecord): void {
  for (const [currency, amount] of Object.entries(source)) {
    addMoney(target, currency, amount);
  }
}

export function moneyCurrencies(...records: (MoneyRecord | null)[]): string[] {
  const codes = new Set<string>();
  for (const record of records) {
    if (!record) continue;
    for (const currency of Object.keys(record)) codes.add(currency);
  }
  return [...codes].sort();
}

/** Gross margin as a percentage of the accepted value. Display only. */
export function marginPercent(profitMinor: bigint, valueMinor: bigint): number {
  if (valueMinor <= 0n) return 0;
  return Number((profitMinor * 10000n) / valueMinor) / 100;
}
