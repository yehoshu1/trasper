import Link from "next/link";

import { Card, EmptyState, Money, PageHeader } from "@/components/ui";
import { requireCapableUser } from "@/server/auth";
import { loadAgedDebtors } from "@/server/aged-debtors";

export const dynamic = "force-dynamic";

function MoneyLines({ values }: { values: Map<string, bigint> }) {
  const entries = [...values.entries()].filter(([, amount]) => amount !== 0n).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="block space-y-0.5">
      {entries.map(([currency, amount]) => (
        <span key={currency} className="block">
          <Money amountMinor={amount} currency={currency} />
        </span>
      ))}
    </span>
  );
}

export default async function AgedDebtorsPage() {
  await requireCapableUser("viewReports");
  const report = await loadAgedDebtors();

  return (
    <div>
      <PageHeader
        eyebrow="Reports"
        title="Aged debtors"
        subtitle="Outstanding pro forma balances by age. Status and balances are derived from the payments, never typed."
        actions={
          <>
            <Link href="/reports" className="btn-secondary">Reports</Link>
            <a href="/api/reports/aged-debtors" className="btn-secondary">Export CSV</a>
          </>
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {report.buckets.map((bucket) => (
          <div key={bucket.bucket} className="card card-body">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{bucket.label}</p>
            <p className="mt-1 text-lg font-bold">
              <MoneyLines values={bucket.amounts} />
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {bucket.count} pro forma{bucket.count === 1 ? "" : "s"}
            </p>
          </div>
        ))}
      </div>

      <Card title="Outstanding balances" subtitle="Oldest first">
        {report.list.length === 0 ? (
          <EmptyState title="No outstanding balances">Every pro forma in this view is paid or cancelled.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="table min-w-[760px]">
              <thead>
                <tr>
                  <th>Pro forma</th>
                  <th>Customer</th>
                  <th>Due</th>
                  <th className="text-right">Age</th>
                  <th>Bucket</th>
                  <th className="text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {report.list.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <Link href={`/proformas/${row.id}`} className="font-semibold">
                        {row.number || "—"}
                      </Link>
                    </td>
                    <td>
                      <Link href={`/customers/${row.customerId}`} className="text-muted-foreground hover:text-foreground">
                        {row.customerName || "—"}
                      </Link>
                    </td>
                    <td>{row.dueDate}</td>
                    <td className="text-right tabular-nums">
                      {row.ageDays <= 0 ? `${Math.abs(row.ageDays)} days early` : `${row.ageDays} days`}
                    </td>
                    <td>{row.bucket}</td>
                    <td className="text-right font-medium">
                      <Money amountMinor={row.balanceMinor} currency={row.currency} />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border font-semibold">
                  <td colSpan={5}>Total outstanding</td>
                  <td className="text-right"><MoneyLines values={report.totals} /></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
