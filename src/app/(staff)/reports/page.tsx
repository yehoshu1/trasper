import { Button } from "@/components/ui/button";

import { DatePicker } from "@/components/ui/date-picker";

import Link from "next/link";

import { Alert, Card, EmptyState, Money, PageHeader, StatCard } from "@/components/ui";
import { SelectField } from "@/components/ui/select";
import { hasCapability } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import {
  marginPercent,
  REPORT_GRAIN_LABELS,
  REPORT_GRAIN_OPTIONS,
  REPORT_PERIOD_OPTIONS,
  resolveReportRange,
  type MoneyRecord,
  type ReportBreakdownRow,
  type ReportData,
} from "@/lib/reports";
import { requireCapableUser } from "@/server/auth";
import { loadReport } from "@/server/reports";

export const dynamic = "force-dynamic";

function MoneyTotals({
  values,
  className = "",
  empty = "—",
}: {
  values: MoneyRecord;
  className?: string;
  empty?: string;
}) {
  const entries = Object.entries(values)
    .filter(([, amount]) => amount !== 0n)
    .sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) {
    return <span className={cn("text-muted-foreground", className)}>{empty}</span>;
  }
  return (
    <span className={cn("block space-y-0.5 tabular-nums", className)}>
      {entries.map(([currency, amount]) => (
        <span key={currency} className="block">
          <Money amountMinor={amount} currency={currency} />
        </span>
      ))}
    </span>
  );
}

function ProfitTotals({
  profit,
  value,
}: {
  profit: MoneyRecord;
  value: MoneyRecord;
}) {
  const entries = Object.entries(profit)
    .filter(([, amount]) => amount !== 0n)
    .sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <span className="block space-y-0.5">
      {entries.map(([currency, amount]) => (
        <span key={currency} className="flex flex-wrap items-baseline gap-1.5">
          <Money amountMinor={amount} currency={currency} />
          <span className="text-xs font-normal text-muted-foreground">
            {marginPercent(amount, value[currency] ?? 0n).toFixed(1)}%
          </span>
        </span>
      ))}
    </span>
  );
}

