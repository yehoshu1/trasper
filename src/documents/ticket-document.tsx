import { Fragment } from "react";
import { DateTime } from "luxon";

import type { TicketCouponSnapshot, TicketSnapshot } from "@/lib/documents";
import { layoverLabel } from "@/lib/tickets/itinerary";

import { DocumentFrame } from "./shared";

const STANDARD_NOTES = [
  "WE RECOMMEND TRAVEL INSURANCE",
  "PLEASE ENSURE YOU HAVE VALID TRAVEL DOCUMENTS",
  "PSGR NAME MUST BE SAME AS IN PASSPORT USED TO TRAVEL",
  "CHECK IN 3HOURS BEFORE ALL FLIGHT DEPARTURES",
  "NOTE THAT MOST DISCOUNTED FARES ARE NON REFUNDABLE",
  "ENSURE YOU TRAVEL WITH YELLOW FEVER CERTIFICATE",
  "ONCE AN E-TICKET IS ISSUED NAME CHANGES ARE NOT ALLOWED",
];

function dayDate(value: string | undefined): [string, string] {
  if (!value) return ["—", ""];
  const date = DateTime.fromISO(value);
  return date.isValid ? [date.toFormat("ccc,"), date.toFormat("dd LLL yy")] : [value, ""];
}

function arrivalDate(coupon: TicketCouponSnapshot): [string, string] {
  if (!coupon.arriveTime) return ["—", ""];
  let date = coupon.travelDate ? DateTime.fromISO(coupon.travelDate) : DateTime.invalid("missing");
  if (!date.isValid) return ["—", ""];
  if (coupon.departTime && coupon.arriveTime < coupon.departTime) date = date.plus({ days: 1 });
  return [date.toFormat("ccc,"), date.toFormat("dd LLL yy")];
}

function airportLabel(coupon: TicketCouponSnapshot, side: "from" | "to"): string[] {
  const city = side === "from" ? coupon.fromCity : coupon.toCity;
  const name = side === "from" ? coupon.fromName : coupon.toName;
  const iata = side === "from" ? coupon.fromIata : coupon.toIata;
  const terminal = side === "from" ? coupon.fromTerminal : coupon.toTerminal;
  return [
    city ?? "",
    name ?? iata,
    iata ? `(${iata})` : "",
    terminal ? `Terminal ${terminal}` : "",
  ].filter(Boolean);
}

function infoLines(coupon: TicketCouponSnapshot): string[] {
  const lines = [
    coupon.bookingClass
      ? `Class : ${coupon.bookingClass}-${coupon.cabin ?? "Economy"}`
      : "",
    coupon.status ? `Status : ${coupon.status === "OK" ? "Confirmed" : coupon.status}` : "",
    coupon.baggage ? `Baggage : ${coupon.baggage}` : "",
    coupon.aircraft ? `Aircraft : ${coupon.aircraft}` : "",
    coupon.stopInfo && !/^non-?stop$/i.test(coupon.stopInfo) ? `Stop : ${coupon.stopInfo}` : "",
    coupon.meal ?? "",
  ];
  return lines.filter(Boolean);
}

