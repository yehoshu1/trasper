import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";

import type { FrozenTotals, ProformaSnapshot, QuotationSnapshot } from "@/lib/documents";
import { formatMoney } from "@/lib/money";
import { roundDiv } from "@/lib/pricing";
import type { PricePresentation } from "@/lib/pricing/presentation";

/**
 * Internal working document. Never a customer
 * deliverable, never fed into the PDF/customer flow, and permission-gated to
 * roles that already see cost and markup. The data comes from the frozen
 * snapshots, so the Word file cannot drift from the issued document.
 */

function text(value: string, options: { bold?: boolean; size?: number; color?: string } = {}): TextRun {
  return new TextRun({
    text: value,
    bold: options.bold,
    size: options.size ?? 20,
    color: options.color,
  });
}

function paragraph(value: string, options: { bold?: boolean; size?: number; color?: string } = {}): Paragraph {
  return new Paragraph({ children: [text(value, options)] });
}

function cell(value: string, options: { bold?: boolean; align?: "left" | "right" } = {}): TableCell {
  return new TableCell({
    width: { size: 0, type: WidthType.AUTO },
    children: [
      new Paragraph({
        alignment: options.align === "right" ? AlignmentType.RIGHT : AlignmentType.LEFT,
        children: [text(value, { bold: options.bold, size: 18 })],
      }),
    ],
  });
}

function row(values: string[], options: { bold?: boolean; right?: number[] } = {}): TableRow {
  return new TableRow({
    children: values.map((value, index) =>
      cell(value, { bold: options.bold, align: options.right?.includes(index) ? "right" : "left" }),
    ),
  });
}

function companyBlock(snapshot: QuotationSnapshot | ProformaSnapshot): Paragraph[] {
  const lines = [
    snapshot.company.name,
    snapshot.company.address,
    [snapshot.company.phone, snapshot.company.email].filter(Boolean).join(" · "),
    snapshot.company.tin ? `TIN ${snapshot.company.tin}` : "",
  ].filter(Boolean);
  return [
    ...lines.map((line, index) => paragraph(line, { bold: index === 0, size: index === 0 ? 24 : 18 })),
  ];
}

const WARNING = "INTERNAL WORKING COPY — NOT FOR CUSTOMER";

function customerMoneyRows(
  lines: { description: string; amountMinor: string }[],
  currency: string,
  presentation?: PricePresentation,
  perPersonCount?: number,
): string[][] {
  if (!presentation) {
    return lines.map((line) => [line.description, formatMoney(BigInt(line.amountMinor), currency)]);
  }
  const rows = presentation.lines.map((line) => {
    const parts = [line.description];
    if (line.detail) parts.push(line.detail);
    if (line.quantity && line.unit) {
      parts.push(
        `${line.quantity} ${line.unit}${line.unitAmountMinor ? ` x ${formatMoney(BigInt(line.unitAmountMinor), currency)}` : ""}`,
      );
    }
    return [parts.join(" — "), formatMoney(BigInt(line.amountMinor), currency)];
  });
  if (BigInt(presentation.serviceFeeMinor) !== 0n) {
    rows.push([
      presentation.serviceFeeLabel,
      formatMoney(BigInt(presentation.serviceFeeMinor), currency),
    ]);
  }
  for (const tax of presentation.taxLines) {
    rows.push([tax.name, formatMoney(BigInt(tax.amountMinor), currency)]);
  }
  const perPersonMinor =
    presentation.perPersonMinor ??
    (perPersonCount && perPersonCount > 0
      ? roundDiv(BigInt(presentation.totalMinor), BigInt(perPersonCount)).toString()
      : undefined);
  if (perPersonMinor) {
    const label = presentation.perPersonLabel ?? "Price per person";
    rows.push([
      `${label}${perPersonCount ? ` (${perPersonCount} traveller${perPersonCount === 1 ? "" : "s"})` : ""}`,
      formatMoney(BigInt(perPersonMinor), currency),
    ]);
  }
  rows.push([
    presentation.totalLabel,
    formatMoney(BigInt(presentation.totalMinor), currency),
  ]);
  return rows;
}

