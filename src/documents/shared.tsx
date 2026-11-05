import type { ReactNode } from "react";

import { formatMoney } from "@/lib/money";
import { initials } from "@/lib/utils";
import { formatWallClockDate, formatWallClockTime, formatDuration } from "@/lib/time";
import {
  passengerName,
  splitFlightLegs,
  isDocumentTemplate,
  resolveDocumentHeader,
  type FlightLegs,
} from "@/lib/documents";
import type {
  DocumentBank,
  DocumentCompany,
  DocumentContact,
  DocumentFlight,
  DocumentLine,
  DocumentPassenger,
  DocumentTemplate,
} from "@/lib/documents";
import { roundDiv } from "@/lib/pricing";
import type { PricePresentation } from "@/lib/pricing/presentation";
import {
  SERVICE_UNIT_PLURALS,
  isServiceUnit,
  taxRateLabel,
} from "@/lib/pricing/presentation";

/** Shared print layout. The same components render in the browser preview and
 * in the headless-Chromium PDF route, so the two can never diverge. */

export function formatDocDate(value: string | undefined): string {
  if (!value) return "";
  const [year, month, day] = value.slice(0, 10).split("-");
  if (!year || !month || !day) return value;
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${Number(day)} ${months[Number(month) - 1]} ${year}`;
}

export { passengerName };

export function magicDate(value: string): string {
  return formatDocDate(value);
}

export function DocumentFrame({
  company,
  number,
  title,
  template = "classic",
  footerText,
  children,
}: {
  company: DocumentCompany;
  number: string;
  title: string;
  template?: DocumentTemplate;
  footerText?: string;
  children: ReactNode;
}) {
  const activeTemplate: DocumentTemplate = isDocumentTemplate(template) ? template : "classic";
  const bandTemplate = activeTemplate === "modern" || activeTemplate === "vivid";
  const headerMode = resolveDocumentHeader(company);
  return (
    <article className={`doc-page doc-${activeTemplate}`}>
      {headerMode === "letterhead" ? (
        <>
          {/* Full-width picture letterhead, printed above everything else. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={company.letterhead}
            alt={`${company.name} letterhead`}
            className="doc-letterhead"
          />
          {/* A picture letterhead normally omits the tax number, so it is
              printed as its own line rather than being assumed to be inside
              the image. */}
          {company.tin ? <p className="doc-tin">TIN {company.tin}</p> : null}
          {bandTemplate ? (
            <div className={activeTemplate === "vivid" ? "doc-vivid-strip" : "doc-modern-strip"}>
              <span>{title.toUpperCase()}</span>
              <span>{number}</span>
            </div>
          ) : activeTemplate === "executive" ? (
            <div className="doc-executive-rule" />
          ) : activeTemplate === "minimal" ? (
            <div className="doc-minimal-rule" />
          ) : null}
        </>
      ) : activeTemplate === "modern" ? (
        <header className="doc-modern-header">
          <div className="flex min-w-0 items-start gap-4">
            {company.headerImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={company.headerImage}
                alt=""
                className="h-12 w-auto max-w-[150px] object-contain bg-white"
              />
            ) : null}
            <div className="min-w-0">
              <p className="doc-modern-company">{company.name}</p>
              <p className="doc-modern-contact">{company.address}</p>
              <p className="doc-modern-contact">
                {[company.phone, company.email, company.website].filter(Boolean).join(" · ")}
              </p>
              {company.tin ? <p className="doc-modern-contact">TIN {company.tin}</p> : null}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <p className="doc-modern-title">{title.toUpperCase()}</p>
            <p className="doc-modern-number">{number}</p>
          </div>
        </header>
      ) : activeTemplate === "vivid" ? (
        <header className="doc-vivid-header">
          <div className="shrink-0">
            <p className="doc-vivid-title">{title.toUpperCase()}</p>
            <p className="doc-vivid-number">{number}</p>
          </div>
          <div className="min-w-0 text-right">
            {company.headerImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={company.headerImage}
                alt=""
                className="mb-2 ml-auto h-10 w-auto max-w-[140px] object-contain bg-white"
              />
            ) : null}
            <p className="doc-vivid-company">{company.name}</p>
            <p className="doc-vivid-contact">{company.address}</p>
            <p className="doc-vivid-contact">
              {[company.phone, company.email, company.website].filter(Boolean).join(" · ")}
            </p>
            {company.tin ? <p className="doc-vivid-contact">TIN {company.tin}</p> : null}
          </div>
        </header>
      ) : activeTemplate === "minimal" ? (
        <header className="doc-minimal-header">
          <div className="flex min-w-0 items-start gap-3">
            {company.headerImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={company.headerImage}
                alt=""
                className="h-10 w-auto max-w-[120px] shrink-0 object-contain bg-white"
              />
            ) : null}
            <div className="min-w-0">
              <p className="doc-minimal-company">{company.name}</p>
              <p className="doc-minimal-contact">{company.address}</p>
              <p className="doc-minimal-contact">
                {[company.phone, company.email, company.website].filter(Boolean).join(" · ")}
              </p>
              {company.tin ? <p className="doc-minimal-contact">TIN {company.tin}</p> : null}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <p className="doc-minimal-title">{title.toUpperCase()}</p>
            <p className="doc-minimal-number">{number}</p>
          </div>
        </header>
      ) : activeTemplate === "executive" ? (
        <header className="doc-executive-header">
          {company.headerImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={company.headerImage}
              alt=""
              className="mx-auto mb-3 h-12 w-auto max-w-[160px] object-contain bg-white"
            />
          ) : null}
          <p className="doc-executive-company">{company.name}</p>
          <p className="doc-executive-contact">{company.address}</p>
          <p className="doc-executive-contact">
            {[company.phone, company.email, company.website].filter(Boolean).join(" · ")}
          </p>
          {company.tin ? <p className="doc-executive-contact">TIN {company.tin}</p> : null}
          <div className="doc-executive-rule" />
          <div className="doc-executive-document">
            <span>{title.toUpperCase()}</span>
            <span>{number}</span>
          </div>
        </header>
      ) : (
        // Company details mode: the typed name, address, contacts, TIN and
        // logo are printed even when a picture letterhead is also uploaded.
        <header className="doc-header">
          <div className="flex min-w-0 items-center gap-4">
            {company.headerImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={company.headerImage}
                alt=""
                className="h-14 w-auto max-w-[180px] shrink-0 object-contain bg-white"
              />
            ) : (
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-brand-700 text-sm font-bold text-white">
                {initials(company.name)}
              </span>
            )}
            <div className="min-w-0">
              <p className="text-xl font-bold leading-tight text-brand-900 [overflow-wrap:anywhere]">
                {company.name}
              </p>
              <p className="text-[11px] text-slate-600 [overflow-wrap:anywhere]">{company.address}</p>
              <p className="text-[11px] text-slate-600 [overflow-wrap:anywhere]">
                {[company.phone, company.email, company.website].filter(Boolean).join(" · ")}
              </p>
              {company.tin ? <p className="text-[11px] text-slate-600">TIN {company.tin}</p> : null}
            </div>
          </div>
        </header>
      )}
      <div className="doc-body">{children}</div>
      <footer className="doc-footer">
        <span>{footerText ?? company.footerText}</span>
        <span>
          {company.name} · {number}
        </span>
      </footer>
    </article>
  );
}

export function PartyBlock({
  contact,
  passengers,
  referenceNo,
  document,
}: {
  contact: DocumentContact;
  passengers: DocumentPassenger[];
  referenceNo?: string;
  /** Title, number and dates shown as a column beside the parties. */
  document?: { title: string; number: string; meta: { label: string; value: string }[] };
}) {
  return (
    <section
      className={`doc-section grid gap-4 ${document ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}
    >
      {document ? (
        <div>
          <p className="doc-label">{document.title}</p>
          <p className="font-semibold text-slate-900">{document.number}</p>
          <dl className="mt-1 space-y-0.5 text-slate-700">
            {document.meta.map((entry) => (
              <div key={entry.label}>
                <dt className="text-[11px] uppercase tracking-wide text-slate-500">{entry.label}</dt>
                <dd>{entry.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
      <div>
        <p className="doc-label">Customer</p>
        <p className="font-semibold text-slate-900">{contact.name}</p>
        {contact.attention ? <p className="text-slate-700">{contact.attention}</p> : null}
        {contact.poBox ? <p className="text-slate-700">{contact.poBox}</p> : null}
        {contact.physicalAddress ? <p className="text-slate-700">{contact.physicalAddress}</p> : null}
        <p className="text-slate-700">
          {[contact.city, contact.country].filter(Boolean).join(", ")}
        </p>
        {contact.email ? <p className="text-slate-700">{contact.email}</p> : null}
        {contact.phone ? <p className="text-slate-700">{contact.phone}</p> : null}
      </div>
      <div>
        <p className="doc-label">Passengers</p>
        {passengers.length === 0 ? (
          <p className="text-slate-500">To be advised</p>
        ) : (
          <ul className="space-y-0.5 text-slate-800">
            {passengers.map((passenger, index) => (
              <li key={`${passenger.firstName}-${passenger.lastName}-${index}`}>
                {passengerName(passenger)}
                <span className="ml-2 text-[11px] uppercase tracking-wide text-slate-500">
                  {passenger.unnamed ? "names to be advised" : passenger.type}
                </span>
              </li>
            ))}
          </ul>
        )}
        {referenceNo ? (
          <p className="mt-3 text-xs text-slate-600">
            <span className="font-semibold">Your reference:</span> {referenceNo}
          </p>
        ) : null}
      </div>
    </section>
  );
}

function AirlineLogo({ flight }: { flight: DocumentFlight }) {
  if (flight.airlineLogo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={flight.airlineLogo}
        alt={flight.airlineName}
        className="h-9 w-16 max-w-full object-contain"
      />
    );
  }
  return (
    <span className="flex h-9 w-16 max-w-full items-center justify-center rounded bg-brand-100 px-1 text-center text-[9px] font-semibold leading-tight text-brand-900">
      {flight.airlineName}
    </span>
  );
}

export function FlightsTable({ flights }: { flights: DocumentFlight[] }) {
  if (flights.length === 0) {
    return <p className="text-sm text-slate-500">Flight details to be advised.</p>;
  }
  const legs: FlightLegs = splitFlightLegs(flights);
  if (!legs.returnLeg) {
    return (
      <table className="doc-table">
        <thead>
          <tr>
            <th className="w-28">Airline</th>
            <th className="w-28">Flight</th>
            <th>Route</th>
            <th>Departs</th>
            <th>Arrives</th>
            <th className="w-20 text-right">Duration</th>
          </tr>
        </thead>
        <tbody>
          {flights.map((flight, index) => (
            <FlightsRows
              key={`${flight.flightNo}-${flight.departLocal}-${index}`}
              flight={flight}
              last={index === flights.length - 1}
            />
          ))}
        </tbody>
      </table>
    );
  }

  // Round trip: show the two legs separately, as the customer reads them.
  const leg = (label: string, group: DocumentFlight[]) => (
    <div className="doc-leg">
      <p className="doc-leg-title">{label}</p>
      <table className="doc-table">
        <thead>
          <tr>
            <th className="w-28">Airline</th>
            <th className="w-28">Flight</th>
            <th>Route</th>
            <th>Departs</th>
            <th>Arrives</th>
            <th className="w-20 text-right">Duration</th>
          </tr>
        </thead>
        <tbody>
          {group.map((flight, index) => (
            <FlightsRows
              key={`${flight.flightNo}-${flight.departLocal}-${index}`}
              flight={flight}
              // Inside each leg the last flight hides its trailing wait: the
              // turn at the destination is a stay, not a layover.
              last={index === group.length - 1}
            />
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <>
      {leg("Outbound", legs.outbound)}
      {leg("Return", legs.returnLeg)}
    </>
  );
}

function FlightsRows({ flight, last }: { flight: DocumentFlight; last: boolean }) {
  return (
    <>
      <tr className="break-inside-avoid">
        <td>
          <AirlineLogo flight={flight} />
        </td>
        <td>
          <p className="font-semibold text-slate-900">{flight.flightNo}</p>
          {flight.cabin ? <p className="text-[11px] text-slate-600">{flight.cabin}</p> : null}
          {flight.operatingCarrier ? (
            <p className="text-[10px] text-slate-600">Operated by {flight.operatingCarrier}</p>
          ) : null}
        </td>
        <td>
          <p className="font-semibold text-slate-900">
            {flight.fromIata} → {flight.toIata}
          </p>
          <p className="text-[11px] text-slate-700">
            {flight.fromCity} to {flight.toCity}
          </p>
        </td>
        <td>
          <p className="font-semibold text-slate-900">{formatWallClockTime(flight.departLocal)}</p>
          <p className="text-[11px] text-slate-700">{formatWallClockDate(flight.departLocal)}</p>
        </td>
        <td>
          <p className="font-semibold text-slate-900">{formatWallClockTime(flight.arriveLocal)}</p>
          <p className="text-[11px] text-slate-700">{formatWallClockDate(flight.arriveLocal)}</p>
        </td>
        <td className="text-right text-slate-700">{formatDuration(flight.durationMinutes)}</td>
      </tr>
      {!last && flight.layoverAfterMinutes !== undefined ? (
        <tr className="doc-layover">
          <td colSpan={6}>
            Layover in {flight.toCity} ({flight.toIata}) ·{" "}
            {formatDuration(flight.layoverAfterMinutes)}
          </td>
        </tr>
      ) : null}
    </>
  );
}

export function FlightSummary({ flights }: { flights: DocumentFlight[] }) {
  if (flights.length === 0) return null;
  const first = flights[0];
  const last = flights[flights.length - 1];
  const legs = splitFlightLegs(flights);
  const dates = `${formatWallClockDate(first.departLocal)} – ${formatWallClockDate(last.arriveLocal)}`;

  if (legs.returnLeg) {
    // Round trip: name the destination, not the return to the origin.
    const destination = legs.outbound[legs.outbound.length - 1];
    return (
      <p>
        <span className="font-semibold">Outbound:</span> {first.fromCity} ({first.fromIata}) to{" "}
        {destination.toCity} ({destination.toIata})
        <span className="mx-2">·</span>
        <span className="font-semibold">Return:</span> {destination.toCity} ({destination.toIata}) to{" "}
        {last.toCity} ({last.toIata})
        <span className="mx-2">·</span>
        <span className="font-semibold">Travel dates:</span> {dates}
      </p>
    );
  }

  return (
    <p>
      <span className="font-semibold">Route:</span> {first.fromCity} ({first.fromIata}) to{" "}
      {last.toCity} ({last.toIata})
      <span className="mx-2">·</span>
      <span className="font-semibold">Travel dates:</span> {dates}
    </p>
  );
}

export function MoneyLines({
  lines,
  currency,
  totalMinor,
  vatMinor,
  vatRateBps,
  showVat,
  presentation,
  alwaysShowPerPerson = false,
  perPersonCount,
}: {
  lines: DocumentLine[];
  currency: string;
  totalMinor: string;
  vatMinor?: string;
  vatRateBps?: string;
  showVat?: boolean;
  presentation?: PricePresentation;
  /** Quotations show the per-person share alongside the total in every layout. */
  alwaysShowPerPerson?: boolean;
  perPersonCount?: number;
}) {
  const format = (value: string) => formatMoney(BigInt(value), currency);
  const derivedPerPerson =
    presentation && alwaysShowPerPerson && perPersonCount && perPersonCount > 0
      ? roundDiv(BigInt(presentation.totalMinor), BigInt(perPersonCount)).toString()
      : undefined;
  const perPersonMinor = presentation?.perPersonMinor ?? derivedPerPerson;
  const perPersonLabel = presentation?.perPersonLabel ?? "Price per person";
  const count = presentation?.passengerCount ?? perPersonCount;

  if (presentation) {
    const quantityLabel = (line: PricePresentation["lines"][number]) => {
      if (!line.quantity || !line.unit) return null;
      const unit = isServiceUnit(line.unit)
        ? line.quantity === 1
          ? line.unit.replace("_", " / ")
          : SERVICE_UNIT_PLURALS[line.unit]
        : line.unit;
      const unitAmount = line.unitAmountMinor
        ? ` × ${format(line.unitAmountMinor)}`
        : "";
      return `${line.quantity} ${unit}${unitAmount}`;
    };

    return (
      <div className="doc-totals-wrap">
        <table className="doc-table doc-money-table">
          <thead>
            <tr>
              <th>Description</th>
              <th className="w-40 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {presentation.lines.map((line, index) => (
              <tr key={`${line.description}-${index}`} className="break-inside-avoid">
                <td>
                  {line.description}
                  {line.detail ? (
                    <span className="block text-[10px] text-slate-500">{line.detail}</span>
                  ) : null}
                  {quantityLabel(line) ? (
                    <span className="block text-[10px] text-slate-500">{quantityLabel(line)}</span>
                  ) : null}
                </td>
                <td className="text-right tabular-nums">{format(line.amountMinor)}</td>
              </tr>
            ))}
            {BigInt(presentation.serviceFeeMinor) !== 0n ? (
              <tr>
                <td>{presentation.serviceFeeLabel}</td>
                <td className="text-right tabular-nums">{format(presentation.serviceFeeMinor)}</td>
              </tr>
            ) : null}
            {presentation.taxLines.map((tax, index) => (
              <tr key={`${tax.name}-${index}`}>
                <td>
                  {tax.name}
                  {tax.kind === "percent" ? ` (${taxRateLabel(tax)})` : ""}
                </td>
                <td className="text-right tabular-nums">{format(tax.amountMinor)}</td>
              </tr>
            ))}
            {perPersonMinor ? (
              <tr className="break-inside-avoid text-slate-700">
                <td>
                  {perPersonLabel}
                  {count ? ` (${count} traveller${count === 1 ? "" : "s"})` : ""}
                </td>
                <td className="text-right font-semibold tabular-nums">{format(perPersonMinor)}</td>
              </tr>
            ) : null}
            <tr className="doc-grand-total">
              <td className="font-bold">{presentation.totalLabel}</td>
              <td className="text-right font-bold tabular-nums">{format(presentation.totalMinor)}</td>
            </tr>
          </tbody>
        </table>
        {presentation.taxNote ? (
          <p className="mt-1 text-[11px] text-slate-500">{presentation.taxNote}</p>
        ) : null}
        {presentation.taxRegistrationNumber ? (
          <p className="mt-1 text-[11px] text-slate-500">
            {presentation.vatLabel} registration number {presentation.taxRegistrationNumber}.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="doc-totals-wrap">
      <table className="doc-table doc-money-table">
        <thead>
          <tr>
            <th>Description</th>
            <th className="w-40 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, index) => (
            <tr key={`${line.description}-${index}`} className="break-inside-avoid">
              <td>{line.description}</td>
              <td className="text-right tabular-nums">{format(line.amountMinor)}</td>
            </tr>
          ))}
          {showVat && vatMinor && Number(vatMinor) !== 0 ? (
            <tr>
              <td>
                VAT included
                {vatRateBps ? ` (${Number(vatRateBps) / 100}%)` : ""}
              </td>
              <td className="text-right tabular-nums">{format(vatMinor)}</td>
            </tr>
          ) : null}
          <tr className="doc-grand-total">
            <td className="font-bold">Total</td>
            <td className="text-right font-bold tabular-nums">{format(totalMinor)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/** Signature area printed at the foot of quotations and pro formas. */
export function SignatureBlock({ companyName }: { companyName: string }) {
  return (
    <section className="doc-section doc-signature break-inside-avoid">
      <p className="doc-label">Signed by</p>
      <p className="mb-3 text-[11px] text-slate-600">For and on behalf of {companyName}</p>
      <div className="doc-signature-grid">
        <div>
          <div className="doc-signature-line" />
          <p>Name and signature</p>
        </div>
        <div>
          <div className="doc-signature-line" />
          <p>Date</p>
        </div>
      </div>
    </section>
  );
}

export function BankDetails({ bank, currency }: { bank: DocumentBank | null; currency: string }) {
  if (!bank) {
    return (
      <p className="text-xs text-slate-500">
        Bank details for {currency} will be provided with the invoice.
      </p>
    );
  }
  return (
    <div className="text-xs text-slate-700">
      <p className="doc-label">Payment details</p>
      <p className="font-semibold text-slate-900">{bank.bankName}</p>
      <p>Account name: {bank.accountName}</p>
      <p>Account number: {bank.accountNumber}</p>
      {bank.branch ? <p>Branch: {bank.branch}</p> : null}
      {bank.swift ? <p>SWIFT: {bank.swift}</p> : null}
      {bank.sortCode ? <p>Sort code: {bank.sortCode}</p> : null}
      {bank.instructions ? <p className="mt-1 text-slate-600">{bank.instructions}</p> : null}
    </div>
  );
}

export function NotesBlock({ title = "Important notes", notes }: { title?: string; notes: string }) {
  if (!notes) return null;
  return (
    <section className="doc-section">
      <p className="doc-label">{title}</p>
      <p className="whitespace-pre-line text-xs leading-relaxed text-slate-700">{notes}</p>
    </section>
  );
}

export function SectionHeading({ children }: { children: ReactNode }) {
  return <h2 className="doc-section-title">{children}</h2>;
}