/** Agency e-ticket itinerary receipt in the Sumi/Kelita layout. */
export function TicketDocument({ snapshot }: { snapshot: TicketSnapshot }) {
  const primaryLabel = snapshot.platingCarrier
    ? `${snapshot.platingCarrierName ?? snapshot.platingCarrier} (${snapshot.platingCarrier}) Ticket`
    : "Ticket 1";
  const secondaryLabel = snapshot.secondaryCarrier
    ? `${snapshot.secondaryCarrierName ?? snapshot.secondaryCarrier} (${snapshot.secondaryCarrier}) Ticket`
    : "Second ticket";

  return (
    <DocumentFrame
      company={snapshot.company}
      number={snapshot.number}
      title="Itinerary"
      template={snapshot.template}
      footerText={snapshot.company.footerText}
    >
      <section className="doc-section">
        <h2 className="doc-section-title">Passenger Information</h2>
        <table className="doc-table mt-2">
          <thead>
            <tr>
              <th>Passenger Information</th>
              <th>{primaryLabel}</th>
              <th>{secondaryLabel}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="font-semibold">{snapshot.passengerName}</td>
              <td className="font-mono">{snapshot.number}</td>
              <td className="font-mono">{snapshot.secondaryNumber ?? "—"}</td>
            </tr>
          </tbody>
        </table>

        <table className="doc-table mt-4">
          <thead>
            <tr>
              <th>Booking Ref</th>
              <th>
                {snapshot.platingCarrier
                  ? `${snapshot.platingCarrier} Check-in Ref`
                  : "Check-in Ref"}
              </th>
              <th>
                {snapshot.secondaryCarrier
                  ? `${snapshot.secondaryCarrier} Check-in Ref`
                  : "Secondary Check-in Ref"}
              </th>
              <th>Form of Payment</th>
              <th>Date of Issue</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{snapshot.bookingRef ?? "—"}</td>
              <td>{snapshot.checkInRef ?? "—"}</td>
              <td>{snapshot.secondaryCheckInRef ?? "—"}</td>
              <td>{snapshot.formOfPayment ?? "—"}</td>
              <td>
                {snapshot.issueDate
                  ? DateTime.fromISO(snapshot.issueDate).toFormat("ddLLLyy")
                  : "—"}
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="doc-section">
        <h2 className="doc-section-title">Itinerary Information</h2>
        <div className="overflow-x-auto">
          <table className="doc-table mt-2 min-w-[720px]">
            <thead>
              <tr>
                <th>Flight #</th>
                <th>From</th>
                <th>To</th>
                <th>Depart</th>
                <th>Arrive</th>
                <th>Seat</th>
                <th>Info</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.coupons.map((coupon, index) => {
                const next = snapshot.coupons[index + 1];
                const layoverText = next ? layoverLabel(coupon, next) : null;
                const dep = dayDate(coupon.travelDate);
                const arr = arrivalDate(coupon);
                const info = infoLines(coupon);
                return (
                  <Fragment key={`${coupon.position}-${coupon.flightNo}`}>
                    <tr className="align-top">
                      <td>
                        <span className="block font-semibold">
                          {coupon.carrierName ?? coupon.carrier}
                        </span>
                        <span className="block font-semibold">
                          {coupon.carrier} {coupon.flightNo}
                        </span>
                      </td>
                      <td>
                        {airportLabel(coupon, "from").map((line) => (
                          <span key={line} className="block">
                            {line}
                          </span>
                        ))}
                      </td>
                      <td>
                        {airportLabel(coupon, "to").map((line) => (
                          <span key={line} className="block">
                            {line}
                          </span>
                        ))}
                      </td>
                      <td>
                        <span className="block">{dep[0]}</span>
                        <span className="block">{dep[1]}</span>
                        <span className="block font-semibold">{coupon.departTime}</span>
                      </td>
                      <td>
                        <span className="block">{arr[0]}</span>
                        <span className="block">{arr[1]}</span>
                        <span className="block font-semibold">{coupon.arriveTime ?? "—"}</span>
                      </td>
                      <td />
                      <td>
                        {info.map((line) => (
                          <span key={line} className="block">
                            {line}
                          </span>
                        ))}
                      </td>
                    </tr>
                    {layoverText ? (
                      <tr>
                        <td colSpan={7} className="bg-slate-50 text-[10px] italic text-slate-600">
                          {layoverText}
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="doc-section text-[10px] leading-relaxed text-slate-700">
        <p>
          Air Tanzania (TC 108 / TC 175): charges may apply if bags exceed the total weight
          allowance. Carry-on: 1 piece up to 7KG.
        </p>
        <div className="mt-3 space-y-0.5">
          {STANDARD_NOTES.map((note) => (
            <p key={note}>{note}</p>
          ))}
        </div>
        <p className="mt-4">Thank you for choosing our service. We look forward to serving you</p>
      </section>
    </DocumentFrame>
  );
}
