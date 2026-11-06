import type { TicketSnapshot } from "@/lib/documents";

import { DocumentFrame, SectionHeading, formatDocDate } from "./shared";

const COUPON_LABELS: Record<string, string> = {
  ARPT: "Airport",
  OPEN: "Open",
};

/** Electronic ticket itinerary receipt. */
export function TicketDocument({ snapshot }: { snapshot: TicketSnapshot }) {
  return (
    <DocumentFrame
      company={snapshot.company}
      number={snapshot.number}
      title="Electronic ticket itinerary receipt"
      template={snapshot.template}
      footerText={snapshot.company.footerText}
    >
      <section className="doc-section">
        <div className="grid gap-x-8 gap-y-2 text-[12px] sm:grid-cols-2">
          <div>
            <p className="doc-label">Passenger</p>
            <p className="font-semibold text-slate-900">{snapshot.passengerName}</p>
          </div>
          <div>
            <p className="doc-label">Ticket number</p>
            <p className="font-mono font-semibold text-slate-900">{snapshot.number}</p>
          </div>
          <div>
            <p className="doc-label">Date of issue</p>
            <p>{snapshot.issueDate ? formatDocDate(snapshot.issueDate) : "—"}</p>
          </div>
          <div>
            <p className="doc-label">Form of payment</p>
            <p>{snapshot.formOfPayment || "—"}</p>
          </div>
          <div>
            <p className="doc-label">Plating carrier / IATA</p>
            <p>
              {snapshot.platingCarrier || "—"}
              {snapshot.iata ? ` · ${snapshot.iata}` : ""}
            </p>
          </div>
          <div>
            <p className="doc-label">Pseudo / ISO</p>
            <p>
              {snapshot.pseudo || "—"}
              {snapshot.iso ? ` · ${snapshot.iso}` : ""}
            </p>
          </div>
        </div>
      </section>

      <section className="doc-section">
        <SectionHeading>Coupons</SectionHeading>
        <div className="overflow-x-auto">
          <table className="doc-table min-w-[720px]">
            <thead>
              <tr>
                <th>CPN</th>
                <th>Use</th>
                <th>Flight</th>
                <th>Route</th>
                <th>Date</th>
                <th>Departs</th>
                <th>Status</th>
                <th>Fare basis</th>
                <th>Validity</th>
                <th>Baggage</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.coupons.map((coupon) => (
                <tr key={`${coupon.position}-${coupon.coupon}`}>
                  <td className="font-semibold">{coupon.coupon ?? coupon.position + 1}</td>
                  <td>{COUPON_LABELS[coupon.useType] ?? coupon.useType}</td>
                  <td className="font-semibold">
                    {coupon.carrier} {coupon.flightNo} {coupon.bookingClass}
                  </td>
                  <td>
                    {coupon.fromIata} → {coupon.toIata}
                  </td>
                  <td>{coupon.travelDate ? formatDocDate(coupon.travelDate) : "—"}</td>
                  <td className="tabular-nums">{coupon.departTime}</td>
                  <td>{coupon.status}</td>
                  <td>{coupon.fareBasis ?? "—"}</td>
                  <td>
                    {[coupon.notValidBefore, coupon.notValidAfter].filter(Boolean).join(" – ") || "—"}
                  </td>
                  <td>{coupon.baggage ?? "—"}</td>
                </tr>
              ))}
              {snapshot.coupons.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-slate-500">
                    Coupon details were not present in the pasted ticket list.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="doc-section text-[11px] text-slate-500">
        <p>
          Ticket {snapshot.number} · Passenger {snapshot.passengerName}. This is an electronic ticket
          itinerary receipt. Present valid travel documents at check-in.
        </p>
        <p className="mt-1">
          Flight times are local at each airport. Reconfirm schedules with the airline before travel.
        </p>
      </section>
    </DocumentFrame>
  );
}
