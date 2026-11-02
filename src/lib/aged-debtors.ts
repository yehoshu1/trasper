/**
 * Aged debtors and instalment schedules .
 *
 * Age is derived from the pro forma due date and the outstanding balance
 * (total minus payments, reversals included because they are negative rows).
 * Nothing here is a typed status: the schedule is only a target and the
 * pro forma status stays derived from the payments.
 */

export const AGE_BUCKETS = ["current", "1-30", "31-60", "61-90", "90+"] as const;
export type AgeBucket = (typeof AGE_BUCKETS)[number];

export const AGE_BUCKET_LABELS: Record<AgeBucket, string> = {
  current: "Current",
  "1-30": "1–30 days",
  "31-60": "31–60 days",
  "61-90": "61–90 days",
  "90+": "90+ days",
};

export interface AgedDebtorInput {
  /** Caller's identifier, carried through to the row for linking. */
  ref?: string;
  currency: string;
  totalMinor: bigint;
  paidMinor: bigint;
  dueDate: Date | null;
  issueDate: Date;
  cancelled?: boolean;
}

export interface AgedDebtorRow extends AgedDebtorInput {
  balanceMinor: bigint;
  ageDays: number;
  bucket: AgeBucket;
}

export interface AgedDebtorBucket {
  bucket: AgeBucket;
  label: string;
  amounts: Map<string, bigint>;
  count: number;
}

export interface AgedDebtorReport {
  rows: AgedDebtorRow[];
  buckets: AgedDebtorBucket[];
  totals: Map<string, bigint>;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days between the due date and the as-at date, in UTC calendar days. */
export function ageInDays(dueDate: Date | null, issueDate: Date, asOf: Date): number {
  const anchor = startOfUtcDay(dueDate ?? issueDate);
  const today = startOfUtcDay(asOf);
  return Math.floor((today.getTime() - anchor.getTime()) / DAY_MS);
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** Current = not yet due; then 30-day ladder with an open-ended 90+ bucket. */
export function ageBucket(ageDays: number): AgeBucket {
  if (ageDays <= 0) return "current";
  if (ageDays <= 30) return "1-30";
  if (ageDays <= 60) return "31-60";
  if (ageDays <= 90) return "61-90";
  return "90+";
}

export function buildAgedDebtorReport(inputs: AgedDebtorInput[], asOf: Date): AgedDebtorReport {
  const rows: AgedDebtorRow[] = [];
  const totals = new Map<string, bigint>();
  const buckets = AGE_BUCKETS.map((bucket) => ({
    bucket,
    label: AGE_BUCKET_LABELS[bucket],
    amounts: new Map<string, bigint>(),
    count: 0,
  }));

  for (const input of inputs) {
    if (input.cancelled) continue;
    const balanceMinor = input.totalMinor - input.paidMinor;
    if (balanceMinor <= 0n) continue;
    const days = ageInDays(input.dueDate, input.issueDate, asOf);
    const bucket = ageBucket(days);
    rows.push({ ...input, balanceMinor, ageDays: days, bucket });
    totals.set(input.currency, (totals.get(input.currency) ?? 0n) + balanceMinor);
    const bucketRow = buckets.find((entry) => entry.bucket === bucket);
    if (bucketRow) {
      bucketRow.amounts.set(input.currency, (bucketRow.amounts.get(input.currency) ?? 0n) + balanceMinor);
      bucketRow.count += 1;
    }
  }

  rows.sort((a, b) => b.ageDays - a.ageDays || a.currency.localeCompare(b.currency));
  return { rows, buckets, totals };
}

export interface InstalmentTarget {
  id: string;
  label: string;
  dueDate: Date;
  amountMinor: bigint;
}

export interface InstalmentProgress extends InstalmentTarget {
  paidMinor: bigint;
  outstandingMinor: bigint;
  state: "paid" | "part_paid" | "due" | "overdue";
}

/**
 * Apply payments to the schedule oldest instalment first. This is only a
 * target: the pro forma status always comes from deriveStatus.
 */
export function applyPaymentsToSchedule(
  instalments: InstalmentTarget[],
  paymentsTotalMinor: bigint,
  asOf: Date,
): InstalmentProgress[] {
  let remaining = paymentsTotalMinor < 0n ? 0n : paymentsTotalMinor;
  return [...instalments]
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())
    .map((instalment) => {
      const paidMinor = remaining >= instalment.amountMinor ? instalment.amountMinor : remaining;
      remaining -= paidMinor;
      const outstandingMinor = instalment.amountMinor - paidMinor;
      const overdue = startOfUtcDay(instalment.dueDate).getTime() < startOfUtcDay(asOf).getTime();
      const state: InstalmentProgress["state"] =
        outstandingMinor <= 0n ? "paid" : paidMinor > 0n ? "part_paid" : overdue ? "overdue" : "due";
      return { ...instalment, paidMinor, outstandingMinor, state };
    });
}
