import type { QuotationSnapshot } from "@/lib/documents";
import { formatMoney } from "@/lib/money";

import {
  DocumentFrame,
  FlightSummary,
  FlightsTable,
  MoneyLines,
  NotesBlock,
  PartyBlock,
  SectionHeading,
  SignatureBlock,
  formatDocDate,
} from "./shared";

/** Customer-facing quotation. Cost, markup, profit, VAT and bank details never appear. */
export function QuotationDocument({ snapshot }: { snapshot: QuotationSnapshot }) {
  const passengerCount = snapshot.passengers.reduce(
    (sum, passenger) => sum + (passenger.unnamed ? Math.max(1, passenger.quantity ?? 1) : 1),
    0,
  );
  const totalMinor =
    snapshot.totalMinor ??
    snapshot.options
      .reduce((sum, option) => sum + BigInt(option.totalMinor), 0n)
      .toString();
  return (
    <DocumentFrame
      company={snapshot.company}
      number={snapshot.number}
      title="Quotation"
      template={snapshot.template}
      footerText={snapshot.company.footerText}
    >
      <PartyBlock
        contact={snapshot.contact}
        passengers={snapshot.passengers}
        referenceNo={snapshot.referenceNo}
        document={{
          title: "Quotation",
          number: snapshot.number,
          meta: [
            { label: "Date", value: formatDocDate(snapshot.issueDate) },
            { label: "Valid until", value: formatDocDate(snapshot.validUntil) },
          ],
        }}
      />

      <section className="doc-section">
        <SectionHeading>{snapshot.heading?.trim() || "QUOTATION"}</SectionHeading>
      </section>

      {snapshot.options.map((option, index) => (
        <section key={`${option.label}-${index}`} className="doc-option">
          {snapshot.options.length > 1 ? (
            <div className="doc-option-heading">
              <SectionHeading>{option.label}</SectionHeading>
              {option.pnr ? <p className="text-xs text-slate-600">Booking reference {option.pnr}</p> : null}
            </div>
          ) : option.pnr ? (
            <p className="mb-2 text-xs text-slate-600">Booking reference {option.pnr}</p>
          ) : null}
          {option.flights.length > 0 ? (
            <div className="doc-section">
              <FlightSummary flights={option.flights} />
            </div>
          ) : null}
          <FlightsTable flights={option.flights} />
          <div className="doc-section">
            <MoneyLines
              lines={option.lines}
              currency={snapshot.currency}
              totalMinor={option.totalMinor}
              vatMinor={option.vatMinor}
              showVat={false}
              presentation={option.presentation}
              alwaysShowPerPerson
              perPersonCount={passengerCount || option.presentation?.passengerCount}
            />
          </div>
        </section>
      ))}

      {snapshot.options.length > 1 ? (
        <div className="doc-section">
          <table className="doc-table doc-money-table">
            <tbody>
              <tr className="doc-grand-total">
                <td className="font-bold">Quotation total</td>
                <td className="text-right font-bold tabular-nums">
                  {formatMoney(BigInt(totalMinor), snapshot.currency)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="doc-section">
        <NotesBlock notes={snapshot.notes} />
      </div>

      {snapshot.validityStatement ? (
        <NotesBlock title="Quotation validity" notes={snapshot.validityStatement} />
      ) : null}

      <SignatureBlock companyName={snapshot.company.name} />

      <section className="doc-section text-[11px] text-slate-500">
        <p>
          Quotation {snapshot.number}
          {snapshot.revision > 1 ? ` (revision ${snapshot.revision})` : ""} · Issued{" "}
          {formatDocDate(snapshot.issueDate)} · Valid until {formatDocDate(snapshot.validUntil)}.
        </p>
        <p className="mt-1">
          Prices are subject to availability at the time of confirmation. Please check that all
          passenger names match the travel documents exactly.
        </p>
      </section>
    </DocumentFrame>
  );
}
