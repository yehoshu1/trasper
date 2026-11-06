"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { isBookingDocument, parseBookingDocument } from "@/lib/tickets/booking";
import { mergeTicketSources } from "@/lib/tickets/merge";
import { formatTicketNumber, parseTickets } from "@/lib/tickets/parse";
import { createTicketsAction } from "@/server/actions/tickets";

export function TicketImportForm({
  contacts,
  quotations,
}: {
  contacts: { id: string; name: string }[];
  quotations: { id: string; number: string; contactName: string; status: string }[];
}) {
  const [text, setText] = useState("");
  const [bookingText, setBookingText] = useState("");
  const [applyToAll, setApplyToAll] = useState(true);
  const [showPreview, setShowPreview] = useState(false);

  const parsed = useMemo(() => {
    const result = parseTickets(text);
    const effectiveBookingText =
      bookingText.trim() || (isBookingDocument(text) ? text : "");
    const booking = effectiveBookingText.trim()
      ? parseBookingDocument(effectiveBookingText)
      : null;
    const merged = mergeTicketSources(result.tickets, booking, applyToAll);
    return { result, booking, merged, effectiveBookingText };
  }, [text, bookingText, applyToAll]);

  const canSave =
    parsed.merged.groups.length > 0 &&
    !(
      parsed.effectiveBookingText.trim() !== "" &&
      (!parsed.booking ||
        (parsed.booking.flights.length === 0 && parsed.booking.passengers.length === 0))
    );
  const warnings = [
    ...parsed.result.warnings,
    ...(parsed.booking?.warnings ?? []),
    ...parsed.merged.warnings,
  ];

  return (
    <form action={createTicketsAction} className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-2">
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            E-ticket output (optional)
            <Textarea
              name="text"
              rows={16}
              className="mt-1 min-h-60 font-mono text-[11px] leading-relaxed"
              placeholder={"*ISSUED*\n\nTKT: 706 3956 175087  NAME: DZIWENI KASAMBA/YVONNE\nISSUED: 06NOV26  FOP:CASH\n..."}
              value={text}
              onChange={(event) => {
                setText(event.target.value);
                setShowPreview(false);
              }}
            />
          </label>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Paste the airline ticket block, the <code>*HTE</code> electronic ticket list, or both.
            Only airline-issued 13-digit ticket numbers are imported; nothing is guessed.
          </p>
        </div>

        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Airline booking confirmation (optional)
            <Textarea
              name="bookingText"
              rows={16}
              className="mt-1 min-h-60 font-mono text-[11px] leading-relaxed"
              placeholder={"E-Ticket & Itinerary Details\n\nPASSENGER DETAILS\n...\n\nFLIGHT DETAILS\n..."}
              value={bookingText}
              onChange={(event) => {
                setBookingText(event.target.value);
                setShowPreview(false);
              }}
            />
          </label>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Paste the airline&apos;s booking confirmation to add arrival times, terminals, aircraft,
            meal service, baggage and both ticket numbers.
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Link to customer (optional)
          <select
            name="contactId"
            className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            defaultValue=""
          >
            <option value="">No customer link</option>
            {contacts.map((contact) => (
              <option key={contact.id} value={contact.id}>
                {contact.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Link to quotation (optional)
          <select
            name="quotationId"
            className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            defaultValue=""
          >
            <option value="">No quotation link</option>
            {quotations.map((quotation) => (
              <option key={quotation.id} value={quotation.id}>
                {quotation.number} — {quotation.contactName} ({quotation.status})
              </option>
            ))}
          </select>
        </label>
      </div>

      <details className="rounded-lg border border-border p-4">
        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Override booking references (optional)
        </summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Booking reference
            <input
              name="bookingRef"
              className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              placeholder="e.g. JMC9NY"
            />
          </label>
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Primary check-in ref
            <input
              name="checkInRef"
              className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              placeholder="e.g. 9H3TXP"
            />
          </label>
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Secondary check-in ref
            <input
              name="secondaryCheckInRef"
              className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              placeholder="e.g. 1D8A5Z"
            />
          </label>
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Secondary carrier
            <input
              name="secondaryCarrier"
              maxLength={3}
              className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm uppercase"
              placeholder="e.g. TC"
            />
          </label>
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">
          Values read from the booking confirmation are used unless you fill a field here.
        </p>
      </details>

      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          name="applyItineraryToAll"
          checked={applyToAll}
          onChange={(event) => {
            setApplyToAll(event.target.checked);
            setShowPreview(false);
          }}
          className="h-4 w-4 rounded border-input"
        />
        Apply the first itinerary to every passenger
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          onClick={() => setShowPreview(true)}
          disabled={text.trim() === "" && bookingText.trim() === ""}
        >
          Read / convert
        </Button>
        <Button type="submit" disabled={!canSave}>
          Save {parsed.merged.groups.length} e-ticket
          {parsed.merged.groups.length === 1 ? "" : "s"}
        </Button>
      </div>

      {showPreview ? (
        <div className="space-y-3">
          {parsed.booking ? (
            <div className="rounded-md border border-border p-3 text-xs">
              <p className="font-semibold text-foreground">
                Booking confirmation
                {parsed.booking.reference ? ` · ${parsed.booking.reference}` : ""}
              </p>
              <p className="mt-1 text-muted-foreground">
                {parsed.booking.passengers.length} passengers ·{" "}
                {parsed.booking.flights.length} flights
                {parsed.booking.checkInRefs.length > 0
                  ? ` · check-in ${parsed.booking.checkInRefs
                      .map((ref) => `${ref.carrier}/${ref.reference}`)
                      .join(", ")}`
                  : ""}
              </p>
            </div>
          ) : null}

          {warnings.map((warning) => (
            <p
              key={warning}
              className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200"
            >
              {warning}
            </p>
          ))}

          {parsed.result.unparsed.length > 0 ? (
            <div className="rounded-md border border-border p-3 text-xs text-muted-foreground">
              <p className="font-semibold text-foreground">Lines left unparsed</p>
              <ul className="mt-1 space-y-0.5 font-mono">
                {parsed.result.unparsed.map((line, index) => (
                  <li key={`${line}-${index}`}>{line}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="table">
              <thead>
                <tr>
                  <th>Ticket</th>
                  <th>Second ticket</th>
                  <th>Passenger</th>
                  <th>Issued</th>
                  <th>Flights</th>
                </tr>
              </thead>
              <tbody>
                {parsed.merged.groups.map((group) => (
                  <tr key={group.primary.number}>
                    <td className="font-mono font-semibold">
                      {formatTicketNumber(group.primary.number)}
                    </td>
                    <td className="font-mono">
                      {group.secondary ? formatTicketNumber(group.secondary.number) : "—"}
                    </td>
                    <td>{group.primary.passengerName}</td>
                    <td>{group.primary.issueDate ?? "—"}</td>
                    <td>{group.coupons.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </form>
  );
}
