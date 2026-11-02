import { Button } from "@/components/ui/button";

import { Input } from "@/components/ui/input";

import { DatePicker } from "@/components/ui/date-picker";

import Link from "next/link";

import { PaymentsTable, type PaymentTableRow } from "@/components/list-tables";
import { EmptyState, Money, PageHeader, StatCard } from "@/components/ui";
import { formatDate, formatDateTime } from "@/lib/dates";
import { paymentTermOptions } from "@/lib/schemas";
import { parseSavedView } from "@/lib/saved-views";
import { requireCapableUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { getSettings } from "@/server/settings";

export const dynamic = "force-dynamic";

const METHOD_LABELS = Object.fromEntries(paymentTermOptions);

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; method?: string; q?: string }>;
}) {
  const user = await requireCapableUser("viewPaymentLedger");
  const settings = await getSettings();
  const params = await searchParams;
  const from = params.from?.match(/^\d{4}-\d{2}-\d{2}$/) ? params.from : "";
  const to = params.to?.match(/^\d{4}-\d{2}-\d{2}$/) ? params.to : "";
  const method = paymentTermOptions.some(([value]) => value === params.method) ? params.method : "";
  const initialSearch = (params.q ?? "").trim();

  const dateFilter =
    from || to
      ? {
          paidOn: {
            ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}),
            ...(to ? { lte: new Date(`${to}T00:00:00.000Z`) } : {}),
          },
        }
      : {};

  const savedView = await prisma.savedTableView.findUnique({
    where: { userId_listKey: { userId: user.id, listKey: "payments" } },
  });

  const payments = await prisma.payment.findMany({
    where: dateFilter,
    include: {
      proforma: { include: { quotation: { include: { contact: true } } } },
      recordedBy: { select: { name: true } },
    },
    orderBy: [{ paidOn: "desc" }, { createdAt: "desc" }],
    take: 1000,
  });

  const received = payments
    .filter((payment) => payment.amountMinor > 0n)
    .reduce((sum, payment) => sum + payment.amountMinor, 0n);
  const reversed = payments
    .filter((payment) => payment.amountMinor < 0n)
    .reduce((sum, payment) => sum + payment.amountMinor, 0n);
  const byMethod = new Map<string, bigint>();
  for (const payment of payments) {
    byMethod.set(payment.method, (byMethod.get(payment.method) ?? 0n) + payment.amountMinor);
  }

  const rows: PaymentTableRow[] = payments.map((payment) => ({
    id: payment.id,
    paidOnIso: payment.paidOn.toISOString(),
    paidOn: formatDate(payment.paidOn),
    proformaId: payment.proformaId,
    proformaNumber: payment.proforma.number,
    quotationNumber: payment.proforma.quotation.number,
    customerName: payment.proforma.quotation.contact.name,
    method: payment.method,
    methodLabel: METHOD_LABELS[payment.method] ?? payment.method,
    reference: payment.reference ?? "",
    recordedBy: payment.recordedBy.name,
    recordedAt: formatDateTime(payment.createdAt),
    amountMinor: payment.amountMinor.toString(),
    currency: payment.proforma.currency,
    reversal: payment.amountMinor < 0n,
  }));

  return (
    <div>
      <PageHeader
        eyebrow="Money"
        title="Payment ledger"
        subtitle="Every receipt and reversal, append-only. Correct a mistake with a reversing entry."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Received in this view" value={<Money amountMinor={received} currency={settings.baseCurrency} />} />
        <StatCard label="Reversed in this view" value={<Money amountMinor={reversed} currency={settings.baseCurrency} />} />
        <StatCard
          label="Net"
          value={<Money amountMinor={received + reversed} currency={settings.baseCurrency} />}
          hint={`${payments.length} entries`}
        />
      </div>

      <form className="mb-4 flex flex-wrap items-end gap-2" method="get">
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          From
          <DatePicker name="from" defaultValue={from} className="mt-1" />
        </label>
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          To
          <DatePicker name="to" defaultValue={to} className="mt-1" />
        </label>
        {initialSearch ? <Input type="hidden" name="q" value={initialSearch} /> : null}
        {method ? <Input type="hidden" name="method" value={method} /> : null}
        <Button variant="secondary" type="submit">
          Apply dates
        </Button>
        {from || to || method || initialSearch ? (
          <Link href="/payments" className="btn-ghost">
            Clear
          </Link>
        ) : null}
      </form>

      {byMethod.size > 0 ? (
        <div className="mb-4 flex flex-wrap gap-2 text-xs">
          {[...byMethod.entries()].map(([key, total]) => (
            <span key={key} className="rounded-full border border-border bg-card px-3 py-1 text-muted-foreground">
              {METHOD_LABELS[key] ?? key}: <Money amountMinor={total} currency={settings.baseCurrency} />
            </span>
          ))}
        </div>
      ) : null}

      {payments.length === 0 ? (
        <EmptyState title="No payments match">Record a payment from a pro forma page.</EmptyState>
      ) : (
        <PaymentsTable
          rows={rows}
          initialSearch={initialSearch}
          initialMethod={method}
          initialView={parseSavedView(savedView?.state)}
        />
      )}
    </div>
  );
}
