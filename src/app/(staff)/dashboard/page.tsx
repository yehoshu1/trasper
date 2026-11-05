import Link from "next/link";

import { DateTime } from "luxon";

import { Card, EmptyState, Money, PageHeader, StatCard, StatusBadge } from "@/components/ui";
import {
  MethodBars,
  ProformaMixCard,
  QuotationVolumeChart,
} from "@/components/dashboard-charts";
import { formatDate, appTimeZone, timeZoneLabel } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { hasCapability } from "@/lib/permissions";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { expireOverdueQuotations } from "@/server/quotations";
import { prioritisedFollowUps } from "@/server/followups";
import { getSettings } from "@/server/settings";

export const dynamic = "force-dynamic";

const METHOD_LABELS: Record<string, string> = {
  cash: "Cash",
  bank_transfer: "Bank transfer",
  mobile_money: "Mobile money",
  cheque: "Cheque",
  card: "Card",
};

export default async function DashboardPage() {
  const user = await requireUser();
  const settings = await getSettings();
  await expireOverdueQuotations();

  const now = new Date();
  const soon = DateTime.now().setZone(appTimeZone()).plus({ days: 3 }).toJSDate();
  const deadlineCutoff = DateTime.now().plus({ hours: settings.ticketingWarningHours }).toJSDate();
  const sixMonthsAgo = DateTime.now().minus({ months: 5 }).startOf("month").toJSDate();

  const [awaiting, expiring, deadlines, openProformas] = await Promise.all([
    prisma.quotation.findMany({
      where: { status: "sent" },
      include: { contact: true },
      orderBy: { sentAt: "desc" },
      take: 8,
    }),
    prisma.quotation.findMany({
      where: { status: "sent", validUntil: { lte: soon } },
      include: { contact: true },
      orderBy: { validUntil: "asc" },
      take: 8,
    }),
    prisma.quoteOption.findMany({
      where: {
        ticketingDeadline: { gte: now, lte: deadlineCutoff },
        quotation: { status: { in: ["draft", "sent"] } },
      },
      include: { quotation: { include: { contact: true } } },
      orderBy: { ticketingDeadline: "asc" },
      take: 8,
    }),
    hasCapability(user, "viewCosts")
      ? prisma.proforma.findMany({
          where: { status: { in: ["unpaid", "part_paid"] } },
          include: { quotation: { include: { contact: true } }, payments: true },
          orderBy: { issueDate: "asc" },
          take: 8,
        })
      : Promise.resolve([]),
  ]);

  const followUps = await prioritisedFollowUps(5);

  const [awaitingCount, expiringCount, deadlineCount, recentQuotations, proformaGroups, paymentGroups] =
    await Promise.all([
      prisma.quotation.count({ where: { status: "sent" } }),
      prisma.quotation.count({ where: { status: "sent", validUntil: { lte: soon } } }),
      prisma.quoteOption.count({
        where: {
          ticketingDeadline: { gte: now, lte: deadlineCutoff },
          quotation: { status: { in: ["draft", "sent"] } },
        },
      }),
      prisma.quotation.findMany({
        where: { createdAt: { gte: sixMonthsAgo } },
        select: { createdAt: true, status: true },
        orderBy: { createdAt: "asc" },
      }),
      hasCapability(user, "viewCosts")
        ? prisma.proforma.groupBy({
            by: ["status"],
            _count: { _all: true },
            _sum: { totalMinor: true },
          })
        : Promise.resolve([] as { status: string; _count: { _all: number }; _sum: { totalMinor: bigint | null } }[]),
      hasCapability(user, "viewCosts")
        ? prisma.payment.groupBy({
            by: ["method"],
            _count: { _all: true },
            _sum: { amountMinor: true },
          })
        : Promise.resolve([] as { method: string; _count: { _all: number }; _sum: { amountMinor: bigint | null } }[]),
    ]);

  const unpaidTotal = openProformas.reduce(
    (sum, proforma) =>
      sum +
      proforma.totalMinor -
      proforma.payments.reduce((paid, payment) => paid + payment.amountMinor, 0n),
    0n,
  );

  // Monthly quotation volume for the bar chart (last 6 months).
  const monthKeys: string[] = [];
  const monthLabels: string[] = [];
  for (let i = 5; i >= 0; i -= 1) {
    const dt = DateTime.now().minus({ months: i });
    monthKeys.push(dt.toFormat("yyyy-MM"));
    monthLabels.push(dt.toFormat("LLL"));
  }
  const monthly = monthKeys.map((key, index) => ({ month: monthLabels[index], quotations: 0, accepted: 0 }));
  for (const quotation of recentQuotations) {
    const key = DateTime.fromJSDate(quotation.createdAt).toFormat("yyyy-MM");
    const bucket = monthKeys.indexOf(key);
    if (bucket === -1) continue;
    monthly[bucket].quotations += 1;
    if (quotation.status === "accepted") monthly[bucket].accepted += 1;
  }

  const statusMeta: Record<string, string> = {
    draft: "Draft",
    unpaid: "Unpaid",
    part_paid: "Part-paid",
    paid: "Paid",
    cancelled: "Cancelled",
  };
  const mixOrder = ["paid", "part_paid", "unpaid", "draft", "cancelled"];
  const mix = mixOrder
    .map((status) => {
      const group = proformaGroups.find((entry) => entry.status === status);
      return {
        status,
        label: statusMeta[status] ?? status,
        count: group?._count._all ?? 0,
        amount: Number(group?._sum.totalMinor ?? 0n),
        currency: settings.baseCurrency,
      };
    })
    .filter((slice) => slice.label !== "Cancelled" || slice.count > 0);

  const receiptTotal = paymentGroups.reduce((sum, entry) => sum + (entry._sum.amountMinor ?? 0n), 0n);
  const methodRows = paymentGroups
    .map((entry) => ({
      method: entry.method,
      label: METHOD_LABELS[entry.method] ?? entry.method,
      amount: formatMoney(entry._sum.amountMinor ?? 0n, settings.baseCurrency),
      share: receiptTotal > 0n ? Number(entry._sum.amountMinor ?? 0n) / Number(receiptTotal) : 0,
    }))
    .sort((a, b) => b.share - a.share);

  const greeting =
    DateTime.now().setZone(appTimeZone()).hour < 12
      ? "Good morning"
      : DateTime.now().setZone(appTimeZone()).hour < 18
        ? "Good afternoon"
        : "Good evening";

  return (
    <div>
      <PageHeader
        title={`${greeting}, ${user.name.split(" ")[0]}`}
        subtitle={`${DateTime.now().setZone(appTimeZone()).toFormat("EEEE, d LLL yyyy")} · Branch ${user.branch}${user.branchName ? ` — ${user.branchName}` : ""} · ${timeZoneLabel(settings.timeZone)}`}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Awaiting reply"
          value={awaitingCount}
          hint="Sent quotations"
          delta={awaitingCount > 0 ? `+${awaitingCount} open` : undefined}
          href="/quotations?status=sent"
        />
        <StatCard
          label="Expiring soon"
          value={expiringCount}
          hint="Within three days"
          href="/quotations?filter=expiring"
        />
        <StatCard
          label={`Ticketing ${settings.ticketingWarningHours}h`}
          value={deadlineCount}
          hint="Airline deadlines"
          href="/quotations?filter=deadline"
        />
        {hasCapability(user, "viewCosts") ? (
          <StatCard
            label="Outstanding"
            value={<Money amountMinor={unpaidTotal} currency={settings.baseCurrency} />}
            hint={`${openProformas.length} open pro forma${openProformas.length === 1 ? "" : "s"}`}
            href="/proformas"
          />
        ) : (
          <StatCard label="Documents" value="View only" hint="Costs are hidden for your role" />
        )}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-7">
        <div className={hasCapability(user, "viewCosts") ? "lg:col-span-4" : "xl:col-span-7"}>
          <QuotationVolumeChart data={monthly} />
        </div>
        {hasCapability(user, "viewCosts") ? (
          <div className="lg:col-span-3">
            <ProformaMixCard slices={mix} totalLabel={formatMoney(unpaidTotal, settings.baseCurrency)} />
          </div>
        ) : null}
      </div>

      {deadlineCount > 0 ? (
        <div className="no-print mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:text-amber-200 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
          <p className="font-medium">Ticketing deadlines approaching</p>
          <p className="mt-0.5 text-[13px] opacity-90">
            {deadlineCount} option{deadlineCount === 1 ? "" : "s"} must be ticketed within{" "}
            {settings.ticketingWarningHours} hours. Open the quotation to see the exact time.
          </p>
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="min-w-0 space-y-4">
          <Card title="Next follow-ups" subtitle="Prioritised by expiry, deadlines and idle time">
            {followUps.length === 0 ? (
              <EmptyState title="Nothing to follow up" />
            ) : (
              <ul className="divide-y">
                {followUps.map((entry) => (
                  <li key={entry.quotationId} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <Link href={`/quotations/${entry.quotationId}`} className="text-[13px] font-medium">
                        {entry.number}
                      </Link>
                      <p className="truncate text-xs text-muted-foreground">{entry.customerName} · {entry.nextAction}</p>
                    </div>
                    <span className="shrink-0 text-xs font-semibold text-amber-600 dark:text-amber-400">{entry.score}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {hasCapability(user, "viewCosts") ? <MethodBars rows={methodRows} /> : null}
          <Card title="Awaiting reply" subtitle="Sent quotations, newest first">
            {awaiting.length === 0 ? (
              <EmptyState title="Nothing awaiting a reply" />
            ) : (
              <ul className="divide-y">
                {awaiting.map((quotation) => (
                  <li
                    key={quotation.id}
                    className="flex items-center justify-between gap-3 py-3 transition-colors hover:bg-muted/40"
                  >
                    <div className="min-w-0">
                      <Link href={`/quotations/${quotation.id}`} className="text-[13px] font-medium">
                        {quotation.number}
                      </Link>
                      <p className="truncate text-xs text-muted-foreground">{quotation.contact.name}</p>
                    </div>
                    <div className="shrink-0 text-right text-xs text-muted-foreground">
                      <StatusBadge status={quotation.status} />
                      <p className="mt-1">Valid until {formatDate(quotation.validUntil)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="min-w-0 space-y-4">
          <Card title="Expiring soon" subtitle="Valid-until within three days">
            {expiring.length === 0 ? (
              <EmptyState title="Nothing expiring soon" />
            ) : (
              <ul className="divide-y">
                {expiring.map((quotation) => (
                  <li
                    key={quotation.id}
                    className="flex items-center justify-between gap-3 py-3 transition-colors hover:bg-muted/40"
                  >
                    <div className="min-w-0">
                      <Link href={`/quotations/${quotation.id}`} className="text-[13px] font-medium">
                        {quotation.number}
                      </Link>
                      <p className="truncate text-xs text-muted-foreground">{quotation.contact.name}</p>
                    </div>
                    <p className="shrink-0 text-xs font-medium text-amber-600 dark:text-amber-400">
                      {formatDate(quotation.validUntil)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Ticketing deadlines" subtitle={`Next ${settings.ticketingWarningHours} hours`}>
            {deadlines.length === 0 ? (
              <EmptyState title="No ticketing deadlines in the window" />
            ) : (
              <ul className="divide-y">
                {deadlines.map((option) => (
                  <li
                    key={option.id}
                    className="flex items-center justify-between gap-3 py-3 transition-colors hover:bg-muted/40"
                  >
                    <div className="min-w-0">
                      <Link href={`/quotations/${option.quotationId}`} className="text-[13px] font-medium">
                        {option.quotation.number} · {option.label}
                      </Link>
                      <p className="truncate text-xs text-muted-foreground">
                        {option.quotation.contact.name}
                        {option.pnr ? ` · PNR ${option.pnr}` : ""}
                      </p>
                    </div>
                    <p className="shrink-0 text-xs font-medium text-amber-600 dark:text-amber-400">
                      {option.ticketingDeadline
                        ? DateTime.fromJSDate(option.ticketingDeadline)
                            .setZone(appTimeZone())
                            .toFormat("dd LLL, HH:mm")
                        : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {hasCapability(user, "viewCosts") ? (
            <Card title="Outstanding pro formas" subtitle="Unpaid and part-paid">
              {openProformas.length === 0 ? (
                <EmptyState title="Nothing outstanding" />
              ) : (
                <ul className="divide-y">
                  {openProformas.map((proforma) => {
                    const paid = proforma.payments.reduce((sum, payment) => sum + payment.amountMinor, 0n);
                    return (
                      <li
                        key={proforma.id}
                        className="flex items-center justify-between gap-3 py-3 transition-colors hover:bg-muted/40"
                      >
                        <div className="min-w-0">
                          <Link href={`/proformas/${proforma.id}`} className="text-[13px] font-medium">
                            {proforma.number}
                          </Link>
                          <p className="truncate text-xs text-muted-foreground">
                            {proforma.quotation.contact.name}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <StatusBadge status={proforma.status} />
                          <p className="mt-1 text-xs font-medium text-foreground">
                            <Money amountMinor={proforma.totalMinor - paid} currency={proforma.currency} /> due
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
