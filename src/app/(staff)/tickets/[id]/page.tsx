import Link from "next/link";
import { notFound } from "next/navigation";

import { Alert, Card, PageHeader } from "@/components/ui";
import { formatDate, formatDateTime } from "@/lib/dates";
import { formatTicketNumber } from "@/lib/tickets/parse";
import { requireCapableUser } from "@/server/auth";
import { loadTicket } from "@/server/tickets";

export const dynamic = "force-dynamic";

function dateOnly(value: string | null): string {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? value : formatDate(date);
}

export default async function TicketPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  await requireCapableUser("viewDocuments");
  const { id } = await params;
  const query = await searchParams;
  const ticket = await loadTicket(id);
  if (!ticket) notFound();

  return (
    <div>
      <PageHeader
        eyebrow="Electronic ticket"
        title={`${formatTicketNumber(ticket.number)} · ${ticket.passengerName}`}
        subtitle={[
          ticket.issueDate ? `Issued ${formatDate(ticket.issueDate)}` : null,
          ticket.secondaryNumber ? `Second ticket ${formatTicketNumber(ticket.secondaryNumber)}` : null,
          ticket.platingCarrier ? `Plated ${ticket.platingCarrier}` : null,
          ticket.quotation ? `Quotation ${ticket.quotation.number}` : null,
        ]
          .filter(Boolean)
          .join(" · ")}
        actions={
          <>
            {ticket.quotation ? (
              <Link href={`/quotations/${ticket.quotation.id}`} className="btn-secondary">
                Quotation
              </Link>
            ) : null}
            {ticket.contact ? (
              <Link href={`/customers/${ticket.contactId}`} className="btn-secondary">
                Customer
              </Link>
            ) : null}
            <Link href={`/tickets/${ticket.id}/preview`} className="btn-secondary">
              Preview PDF
            </Link>
            <Link href={`/api/pdf/ticket/${ticket.id}`} className="btn-secondary">
              Download PDF
            </Link>
            <Link href="/tickets" className="btn-secondary">
              Back to tickets
            </Link>
          </>
        }
      />

      {query.error ? <Alert tone="error">{query.error}</Alert> : null}
      {query.saved ? <Alert tone="success">Saved.</Alert> : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <Card title="Coupons" subtitle="As issued by the airline">
            <div className="overflow-x-auto">
              <table className="table min-w-[760px]">
                <thead>
                  <tr>
                    <th>CPN</th>
                    <th>Use</th>
                    <th>Flight</th>
                    <th>Route</th>
                    <th>Date</th>
                    <th>Departs</th>
                    <th>Arrives</th>
                    <th>Status</th>
                    <th>Fare basis</th>
                    <th>Validity</th>
                    <th>Baggage</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {ticket.coupons.map((coupon) => (
                    <tr key={coupon.id}>
                      <td className="font-semibold">{coupon.coupon ?? coupon.position + 1}</td>
                      <td>{coupon.useType}</td>
                      <td className="font-semibold">
                        {coupon.carrier} {coupon.flightNo} {coupon.bookingClass}
                      </td>
                      <td>
                        <span className="block">
                          {coupon.fromIata} → {coupon.toIata}
                        </span>
                        {coupon.fromTerminal || coupon.toTerminal ? (
                          <span className="block text-[11px] text-muted-foreground">
                            {coupon.fromTerminal ? `Terminal ${coupon.fromTerminal}` : "—"} →{" "}
                            {coupon.toTerminal ? `Terminal ${coupon.toTerminal}` : "—"}
                          </span>
                        ) : null}
                      </td>
                      <td>{dateOnly(coupon.travelDate)}</td>
                      <td className="tabular-nums">{coupon.departTime}</td>
                      <td className="tabular-nums">{coupon.arriveTime ?? "—"}</td>
                      <td>{coupon.status}</td>
                      <td>{coupon.fareBasis ?? "—"}</td>
                      <td>
                        {[coupon.notValidBefore, coupon.notValidAfter]
                          .filter(Boolean)
                          .map((value) => dateOnly(value))
                          .join(" – ") || "—"}
                      </td>
                      <td>{coupon.baggage ?? "—"}</td>
                      <td>
                        {[coupon.aircraft, coupon.stopInfo, coupon.meal]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </td>
                    </tr>
                  ))}
                  {ticket.coupons.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="text-muted-foreground">
                        No coupon details were present in the imported ticket list.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </Card>

          <Card title="Original ticket text" subtitle="Kept for audit and reconciliation">
            <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg border border-border bg-muted/30 p-4 font-mono text-[11px] leading-relaxed">
              {ticket.rawText}
            </pre>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Ticket details">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Ticket number</dt>
                <dd className="font-mono font-semibold">{formatTicketNumber(ticket.number)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Second ticket</dt>
                <dd className="font-mono">
                  {ticket.secondaryNumber ? formatTicketNumber(ticket.secondaryNumber) : "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Passenger</dt>
                <dd>{ticket.passengerName}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Booking ref</dt>
                <dd>{ticket.bookingRef ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Check-in refs</dt>
                <dd>
                  {[ticket.checkInRef, ticket.secondaryCheckInRef].filter(Boolean).join(" / ") || "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Issued</dt>
                <dd>{ticket.issueDate ? formatDate(ticket.issueDate) : "—"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Form of payment</dt>
                <dd>{ticket.formOfPayment ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Plating carrier</dt>
                <dd>{ticket.platingCarrier ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Pseudo / ISO</dt>
                <dd>
                  {[ticket.pseudo, ticket.iso].filter(Boolean).join(" / ") || "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">IATA</dt>
                <dd>{ticket.iata ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Created</dt>
                <dd>{formatDateTime(ticket.createdAt)}</dd>
              </div>
            </dl>
          </Card>
        </div>
      </div>
    </div>
  );
}