export async function buildQuotationDocx(snapshot: QuotationSnapshot): Promise<Buffer> {
  const passengerCount = snapshot.passengers.reduce(
    (sum, passenger) => sum + (passenger.unnamed ? Math.max(1, passenger.quantity ?? 1) : 1),
    0,
  );
  const children: (Paragraph | Table)[] = [
    ...companyBlock(snapshot),
    new Paragraph({ text: "", spacing: { after: 120 } }),
    new Paragraph({ text: WARNING, heading: HeadingLevel.HEADING_2 }),
    new Paragraph({ text: "Internal quotation working document", heading: HeadingLevel.HEADING_1 }),
    paragraph(`Quotation ${snapshot.number} · revision ${snapshot.revision}`),
    paragraph(`Reference: ${snapshot.referenceNo ?? "—"}`),
    paragraph(`Issued ${snapshot.issueDate} · valid until ${snapshot.validUntil} · ${snapshot.currency}`),
    ...(snapshot.validityStatement
      ? [
          paragraph("QUOTATION VALIDITY", { bold: true }),
          paragraph(snapshot.validityStatement),
        ]
      : []),
    new Paragraph({ text: "", spacing: { after: 80 } }),
    paragraph("Customer", { bold: true }),
    paragraph(snapshot.contact.name),
    paragraph(
      [snapshot.contact.attention, snapshot.contact.city, snapshot.contact.country]
        .filter(Boolean)
        .join(" · "),
    ),
    new Paragraph({ text: "", spacing: { after: 160 } }),
  ];

  for (const option of snapshot.options) {
    children.push(new Paragraph({ text: option.label, heading: HeadingLevel.HEADING_2 }));
    if (option.pnr) children.push(paragraph(`PNR ${option.pnr}`));
    if (option.ticketingDeadline) children.push(paragraph(`Ticketing deadline ${option.ticketingDeadline}`));
    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          row(["Line", "Customer price"], { bold: true, right: [1] }),
          ...customerMoneyRows(
            option.lines,
            snapshot.currency,
            option.presentation,
            passengerCount,
          ).map((values) => row(values, { right: [1] })),
        ],
      }),
    );
    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          row(["Internal component", "Amount"], { bold: true, right: [1] }),
          row(["Cost", formatMoney(BigInt(option.costMinor), snapshot.currency)], { right: [1] }),
          row(["Markup", formatMoney(BigInt(option.markupMinor), snapshot.currency)], { right: [1] }),
          row(["VAT", formatMoney(BigInt(option.vatMinor), snapshot.currency)], { right: [1] }),
          row(["Other taxes", formatMoney(BigInt(option.taxesMinor), snapshot.currency)], { right: [1] }),
          row(["Total", formatMoney(BigInt(option.totalMinor), snapshot.currency)], { bold: true, right: [1] }),
        ],
      }),
    );
    children.push(new Paragraph({ text: "", spacing: { after: 160 } }));
  }

  if (snapshot.options.length > 1) {
    const grandTotal =
      BigInt(snapshot.totalMinor ?? "0") !== 0n
        ? BigInt(snapshot.totalMinor!)
        : snapshot.options.reduce((sum, option) => sum + BigInt(option.totalMinor), 0n);
    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          row(
            ["Quotation total", formatMoney(grandTotal, snapshot.currency)],
            { bold: true, right: [1] },
          ),
        ],
      }),
    );
    children.push(new Paragraph({ text: "", spacing: { after: 160 } }));
  }

  children.push(
    new Paragraph({
      children: [text("Internal document. Do not send this Word file to a customer.", { bold: true, size: 18 })],
    }),
  );

  const document = new Document({
    creator: snapshot.company.name,
    title: `Internal quotation ${snapshot.number}`,
    sections: [{ children }],
  });
  return Packer.toBuffer(document);
}

export async function buildProformaDocx(
  snapshot: ProformaSnapshot,
  internal?: FrozenTotals | null,
): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [
    ...companyBlock(snapshot),
    new Paragraph({ text: "", spacing: { after: 120 } }),
    new Paragraph({ text: WARNING, heading: HeadingLevel.HEADING_2 }),
    new Paragraph({ text: "Internal pro forma working document", heading: HeadingLevel.HEADING_1 }),
    paragraph(`Pro forma ${snapshot.number}`),
    paragraph(`Quotation ${snapshot.quotationNumber} · issued ${snapshot.issueDate}`),
    paragraph(`Customer: ${snapshot.contact.name}`),
    new Paragraph({ text: "", spacing: { after: 160 } }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        row(["Line", "Amount"], { bold: true, right: [1] }),
        ...customerMoneyRows(snapshot.lines, snapshot.currency, snapshot.presentation).map(
          (values) => row(values, { right: [1] }),
        ),
      ],
    }),
  ];

  if (internal) {
    children.push(
      new Paragraph({ text: "", spacing: { after: 120 } }),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          row(["Internal component", "Amount"], { bold: true, right: [1] }),
          row(["Cost", formatMoney(BigInt(internal.totals.costMinor), snapshot.currency)], { right: [1] }),
          row(["Markup", formatMoney(BigInt(internal.totals.markupMinor), snapshot.currency)], { right: [1] }),
          row(["VAT", formatMoney(BigInt(internal.totals.vatMinor), snapshot.currency)], { right: [1] }),
          row(["Other taxes", formatMoney(BigInt(internal.totals.taxesMinor), snapshot.currency)], { right: [1] }),
          row(["Total", formatMoney(BigInt(internal.totals.totalMinor), snapshot.currency)], { bold: true, right: [1] }),
        ],
      }),
    );
  }

  children.push(
    new Paragraph({
      children: [text("Internal document. Do not send this Word file to a customer.", { bold: true, size: 18 })],
    }),
  );

  const document = new Document({
    creator: snapshot.company.name,
    title: `Internal pro forma ${snapshot.number}`,
    sections: [{ children }],
  });
  return Packer.toBuffer(document);
}