function BreakdownTable({
  title,
  subtitle,
  rows,
  includeProfit,
  empty,
}: {
  title: string;
  subtitle: string;
  rows: ReportBreakdownRow[];
  includeProfit: boolean;
  empty: string;
}) {
  return (
    <Card title={title} subtitle={subtitle}>
      {rows.length === 0 ? (
        <EmptyState title={empty} />
      ) : (
        <div className="overflow-x-auto">
          <table className="table min-w-[34rem]">
            <thead>
              <tr>
                <th>Name</th>
                <th className="w-20 text-right">Accepted</th>
                <th className="text-right">Accepted value</th>
                {includeProfit ? <th className="text-right">Profit</th> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key}>
                  <td className="font-medium">{row.name}</td>
                  <td className="text-right tabular-nums">{row.quotations}</td>
                  <td className="text-right">
                    <MoneyTotals values={row.value} className="inline-block text-right" />
                  </td>
                  {includeProfit ? (
                    <td className="text-right">
                      <ProfitTotals profit={row.profit ?? {}} value={row.value} />
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function TrendTable({ data }: { data: ReportData }) {
  const { summary, trend, includeProfit } = data;
  return (
    <Card
      title="Period breakdown"
      subtitle={`Grouped by ${REPORT_GRAIN_LABELS[data.range.grain].toLowerCase()}`}
    >
      <div className="overflow-x-auto">
        <table className="table min-w-[58rem]">
          <thead>
            <tr>
              <th>Period</th>
              <th className="w-20 text-right">Created</th>
              <th className="w-20 text-right">Sent</th>
              <th className="w-20 text-right">Accepted</th>
              <th className="w-24 text-right">Pro formas</th>
              <th className="text-right">Accepted value</th>
              <th className="text-right">Payments net</th>
              {includeProfit ? <th className="text-right">Profit</th> : null}
            </tr>
          </thead>
          <tbody>
            {trend.map((row) => (
              <tr key={row.key}>
                <td className="font-medium">{row.label}</td>
                <td className="text-right tabular-nums">{row.quotations}</td>
                <td className="text-right tabular-nums">{row.sent}</td>
                <td className="text-right tabular-nums">{row.accepted}</td>
                <td className="text-right tabular-nums">{row.proformas}</td>
                <td className="text-right">
                  <MoneyTotals values={row.acceptedValue} className="inline-block text-right" />
                </td>
                <td className="text-right">
                  <MoneyTotals values={row.payments} className="inline-block text-right" />
                </td>
                {includeProfit ? (
                  <td className="text-right">
                    <ProfitTotals profit={row.profit ?? {}} value={row.acceptedValue} />
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border font-semibold">
              <td>Total</td>
              <td className="text-right tabular-nums">{summary.quotationsCreated}</td>
              <td className="text-right tabular-nums">{summary.quotationsSent}</td>
              <td className="text-right tabular-nums">{summary.quotationsAccepted}</td>
              <td className="text-right tabular-nums">{summary.proformasIssued}</td>
              <td className="text-right">
                <MoneyTotals values={summary.acceptedValue} className="inline-block text-right" />
              </td>
              <td className="text-right">
                <MoneyTotals values={summary.paymentsNet} className="inline-block text-right" />
              </td>
              {includeProfit ? (
                <td className="text-right">
                  <ProfitTotals
                    profit={summary.profit ?? {}}
                    value={summary.acceptedValue}
                  />
                </td>
              ) : null}
            </tr>
          </tfoot>
        </table>
      </div>
    </Card>
  );
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string; grain?: string }>;
}) {
  const user = await requireCapableUser("viewReports");
  const params = await searchParams;
  const range = resolveReportRange(params);
  const includeProfit = hasCapability(user, "viewCosts");
  const data = await loadReport(range, { includeProfit });

  const exportParams = new URLSearchParams({
    period: range.period,
    from: range.from,
    to: range.to,
    grain: range.grain,
  });

  return (
    <div>
      <PageHeader
        eyebrow="Overview"
        title="Reports"
        subtitle={`${range.label} · amounts are shown in each document's currency`}
        actions={
          <a href={`/api/reports/export?${exportParams.toString()}`} className="btn-secondary">
            Export CSV
          </a>
        }
      />

      <form className="no-print mb-2 flex flex-wrap items-end gap-2" method="get">
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Period
          <SelectField
            name="period"
            defaultValue={range.period}
            className="mt-1 w-44"
            options={REPORT_PERIOD_OPTIONS.map(([value, label]) => ({ value, label }))}
          />
        </label>
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          From
          <DatePicker name="from" defaultValue={range.from} className="mt-1" />
        </label>
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          To
          <DatePicker name="to" defaultValue={range.to} className="mt-1" />
        </label>
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Group by
          <SelectField
            name="grain"
            defaultValue={range.grain}
            className="mt-1 w-32"
            options={REPORT_GRAIN_OPTIONS.map(([value, label]) => ({ value, label }))}
          />
        </label>
        <Button variant="secondary" type="submit">
          Apply
        </Button>
        <Link href="/reports" className="btn-ghost">
          Reset
        </Link>
      </form>
      <p className="no-print mb-6 text-xs text-muted-foreground">
        From and To apply only when Period is set to a custom range. Amounts are never converted
        between currencies.
      </p>

      {data.summary.frozenMissing > 0 ? (
        <Alert tone="warning" title="Some accepted quotations were not valued">
          {data.summary.frozenMissing} accepted quotation
          {data.summary.frozenMissing === 1 ? "" : "s"} had no frozen totals. They are counted but
          excluded from accepted value and profit.
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          label="Quotations"
          value={data.summary.quotationsCreated}
          hint={`${data.summary.quotationsSent} sent · ${data.summary.quotationsAccepted} accepted`}
        />
        <StatCard
          label="Accepted value"
          value={<MoneyTotals values={data.summary.acceptedValue} empty="0" />}
          hint={`${data.summary.quotationsAccepted} accepted quotation${
            data.summary.quotationsAccepted === 1 ? "" : "s"
          }`}
        />
        <StatCard
          label="Pro forma value"
          value={<MoneyTotals values={data.summary.proformaValue} empty="0" />}
          hint={`${data.summary.proformasIssued} pro forma${
            data.summary.proformasIssued === 1 ? "" : "s"
          } issued`}
        />
        <StatCard
          label="Payments received"
          value={<MoneyTotals values={data.summary.paymentsNet} empty="0" />}
          hint="Net of reversals"
        />
        <StatCard
          label="Outstanding"
          value={<MoneyTotals values={data.summary.outstanding} empty="0" />}
          hint="At period end"
        />
        {includeProfit ? (
          <StatCard
            label="Gross profit"
            value={
              <ProfitTotals
                profit={data.summary.profit ?? {}}
                value={data.summary.acceptedValue}
              />
            }
            hint="Markup only; VAT excluded"
          />
        ) : null}
      </div>

      <div className="mt-4">
        <TrendTable data={data} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <BreakdownTable
          title="By customer"
          subtitle="Accepted quotations in the selected period"
          rows={data.byCustomer}
          includeProfit={includeProfit}
          empty="No accepted quotations in this period"
        />
        <BreakdownTable
          title="By branch"
          subtitle="Accepted quotations in the selected period"
          rows={data.byBranch}
          includeProfit={includeProfit}
          empty="No accepted quotations in this period"
        />
      </div>

      <div className="mt-4">
        <BreakdownTable
          title="By airline"
          subtitle="Attributed to the first outbound flight of each accepted journey"
          rows={data.byAirline}
          includeProfit={includeProfit}
          empty="No accepted quotations in this period"
        />
      </div>

      {!includeProfit ? (
        <p className="mt-4 text-xs text-muted-foreground">
          Cost, markup and profit are hidden for your role.
        </p>
      ) : null}
    </div>
  );
}
