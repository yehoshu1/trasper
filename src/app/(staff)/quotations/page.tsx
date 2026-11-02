import Link from "next/link";
import { DateTime } from "luxon";

import { QuotationsTable, type QuotationTableRow } from "@/components/list-tables";
import { EmptyState, PageHeader } from "@/components/ui";
import { formatDate, appTimeZone } from "@/lib/dates";
import { hasCapability } from "@/lib/permissions";
import { parseSavedView } from "@/lib/saved-views";
import { requireCapableUser } from "@/server/auth";
import { prisma } from "@/server/db";
import {
  displayQuotationTotal,
  expireOverdueQuotations,
  quotationInclude,
} from "@/server/quotations";
import { getSettings } from "@/server/settings";

export const dynamic = "force-dynamic";

const STATUSES = ["draft", "sent", "accepted", "declined", "expired", "cancelled", "superseded"];

export default async function QuotationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; filter?: string; saved?: string; error?: string }>;
}) {
  const user = await requireCapableUser("viewDocuments");
  const params = await searchParams;
  const settings = await getSettings();
  await expireOverdueQuotations();

  const status = params.status && STATUSES.includes(params.status) ? params.status : "";
  const initialSearch = (params.q ?? "").trim();
  const expiring = params.filter === "expiring";
  const deadline = params.filter === "deadline";

  const now = new Date();
  const soon = DateTime.now().setZone(appTimeZone()).plus({ days: 3 }).toJSDate();
  const deadlineCutoff = DateTime.now().plus({ hours: settings.ticketingWarningHours }).toJSDate();

  const savedView = await prisma.savedTableView.findUnique({
    where: { userId_listKey: { userId: user.id, listKey: "quotations" } },
  });

  const quotations = await prisma.quotation.findMany({
    where: {
      ...(expiring ? { status: "sent", validUntil: { lte: soon } } : {}),
      ...(deadline
        ? { options: { some: { ticketingDeadline: { gte: now, lte: deadlineCutoff } } } }
        : {}),
    },
    include: quotationInclude,
    orderBy: { createdAt: "desc" },
    take: 1000,
  });

  const rows: QuotationTableRow[] = quotations.map((quotation) => ({
    id: quotation.id,
    number: quotation.number,
    referenceNo: quotation.referenceNo ?? "",
    customerId: quotation.contactId,
    customerName: quotation.contact.name,
    optionLabels: quotation.options.map((option) => option.label).join(" · "),
    status: quotation.status,
    issuedIso: quotation.issueDate.toISOString(),
    issued: formatDate(quotation.issueDate),
    validUntilIso: quotation.validUntil.toISOString(),
    validUntil: formatDate(quotation.validUntil),
    optionCount: quotation.options.length,
    totalMinor: displayQuotationTotal(quotation, settings).toString(),
    currency: quotation.currency,
  }));

  return (
    <div>
      <PageHeader
        eyebrow="Sales"
        title="Quotations"
        subtitle="Search by number, reference, customer, passenger, PNR or status. Sent quotations are locked."
      />

      {params.error ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:text-red-200">
          {params.error}
        </div>
      ) : null}
      {params.saved ? (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-200">
          Saved.
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs font-semibold">
        <Link
          href="/quotations?filter=expiring"
          className={`rounded-md border px-3 py-1 ${expiring ? "border-amber-300 bg-amber-50 text-amber-800 dark:text-amber-300 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200" : "border-border bg-card text-muted-foreground"}`}
        >
          Expiring soon
        </Link>
        <Link
          href="/quotations?filter=deadline"
          className={`rounded-md border px-3 py-1 ${deadline ? "border-amber-300 bg-amber-50 text-amber-800 dark:text-amber-300 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200" : "border-border bg-card text-muted-foreground"}`}
        >
          Ticketing within {settings.ticketingWarningHours}h
        </Link>
        {expiring || deadline ? (
          <Link href="/quotations" className="btn-ghost h-7 px-2 text-xs">
            Clear filter
          </Link>
        ) : null}
      </div>

      {quotations.length === 0 ? (
        <EmptyState title="No quotations match">
          {hasCapability(user, "manageQuotations") ? (
            <Link href="/quotations/new" className="font-semibold">Create a quotation</Link>
          ) : (
            "Quotations will appear here as they are created."
          )}
        </EmptyState>
      ) : (
        <QuotationsTable
          rows={rows}
          initialSearch={initialSearch}
          initialStatus={status}
          initialView={parseSavedView(savedView?.state)}
        />
      )}
    </div>
  );
}
