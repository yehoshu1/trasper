"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatTicketNumber, parseTickets, type TicketParseResult } from "@/lib/tickets/parse";
import { createTicketsAction } from "@/server/actions/tickets";

export function TicketImportForm({
  contacts,
  quotations,
}: {
  contacts: { id: string; name: string }[];
  quotations: { id: string; number: string; contactName: string; status: string }[];
}) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<TicketParseResult | null>(null);

  function read() {
    setResult(parseTickets(text));
  }

  return (
    <form action={createTicketsAction} className="space-y-5">
      <div>
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          E-ticket output
          <Textarea
            name="text"
            rows={18}
            required
            className="mt-1 min-h-64 font-mono text-[11px] leading-relaxed"
            placeholder={"*ISSUED*\n\nTKT: 706 3956 175087  NAME: DZIWENI KASAMBA/YVONNE\nISSUED: 06NOV26  FOP:CASH\n..."}
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setResult(null);
            }}
          />
        </label>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Paste the airline ticket block, the <code>*HTE</code> electronic ticket list, or both. Only
          airline-issued 13-digit ticket numbers are imported; nothing is guessed.
        </p>
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

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="secondary" onClick={read} disabled={text.trim() === ""}>
          Read / convert
        </Button>
        <Button type="submit" disabled={!result || result.tickets.length === 0}>
          Save {result?.tickets.length ?? 0} ticket{result?.tickets.length === 1 ? "" : "s"}
        </Button>
      </div>

      {result ? (
        <div className="space-y-3">
          {result.warnings.map((warning) => (
            <p key={warning} className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
              {warning}
            </p>
          ))}
          {result.unparsed.length > 0 ? (
            <div className="rounded-md border border-border p-3 text-xs text-muted-foreground">
              <p className="font-semibold text-foreground">Lines left unparsed</p>
              <ul className="mt-1 space-y-0.5 font-mono">
                {result.unparsed.map((line, index) => (
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
                  <th>Passenger</th>
                  <th>Issued</th>
                  <th>Coupons</th>
                </tr>
              </thead>
              <tbody>
                {result.tickets.map((ticket) => (
                  <tr key={ticket.number}>
                    <td className="font-mono font-semibold">{formatTicketNumber(ticket.number)}</td>
                    <td>{ticket.passengerName}</td>
                    <td>{ticket.issueDate ?? "—"}</td>
                    <td>{ticket.coupons.length}</td>
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
