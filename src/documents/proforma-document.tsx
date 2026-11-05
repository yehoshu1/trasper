import type { ProformaSnapshot } from "@/lib/documents";
import { formatMoney } from "@/lib/money";

import {
  BankDetails,
  DocumentFrame,
  FlightSummary,
  FlightsTable,
  MoneyLines,
  NotesBlock,
  PartyBlock,
  SectionHeading,
  SignatureBlock,
  formatDocDate,
  passengerName,
} from "./shared";

export interface ProformaPaymentRow {
  paidOn: string;
  amountMinor: string;
  method: string;
  reference?: string;
  reversal: boolean;
}

const PAYMENT_METHODS: Record<string, string> = {
  cash: "Cash",
  bank_transfer: "Bank transfer",
  mobile_money: "Mobile money",
  cheque: "Cheque",
  card: "Card",
};

/** Pro forma invoice. VAT is hidden unless its own switch is on. */
export function ProformaDocument({
  snapshot,
  payments = [],
  paidMinor = "0",
}: {
  snapshot: ProformaSnapshot;
  payments?: ProformaPaymentRow[];
  paidMinor?: string;
}) {
  const format = (value: string) => formatMoney(BigInt(value), snapshot.currency);
  const balance = BigInt(snapshot.totalMinor) - BigInt(paidMinor);

  return (
    <DocumentFrame
      company={snapshot.company}
      number={snapshot.number}
      title="Pro forma invoice"
      template={snapshot.template}
      footerText={snapshot.company.footerText}
    >
      <PartyBlock
        contact={snapshot.contact}
        passengers={snapshot.passengers}
        referenceNo={snapshot.referenceNo}
        document={{
          title: "Pro forma invoice",
          number: snapshot.number,
          meta: [
            { label: "Date", value: formatDocDate(snapshot.issueDate) },
            ...(snapshot.dueDate ? [{ label: "Due", value: formatDocDate(snapshot.dueDate) }] : []),
          ],
        }}
      />

      <section className="doc-section">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          {snapshot.showOptionLabel !== false ? (
            <SectionHeading>{snapshot.optionLabel}</SectionHeading>
          ) : null}
          <p className="ml-auto text-xs text-slate-500">Quotation {snapshot.quotationNumber}</p>
        </div>
        {snapshot.showFlights && snapshot.flights.length > 0 ? (
          <>
            <FlightSummary flights={snapshot.flights} />
            <FlightsTable flights={snapshot.flights} />
          </>
        ) : null}
      </section>

      <div className="doc-section">
        <MoneyLines
          lines={snapshot.lines}
          currency={snapshot.currency}
          totalMinor={snapshot.totalMinor}
          vatMinor={snapshot.vatMinor}
          vatRateBps={snapshot.vatRateBps}
          showVat={snapshot.showVat}
          presentation={snapshot.presentation}
        />
        {snapshot.showVat && snapshot.vatRegistrationNumber ? (
          <p className="mt-1 text-[11px] text-slate-500">
            VAT registration number {snapshot.vatRegistrationNumber}. VAT is charged on the service
            margin only and is included in the total.
          </p>
        ) : null}
      </div>

      {payments.length > 0 ? (
        <section className="doc-section">
          <p className="doc-label">Payments received</p>
          <table className="doc-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Method</th>
                <th>Reference</th>
                <th className="text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((payment, index) => (
                <tr key={`${payment.paidOn}-${index}`}>
                  <td>{formatDocDate(payment.paidOn)}</td>
                  <td>{PAYMENT_METHODS[payment.method] ?? payment.method}</td>
                  <td>{payment.reversal ? `Reversal — ${payment.reference ?? ""}` : payment.reference ?? "—"}</td>
                  <td className="text-right tabular-nums">{format(payment.amountMinor)}</td>
                </tr>
              ))}
              <tr>
                <td colSpan={3} className="font-semibold">
                  Total paid
                </td>
                <td className="text-right font-semibold tabular-nums">{format(paidMinor)}</td>
              </tr>
              <tr className="doc-grand-total">
                <td colSpan={3} className="font-bold">
                  Balance due
                </td>
                <td className="text-right font-bold tabular-nums">{format(balance.toString())}</td>
              </tr>
            </tbody>
          </table>
        </section>
      ) : null}

      <div className="doc-section grid gap-6 sm:grid-cols-2">
        <BankDetails bank={snapshot.bank} currency={snapshot.currency} />
        <div>
          <p className="doc-label">Payment terms</p>
          <p className="whitespace-pre-line text-xs leading-relaxed text-slate-700">
            {snapshot.terms}
          </p>
          {snapshot.dueDate ? (
            <p className="mt-2 text-xs font-semibold text-slate-800">
              Please pay by {formatDocDate(snapshot.dueDate)}.
            </p>
          ) : null}
        </div>
      </div>

      <SignatureBlock companyName={snapshot.company.name} />

      <NotesBlock notes={snapshot.company.footerText ? snapshot.terms : snapshot.terms} />

      <section className="doc-section text-[11px] text-slate-500">
        <p>
          Pro forma {snapshot.number} · Issued {formatDocDate(snapshot.issueDate)} · This is a pro
          forma invoice, not a tax invoice.
        </p>
        {snapshot.passengers.length > 0 ? (
          <p className="mt-1">
            Passengers: {snapshot.passengers.map((passenger) => passengerName(passenger)).join(", ")}
          </p>
        ) : null}
      </section>
    </DocumentFrame>
  );
}
