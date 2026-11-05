import Link from "next/link";

import { ProformasTable, type ProformaTableRow } from "@/components/list-tables";
import { EmptyState, Money, PageHeader } from "@/components/ui";
import { formatDate } from "@/lib/dates";
import { parseSavedView } from "@/lib/saved-views";
import { requireCapableUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { getSettings } from "@/server/settings";

export const dynamic = "force-dynamic";

const STATUSES = ["unpaid", "part_paid", "paid", "cancelled"];

export default async function ProformasPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; archived?: string }>;
}) {
  const user = await requireCapableUser("viewCosts");
  const settings = await getSettings();
  const params = await searchParams;
  const status = params.status && STATUSES.includes(params.status) ? params.status : "";
  const initialSearch = (params.q ?? "").trim();
  const archived = params.archived === "1";

  const savedView = await prisma.savedTableView.findUnique({
    where: { userId_listKey: { userId: user.id, listKey: "proformas" } },
  });

  const proformas = await prisma.proforma.findMany({
    where: archived ? { archivedAt: { not: null } } : { archivedAt: null },
    include: {
      quotation: { include: { contact: true } },
      payments: true,
    },
    orderBy: { createdAt: "desc" },
    take: 1000,
  });

  const counts = await prisma.proforma.groupBy({
    by: ["status"],
    where: archived ? { archivedAt: { not: null } } : { archivedAt: null },
    _count: { _all: true },
  });
  const countFor = (value: string) => counts.find((entry) => entry.status === value)?._count._all ?? 0;
  const outstanding = proformas
    .filter((proforma) => proforma.status !== "cancelled" && (!status || proforma.status === status))
    .reduce((sum, proforma) => {
      const paid = proforma.payments.reduce((total, payment) => total + payment.amountMinor, 0n);
      return sum + (proforma.totalMinor - paid);
    }, 0n);

  const rows: ProformaTableRow[] = proformas.map((proforma) => {
    const paid = proforma.payments.reduce((sum, payment) => sum + payment.amountMinor, 0n);
    return {
      id: proforma.id,
      number: proforma.number,
      referenceNo: proforma.referenceNo ?? "",
      customerName: proforma.quotation.contact.name,
      quotationId: proforma.quotationId,
      quotationNumber: proforma.quotation.number,
      issuedIso: proforma.issueDate.toISOString(),
      issued: formatDate(proforma.issueDate),
      dueIso: proforma.dueDate ? proforma.dueDate.toISOString() : "",
      due: proforma.dueDate ? formatDate(proforma.dueDate) : "—",
      status: proforma.status,
      archived: Boolean(proforma.archivedAt),
      totalMinor: proforma.totalMinor.toString(),
      balanceMinor: (proforma.totalMinor - paid).toString(),
      currency: proforma.currency,
    };
  });

  return (
    <div>
      <PageHeader
        eyebrow="Money"
        title="Pro forma invoices"
        subtitle="Issued from an accepted option. Status comes from the payments, never typed."
      />

      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          {STATUSES.map((entry) => (
            <Link
              key={entry}
              href={`/proformas?status=${entry}${archived ? "&archived=1" : ""}`}
              className={`rounded-full border px-3 py-1 ${
                status === entry
                  ? "border-brand-300 bg-secondary text-secondary-foreground"
                  : "border-border bg-card text-muted-foreground"
              }`}
            >
              {entry.replace("_", "-")} ({countFor(entry)})
            </Link>
          ))}
          {!archived ? (
            <Link
              href="/proformas?archived=1"
              className="rounded-full border border-border bg-card px-3 py-1 text-muted-foreground"
            >
              Archived
            </Link>
          ) : (
            <Link
              href="/proformas"
              className="rounded-full border border-brand-300 bg-secondary px-3 py-1 text-secondary-foreground"
            >
              Show active
            </Link>
          )}
          {status ? (
            <Link href={archived ? "/proformas?archived=1" : "/proformas"} className="btn-ghost h-7 px-2 text-xs">
              Clear status
            </Link>
          ) : null}
        </div>
        <div className="rounded-lg border border-border bg-card px-4 py-2 text-right">
          <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            Outstanding{status ? ` · ${status.replace("_", "-")}` : ""}
          </p>
          <p className="text-lg font-bold text-foreground">
            <Money amountMinor={outstanding} currency={settings.baseCurrency} />
          </p>
        </div>
      </div>

      {proformas.length === 0 ? (
        <EmptyState title="No pro formas issued yet">
          Accept a quotation option and create its pro forma from the quotation page.
        </EmptyState>
      ) : (
        <ProformasTable
          rows={rows}
          initialSearch={initialSearch}
          initialStatus={status}
          initialView={parseSavedView(savedView?.state)}
          archivedView={archived}
        />
      )}
    </div>
  );
}
