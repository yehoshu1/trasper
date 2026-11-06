import type { ProformaSnapshot } from "@/lib/documents";
import { formatMoney } from "@/lib/money";
import { proformaInvoiceLines, type InvoiceLine } from "@/lib/proforma-invoice";

import {
  BankDetails,
  DocumentFrame,
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

function InvoiceTable({
  lines,
  currency,
  totalMinor,
  totalLabel,
}: {
  lines: InvoiceLine[];
  currency: string;
  totalMinor: string;
  totalLabel: string;
}) {
  const format = (value: string) => formatMoney(BigInt(value), currency);
  return (
    <table className="doc-table doc-money-table">
      <thead>
        <tr>
          <th>Description</th>
          <th className="w-14 text-right">Qty</th>
          <th className="w-32 text-right">Unit price</th>
          <th className="w-32 text-right">Total</th>
        </tr>
      </thead>
      <tbody>
        {lines.map((line, index) => (
          <tr key={`${line.description}-${index}`} className="break-inside-avoid">
            <td>{line.description}</td>
            <td className="text-right tabular-nums">{line.quantity}</td>
            <td className="text-right tabular-nums">{format(line.unitAmountMinor)}</td>
            <td className="text-right tabular-nums">{format(line.amountMinor)}</td>
          </tr>
        ))}
        <tr className="doc-grand-total">
          <td colSpan={3} className="font-bold">
            {totalLabel}
          </td>
          <td className="text-right font-bold tabular-nums">{format(totalMinor)}</td>
        </tr>
      </tbody>
    </table>
  );
}

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

      {snapshot.journeys && snapshot.journeys.length > 1 ? (
        <>
          <p className="text-xs text-slate-500">Quotation {snapshot.quotationNumber}</p>
          {snapshot.journeys.map((journey, index) => (
            <section key={`${journey.label}-${index}`} className="doc-section">
              <SectionHeading>{journey.label}</SectionHeading>
              <InvoiceTable
                lines={proformaInvoiceLines({
                  lines: journey.lines,
                  presentation: journey.presentation,
                  totalMinor: journey.totalMinor,
                })}
                currency={snapshot.currency}
                totalMinor={journey.totalMinor}
                totalLabel="Journey total"
              />
            </section>
          ))}
          <div className="doc-section">
            <table className="doc-table doc-money-table">
              <tbody>
                <tr className="doc-grand-total">
                  <td className="font-bold">Total</td>
                  <td className="text-right font-bold tabular-nums">{format(snapshot.totalMinor)}</td>
                </tr>
              </tbody>
            </table>
            {snapshot.showVat && snapshot.vatRegistrationNumber ? (
              <p className="mt-1 text-[11px] text-slate-500">
                VAT registration number {snapshot.vatRegistrationNumber}. VAT is charged on the
                service margin only and is included in the total.
              </p>
            ) : null}
          </div>
        </>
      ) : (
        <>
          <section className="doc-section">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              {snapshot.showOptionLabel !== false ? (
                <SectionHeading>{snapshot.optionLabel}</SectionHeading>
              ) : null}
              <p className="ml-auto text-xs text-slate-500">Quotation {snapshot.quotationNumber}</p>
            </div>
          </section>

          <div className="doc-section">
            <InvoiceTable
              lines={proformaInvoiceLines({
                lines: snapshot.lines,
                presentation: snapshot.presentation,
                totalMinor: snapshot.totalMinor,
              })}
              currency={snapshot.currency}
              totalMinor={snapshot.totalMinor}
              totalLabel="Total"
            />
            {snapshot.showVat && snapshot.vatRegistrationNumber ? (
              <p className="mt-1 text-[11px] text-slate-500">
                VAT registration number {snapshot.vatRegistrationNumber}. VAT is charged on the service
                margin only and is included in the total.
              </p>
            ) : null}
          </div>
        </>
      )}

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
