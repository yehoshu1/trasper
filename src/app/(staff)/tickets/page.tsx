import Link from "next/link";

import { Alert, EmptyState, PageHeader } from "@/components/ui";
import { formatDate } from "@/lib/dates";
import { hasCapability } from "@/lib/permissions";
import { formatTicketNumber } from "@/lib/tickets/parse";
import { requireCapableUser } from "@/server/auth";
import { prisma } from "@/server/db";

export const dynamic = "force-dynamic";

export default async function TicketsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; saved?: string; skipped?: string; error?: string }>;
}) {
  const user = await requireCapableUser("viewDocuments");
  const params = await searchParams;
  const query = (params.q ?? "").trim();
  const canManage = hasCapability(user, "manageDocuments");

  const tickets = await prisma.ticket.findMany({
    where: query
      ? {
          OR: [
            { number: { contains: query.replace(/\s+/g, "") } },
            { passengerName: { contains: query } },
            { contact: { name: { contains: query } } },
            { quotation: { number: { contains: query } } },
          ],
        }
      : {},
    include: {
      contact: { select: { name: true } },
      quotation: { select: { id: true, number: true } },
      _count: { select: { coupons: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  return (
    <div>
      <PageHeader
        eyebrow="Sales"
        title="Tickets"
        subtitle="Electronic tickets imported from airline or GDS output. Coupons are stored exactly as issued."
        actions={
          <>
            {tickets.length > 0 ? (
              <Link
                href={`/api/pdf/tickets${query ? `?q=${encodeURIComponent(query)}` : ""}`}
                target="_blank"
                className="btn-secondary"
              >
                Print {query ? "results" : "all"}
              </Link>
            ) : null}
            {canManage ? (
              <Link href="/tickets/new" className="btn-primary">
                Import tickets
              </Link>
            ) : null}
          </>
        }
      />

      {params.error ? <Alert tone="error">{params.error}</Alert> : null}
      {params.saved ? (
        <Alert tone="success">
          Imported {params.saved} ticket{params.saved === "1" ? "" : "s"}.
          {params.skipped && params.skipped !== "0"
            ? ` ${params.skipped} already existed and were skipped.`
            : ""}
        </Alert>
      ) : null}

      <form className="mb-4 flex flex-wrap gap-2" method="get">
        <input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Search ticket number, passenger, customer or quotation"
          className="h-9 min-w-64 flex-1 rounded-md border border-input bg-background px-3 text-sm"
        />
        <button type="submit" className="btn-secondary">
          Search
        </button>
        {query ? (
          <Link href="/tickets" className="btn-ghost h-9 px-3 text-xs">
            Clear
          </Link>
        ) : null}
      </form>

      {tickets.length === 0 ? (
        <EmptyState title={query ? "No tickets match" : "No tickets yet"}>
          {canManage
            ? "Import the airline ticket block or the electronic ticket list."
            : "Tickets will appear here once an agent imports them."}
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="table">
            <thead>
              <tr>
                <th>Ticket</th>
                <th>Passenger</th>
                <th>Issued</th>
                <th>Coupons</th>
                <th>Customer</th>
                <th>Quotation</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((ticket) => (
                <tr key={ticket.id}>
                  <td className="font-mono font-semibold">
                    <Link href={`/tickets/${ticket.id}`} className="text-foreground">
                      {formatTicketNumber(ticket.number)}
                    </Link>
                    {ticket.secondaryNumber ? (
                      <p className="font-mono text-[11px] text-muted-foreground">
                        + {formatTicketNumber(ticket.secondaryNumber)}
                      </p>
                    ) : null}
                  </td>
                  <td>{ticket.passengerName}</td>
                  <td>{ticket.issueDate ? formatDate(ticket.issueDate) : "—"}</td>
                  <td>{ticket._count.coupons}</td>
                  <td>
                    {ticket.contact ? (
                      <Link href={`/customers/${ticket.contactId}`} className="text-foreground">
                        {ticket.contact.name}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    {ticket.quotation ? (
                      <Link href={`/quotations/${ticket.quotation.id}`} className="text-foreground">
                        {ticket.quotation.number}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="text-muted-foreground">{formatDate(ticket.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
