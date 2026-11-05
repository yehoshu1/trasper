import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFImage,
  type PDFPage,
} from "pdf-lib";

import {
  isDocumentTemplate,
  resolveDocumentHeader,
  splitFlightLegs,
} from "../lib/documents";
import type {
  DocumentBank,
  DocumentCompany,
  DocumentContact,
  DocumentFlight,
  DocumentLine,
  DocumentPassenger,
  DocumentTemplate,
  ItinerarySnapshot,
  ProformaSnapshot,
  QuotationSnapshot,
} from "../lib/documents";
import { formatMoney } from "../lib/money";
import { roundDiv } from "../lib/pricing";
import type { PricePresentation } from "../lib/pricing/presentation";
import {
  SERVICE_UNIT_PLURALS,
  isServiceUnit,
  taxRateLabel,
} from "../lib/pricing/presentation";
import { formatDuration, formatWallClockDate, formatWallClockTime } from "../lib/time";

/**
 * Server-side PDF rendering with pdf-lib (pure JavaScript — no browser).
 *
 * The content comes from the same frozen snapshots as the print pages, so a
 * downloaded PDF and the on-screen preview show the same document. Images
 * (letterhead, airline logos) are embedded from uploads/.
 */

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 42;
const CONTENT = A4.width - MARGIN * 2;
const FOOTER_SPACE = 34;

const COLORS = {
  brand: rgb(0.137, 0.416, 0.475),
  brandDark: rgb(0.118, 0.239, 0.275),
  ink: rgb(0.06, 0.09, 0.16),
  slate: rgb(0.29, 0.33, 0.41),
  muted: rgb(0.58, 0.64, 0.71),
  line: rgb(0.88, 0.91, 0.94),
  pale: rgb(0.97, 0.98, 0.99),
  white: rgb(1, 1, 1),
  bandMuted: rgb(0.78, 0.84, 0.85),
};

interface PdfTheme {
  accent: Color;
  tableHeadBg: Color;
  tableHeadText: Color;
  tableHeadBorder?: Color;
  bandBg: Color;
  bandText: Color;
  bandMuted: Color;
  accentBar?: Color;
  headerStyle: "classic" | "band" | "minimal" | "centered" | "vivid";
}

const PDF_THEMES: Record<DocumentTemplate, PdfTheme> = {
  classic: {
    accent: COLORS.brand,
    tableHeadBg: COLORS.pale,
    tableHeadText: COLORS.muted,
    bandBg: COLORS.brand,
    bandText: COLORS.white,
    bandMuted: COLORS.bandMuted,
    headerStyle: "classic",
  },
  modern: {
    accent: COLORS.brandDark,
    tableHeadBg: COLORS.brandDark,
    tableHeadText: COLORS.white,
    bandBg: COLORS.brandDark,
    bandText: COLORS.white,
    bandMuted: COLORS.bandMuted,
    headerStyle: "band",
  },
  minimal: {
    accent: COLORS.ink,
    tableHeadBg: COLORS.white,
    tableHeadText: COLORS.ink,
    tableHeadBorder: COLORS.ink,
    bandBg: COLORS.white,
    bandText: COLORS.ink,
    bandMuted: COLORS.slate,
    headerStyle: "minimal",
  },
  executive: {
    accent: rgb(0.114, 0.208, 0.341),
    tableHeadBg: rgb(0.114, 0.208, 0.341),
    tableHeadText: COLORS.white,
    tableHeadBorder: rgb(0.706, 0.541, 0.184),
    bandBg: rgb(0.114, 0.208, 0.341),
    bandText: COLORS.white,
    bandMuted: rgb(0.9, 0.87, 0.78),
    accentBar: rgb(0.706, 0.541, 0.184),
    headerStyle: "centered",
  },
  vivid: {
    accent: rgb(0.114, 0.306, 0.847),
    tableHeadBg: rgb(0.114, 0.306, 0.847),
    tableHeadText: COLORS.white,
    tableHeadBorder: rgb(0.961, 0.62, 0.043),
    bandBg: rgb(0.114, 0.306, 0.847),
    bandText: COLORS.white,
    bandMuted: rgb(0.82, 0.88, 1),
    accentBar: rgb(0.961, 0.62, 0.043),
    headerStyle: "vivid",
  },
};

type FontKind = "regular" | "bold" | "italic";
type Color = ReturnType<typeof rgb>;

interface TextOptions {
  size?: number;
  font?: FontKind;
  color?: Color;
  centered?: boolean;
  right?: boolean;
  maxWidth?: number;
}

/** WinAnsi has no arrow; keep every other character as-is. */
function clean(text: string): string {
  return text
    .replace(/\u2192/g, "->")
    .replace(/\u2190/g, "<-")
    .replace(/\u00a0/g, " ")
    .replace(/\u2011/g, "-");
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** UK-style document date: 2026-10-31 -> 31 Oct 2026. */
function displayDate(value: string | undefined): string {
  if (!value) return "";
  const [year, month, day] = value.slice(0, 10).split("-");
  if (!year || !month || !day) return value;
  return `${Number(day)} ${MONTHS[Number(month) - 1] ?? month} ${year}`;
}

class PdfBuilder {
  private readonly pdf: PDFDocument;
  private readonly fonts: Record<FontKind, PDFFont>;
  private readonly uploadDir: string;
  private readonly images = new Map<string, PDFImage | null>();
  private page!: PDFPage;
  private y = 0;
  private readonly template: DocumentTemplate;
  private readonly theme: PdfTheme;

  private constructor(
    pdf: PDFDocument,
    fonts: Record<FontKind, PDFFont>,
    template: DocumentTemplate,
  ) {
    this.pdf = pdf;
    this.fonts = fonts;
    this.template = template;
    this.theme = PDF_THEMES[template];
    this.uploadDir = path.resolve(process.env.UPLOAD_DIR ?? "./uploads");
    this.newPage();
  }

  static async create(template?: DocumentTemplate): Promise<PdfBuilder> {
    const pdf = await PDFDocument.create();
    return new PdfBuilder(
      pdf,
      {
        regular: await pdf.embedFont(StandardFonts.Helvetica),
        bold: await pdf.embedFont(StandardFonts.HelveticaBold),
        italic: await pdf.embedFont(StandardFonts.HelveticaOblique),
      },
      template === undefined ? "classic" : isDocumentTemplate(template) ? template : "classic",
    );
  }

  get documentTemplate(): DocumentTemplate {
    return this.template;
  }

  get palette(): PdfTheme {
    return this.theme;
  }

  get pageRef(): PDFPage {
    return this.page;
  }

  get cursor(): number {
    return this.y;
  }

  set cursor(value: number) {
    this.y = value;
  }

  font(kind: FontKind = "regular"): PDFFont {
    return this.fonts[kind];
  }

  widthOf(text: string, size: number, kind: FontKind = "regular"): number {
    return this.fonts[kind].widthOfTextAtSize(clean(text), size);
  }

  newPage(): void {
    this.page = this.pdf.addPage([A4.width, A4.height]);
    this.y = A4.height - MARGIN;
  }

  ensure(height: number): void {
    if (this.y - height < MARGIN + FOOTER_SPACE) this.newPage();
  }

  /** Draw text at an explicit top coordinate (no cursor movement). */
  at(text: string, x: number, top: number, options: TextOptions = {}): void {
    const size = options.size ?? 9;
    const kind = options.font ?? "regular";
    const width = this.widthOf(text, size, kind);
    const drawX = options.centered
      ? x + ((options.maxWidth ?? CONTENT) - width) / 2
      : options.right
        ? x + (options.maxWidth ?? CONTENT) - width
        : x;
    this.page.drawText(clean(text), {
      x: drawX,
      y: top - size,
      size,
      font: this.fonts[kind],
      color: options.color ?? COLORS.ink,
    });
  }

  /** Draw a single line and advance the cursor. */
  line(text: string, x: number, options: TextOptions = {}): void {
    const size = options.size ?? 9;
    this.at(text, x, this.y, options);
    this.y -= size * 1.35;
  }

  /** Left value and right-aligned value on the same line, then advance. */
  pair(left: string, right: string, options: TextOptions = {}): void {
    this.at(left, MARGIN, this.y, options);
    this.at(right, MARGIN, this.y, { ...options, right: true });
    this.y -= (options.size ?? 9) * 1.35;
  }

  wrap(text: string, size: number, maxWidth: number, kind: FontKind = "regular"): string[] {
    const font = this.fonts[kind];
    const lines: string[] = [];
    for (const raw of clean(text).split(/\r?\n/)) {
      const words = raw.split(/\s+/).filter(Boolean);
      let current = "";
      for (const word of words) {
        const candidate = current ? `${current} ${word}` : word;
        if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
          current = candidate;
        } else {
          if (current) lines.push(current);
          current = word;
        }
      }
      lines.push(current);
    }
    return lines.length > 0 ? lines : [""];
  }

  /** Wrapped paragraph at a given x; advances the cursor. */
  paragraph(
    text: string,
    options: TextOptions & { x?: number; lineHeight?: number } = {},
  ): void {
    const size = options.size ?? 9;
    const maxWidth = options.maxWidth ?? CONTENT - ((options.x ?? MARGIN) - MARGIN);
    const lineHeight = options.lineHeight ?? size * 1.35;
    for (const line of this.wrap(text, size, maxWidth, options.font)) {
      this.ensure(lineHeight);
      this.at(line, options.x ?? MARGIN, this.y, options);
      this.y -= lineHeight;
    }
  }

  gap(height: number): void {
    this.y -= height;
  }

  rule(color: Color = COLORS.line, thickness = 0.75): void {
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: MARGIN + CONTENT, y: this.y },
      thickness,
      color,
    });
    this.y -= 1;
  }

  /** Draw an image scaled into the given box; returns the drawn height. */
  async imageAt(
    url: string | undefined,
    x: number,
    top: number,
    maxWidth: number,
    maxHeight: number,
  ): Promise<number> {
    if (!url) return 0;
    const image = await this.loadImage(url);
    if (!image) return 0;
    const scale = Math.min(maxWidth / image.width, maxHeight / image.height);
    const width = image.width * scale;
    const height = image.height * scale;
    this.page.drawImage(image, { x, y: top - height, width, height });
    return height;
  }

  /** Image at the left margin that also advances the cursor. */
  async image(url: string | undefined, maxWidth: number, maxHeight: number): Promise<void> {
    this.ensure(maxHeight + 6);
    const height = await this.imageAt(url, MARGIN, this.y, maxWidth, maxHeight);
    if (height > 0) {
      this.y -= height + 6;
    }
  }

  private async loadImage(url: string): Promise<PDFImage | null> {
    if (this.images.has(url)) return this.images.get(url) ?? null;
    let image: PDFImage | null = null;
    try {
      const relative = url.replace(/^\/uploads\//, "").replace(/^\/+/, "");
      if (relative.startsWith("attachments/")) {
        this.images.set(url, null);
        return null;
      }
      const file = path.resolve(this.uploadDir, relative);
      if (!file.startsWith(`${this.uploadDir}${path.sep}`)) {
        this.images.set(url, null);
        return null;
      }
      const stats = await lstat(file);
      if (stats.isSymbolicLink() || !stats.isFile() || stats.size > 5 * 1024 * 1024) {
        this.images.set(url, null);
        return null;
      }
      const bytes = await readFile(file);
      if (/\.png$/i.test(file)) image = await this.pdf.embedPng(bytes);
      else if (/\.jpe?g$/i.test(file)) image = await this.pdf.embedJpg(bytes);
    } catch {
      image = null;
    }
    this.images.set(url, image);
    return image;
  }

  finish(companyName: string, number: string): Promise<Uint8Array> {
    const pages = this.pdf.getPages();
    const total = pages.length;
    pages.forEach((page, index) => {
      page.drawLine({
        start: { x: MARGIN, y: MARGIN - 8 },
        end: { x: MARGIN + CONTENT, y: MARGIN - 8 },
        thickness: 0.75,
        color: COLORS.line,
      });
      page.drawText(clean(`${companyName} - ${number}`), {
        x: MARGIN,
        y: MARGIN - 20,
        size: 7.5,
        font: this.fonts.regular,
        color: COLORS.muted,
      });
      const label = `Page ${index + 1} of ${total}`;
      page.drawText(label, {
        x: MARGIN + CONTENT - this.widthOf(label, 7.5),
        y: MARGIN - 20,
        size: 7.5,
        font: this.fonts.regular,
        color: COLORS.muted,
      });
    });
    return this.pdf.save();
  }
}

// Types used by the builder need the embedded font type.
type PDFFont = Awaited<ReturnType<PDFDocument["embedFont"]>>;

// --------------------------------------------------------------------------
// Shared blocks
// --------------------------------------------------------------------------

function contactLines(contact: DocumentContact): string[] {
  return [
    contact.name,
    contact.attention ?? "",
    contact.poBox ?? "",
    contact.physicalAddress ?? "",
    [contact.city, contact.country].filter(Boolean).join(", "),
    contact.email ?? "",
    contact.phone ?? "",
  ].filter((line) => line.trim() !== "");
}

function passengerLine(passenger: DocumentPassenger): string {
  const name = [passenger.title, passenger.firstName, passenger.lastName].filter(Boolean).join(" ");
  return `${name} (${passenger.type})`;
}

function documentPassengerCount(passengers: DocumentPassenger[]): number {
  return passengers.reduce(
    (sum, passenger) => sum + (passenger.unnamed ? Math.max(1, passenger.quantity ?? 1) : 1),
    0,
  );
}

function modernDocumentBand(
  builder: PdfBuilder,
  company: DocumentCompany,
  title: string,
  number: string,
): void {
  const top = builder.cursor;
  const height = 66;
  builder.pageRef.drawRectangle({
    x: MARGIN,
    y: top - height,
    width: CONTENT,
    height,
    color: builder.palette.bandBg,
  });

  const left = MARGIN + 12;
  const textWidth = CONTENT - 190;
  builder.at(company.name, left, top - 14, {
    size: 16,
    font: "bold",
    color: builder.palette.bandText,
  });
  const contactLine = [company.phone, company.email, company.website].filter(Boolean).join("  |  ");
  const detailLines = [
    ...builder.wrap(company.address, 8, textWidth),
    ...builder.wrap(contactLine, 8, textWidth),
    ...(company.tin ? builder.wrap(`TIN ${company.tin}`, 8, textWidth) : []),
  ].slice(0, 3);
  let y = top - 32;
  for (const line of detailLines) {
    builder.at(line, left, y, { size: 8, color: builder.palette.bandMuted });
    y -= 10;
  }

  builder.at(title.toUpperCase(), MARGIN, top - 16, {
    size: 9,
    font: "bold",
    color: builder.palette.bandText,
    right: true,
    maxWidth: CONTENT - 12,
  });
  builder.at(number, MARGIN, top - 30, {
    size: 12,
    font: "bold",
    color: builder.palette.bandText,
    right: true,
    maxWidth: CONTENT - 12,
  });
  builder.cursor = top - height - 14;
}

function modernDocumentStrip(builder: PdfBuilder, title: string, number: string): void {
  const top = builder.cursor;
  const height = 22;
  builder.pageRef.drawRectangle({
    x: MARGIN,
    y: top - height,
    width: CONTENT,
    height,
    color: builder.palette.bandBg,
  });
  builder.at(title.toUpperCase(), MARGIN + 8, top - 7, {
    size: 8,
    font: "bold",
    color: builder.palette.bandText,
  });
  builder.at(number, MARGIN, top - 7, {
    size: 8,
    font: "bold",
    color: builder.palette.bandText,
    right: true,
    maxWidth: CONTENT - 8,
  });
  builder.cursor = top - height - 10;
}

async function minimalHeader(
  builder: PdfBuilder,
  company: DocumentCompany,
  title: string,
  number: string,
): Promise<void> {
  const top = builder.cursor;
  const logoWidth = company.headerImage ? 56 : 0;
  if (company.headerImage) {
    await builder.imageAt(company.headerImage, MARGIN, top, 50, 26);
  }
  const left = MARGIN + (logoWidth ? logoWidth + 10 : 0);
  const width = CONTENT - (left - MARGIN);
  builder.at(company.name.toUpperCase(), left, top, {
    size: 13,
    font: "bold",
    color: COLORS.ink,
  });
  const contactLine = [company.phone, company.email, company.website].filter(Boolean).join("  |  ");
  const detailLines = [
    ...builder.wrap(company.address, 8, width),
    ...builder.wrap(contactLine, 8, width),
    ...(company.tin ? [`TIN ${company.tin}`] : []),
  ].slice(0, 5);
  let y = top - 15;
  for (const line of detailLines) {
    builder.at(line, left, y, { size: 8, color: COLORS.slate });
    y -= 9.5;
  }

  builder.at(title.toUpperCase(), MARGIN, top, {
    size: 8,
    font: "bold",
    color: COLORS.slate,
    right: true,
    maxWidth: CONTENT,
  });
  builder.at(number, MARGIN, top - 12, {
    size: 10,
    font: "bold",
    color: COLORS.ink,
    right: true,
    maxWidth: CONTENT,
  });

  builder.cursor = Math.min(y, top - 26) - 3;
  builder.rule(COLORS.ink, 0.75);
  builder.gap(10);
}

async function executiveHeader(
  builder: PdfBuilder,
  company: DocumentCompany,
  title: string,
  number: string,
): Promise<void> {
  const gold = builder.palette.accentBar ?? builder.palette.accent;
  if (company.headerImage) {
    await builder.imageAt(company.headerImage, MARGIN + CONTENT / 2 - 30, builder.cursor, 60, 28);
    builder.gap(34);
  }
  builder.paragraph(company.name, {
    centered: true,
    size: 17,
    font: "bold",
    color: builder.palette.bandBg,
    lineHeight: 20,
  });
  builder.paragraph(company.address, {
    centered: true, size: 8.5, color: COLORS.slate, lineHeight: 11,
  });
  builder.paragraph(
    [company.phone, company.email, company.website].filter(Boolean).join("  |  "),
    { centered: true, size: 8.5, color: COLORS.slate, lineHeight: 11 },
  );
  if (company.tin) {
    builder.paragraph(`TIN ${company.tin}`, {
      centered: true, size: 8.5, color: COLORS.slate, lineHeight: 11,
    });
  }
  builder.gap(3);
  builder.rule(gold, 1.25);
  builder.gap(2);
  builder.rule(gold, 0.5);
  builder.gap(5);
  builder.paragraph(title.toUpperCase(), {
    centered: true, size: 8, font: "bold", color: builder.palette.bandBg, lineHeight: 10,
  });
  builder.paragraph(number, {
    centered: true, size: 11, font: "bold", color: builder.palette.bandBg, lineHeight: 14,
  });
  builder.gap(9);
}

function vividDocumentBand(
  builder: PdfBuilder,
  company: DocumentCompany,
  title: string,
  number: string,
): void {
  const top = builder.cursor;
  const bar = 6;
  const height = 78;
  if (builder.palette.accentBar) {
    builder.pageRef.drawRectangle({
      x: MARGIN,
      y: top - bar,
      width: CONTENT,
      height: bar,
      color: builder.palette.accentBar,
    });
  }
  builder.pageRef.drawRectangle({
    x: MARGIN,
    y: top - height,
    width: CONTENT,
    height: height - bar,
    color: builder.palette.bandBg,
  });

  builder.at(title.toUpperCase(), MARGIN + 12, top - 26, {
    size: 24,
    font: "bold",
    color: builder.palette.bandText,
  });
  builder.at(number, MARGIN + 12, top - 50, {
    size: 12,
    font: "bold",
    color: builder.palette.bandMuted,
  });

  const rightWidth = 210;
  builder.at(company.name, MARGIN, top - 20, {
    size: 12,
    font: "bold",
    color: builder.palette.bandText,
    right: true,
    maxWidth: CONTENT - 12,
  });
  const contactLine = [company.phone, company.email, company.website].filter(Boolean).join("  |  ");
  const detailLines = [
    ...builder.wrap(company.address, 8, rightWidth),
    ...builder.wrap(contactLine, 8, rightWidth),
    ...(company.tin ? [`TIN ${company.tin}`] : []),
  ].slice(0, 3);
  let y = top - 34;
  for (const line of detailLines) {
    builder.at(line, MARGIN, y, {
      size: 8,
      color: builder.palette.bandMuted,
      right: true,
      maxWidth: CONTENT - 12,
    });
    y -= 9.5;
  }

  builder.cursor = top - height - 14;
}

async function companyHeader(
  builder: PdfBuilder,
  company: DocumentCompany,
  title: string,
  number: string,
): Promise<void> {
  const style = builder.palette.headerStyle;
  if (resolveDocumentHeader(company) === "letterhead") {
    await builder.image(company.letterhead, CONTENT, 150);
    // The uploaded image normally carries the branding only, so the TIN is a
    // separate line beneath it rather than assumed to be part of the picture.
    if (company.tin) {
      builder.paragraph(`TIN ${company.tin}`, {
        size: 8,
        color: COLORS.slate,
        lineHeight: 11,
        right: true,
      });
      builder.gap(4);
    } else {
      builder.gap(6);
    }
    if (style === "band" || style === "vivid") {
      modernDocumentStrip(builder, title, number);
    } else if (style === "minimal") {
      builder.rule(COLORS.ink, 0.75);
      builder.gap(8);
    } else if (style === "centered") {
      const gold = builder.palette.accentBar ?? builder.palette.accent;
      builder.rule(gold, 1.25);
      builder.gap(2);
      builder.rule(gold, 0.5);
      builder.gap(8);
    }
    return;
  }
  if (style === "band") {
    modernDocumentBand(builder, company, title, number);
    return;
  }
  if (style === "vivid") {
    vividDocumentBand(builder, company, title, number);
    return;
  }
  if (style === "minimal") {
    await minimalHeader(builder, company, title, number);
    return;
  }
  if (style === "centered") {
    await executiveHeader(builder, company, title, number);
    return;
  }
  if (company.headerImage) {
    await builder.image(company.headerImage, 160, 44);
  }
  builder.paragraph(company.name, {
    size: 16, font: "bold", color: builder.palette.accent, lineHeight: 19,
  });
  builder.paragraph(company.address, { size: 8.5, color: COLORS.slate, lineHeight: 11 });
  builder.paragraph(
    [company.phone, company.email, company.website].filter(Boolean).join("  |  "),
    { size: 8.5, color: COLORS.slate, lineHeight: 11 },
  );
  if (company.tin) {
    builder.paragraph(`TIN ${company.tin}`, { size: 8.5, color: COLORS.slate, lineHeight: 11 });
  }
  builder.gap(6);
  builder.rule(builder.palette.accent, 1.5);
  builder.gap(8);
}

interface PartyOptions {
  title: string;
  number: string;
  meta: { label: string; value: string }[];
  contact: DocumentContact;
  passengers: DocumentPassenger[];
  referenceNo?: string;
}

function partyBlock(builder: PdfBuilder, options: PartyOptions): void {
  const startY = builder.cursor;
  const col1 = MARGIN;
  const col2 = MARGIN + CONTENT * 0.34;
  const col3 = MARGIN + CONTENT * 0.71;
  const width1 = CONTENT * 0.31;
  const width2 = CONTENT * 0.34;
  const width3 = CONTENT * 0.27;

  builder.cursor = startY;
  builder.paragraph(options.title.toUpperCase(), {
    x: col1, maxWidth: width1, size: 7.5, font: "bold", color: builder.palette.accent, lineHeight: 10,
  });
  builder.paragraph(options.number, { x: col1, maxWidth: width1, size: 12, font: "bold", lineHeight: 15 });
  for (const entry of options.meta) {
    builder.paragraph(entry.label.toUpperCase(), {
      x: col1, maxWidth: width1, size: 6.5, color: COLORS.muted, lineHeight: 9,
    });
    builder.paragraph(entry.value, { x: col1, maxWidth: width1, size: 9, lineHeight: 12 });
  }
  const leftBottom = builder.cursor;

  builder.cursor = startY;
  builder.paragraph("Customer", {
    x: col2, maxWidth: width2, size: 7.5, font: "bold", color: builder.palette.accent, lineHeight: 10,
  });
  for (const line of contactLines(options.contact)) {
    builder.paragraph(line, { x: col2, maxWidth: width2, size: 8.5, lineHeight: 11.5 });
  }
  const middleBottom = builder.cursor;

  builder.cursor = startY;
  builder.paragraph("Passengers", {
    x: col3, maxWidth: width3, size: 7.5, font: "bold", color: builder.palette.accent, lineHeight: 10,
  });
  if (options.passengers.length === 0) {
    builder.paragraph("To be advised", {
      x: col3, maxWidth: width3, size: 8.5, color: COLORS.muted, lineHeight: 11.5,
    });
  } else {
    for (const passenger of options.passengers) {
      builder.paragraph(passengerLine(passenger), {
        x: col3, maxWidth: width3, size: 8.5, lineHeight: 11.5,
      });
    }
  }
  if (options.referenceNo) {
    builder.paragraph(`Your reference: ${options.referenceNo}`, {
      x: col3, maxWidth: width3, size: 8, color: COLORS.slate, lineHeight: 11,
    });
  }
  const rightBottom = builder.cursor;

  builder.cursor = Math.min(leftBottom, middleBottom, rightBottom) - 6;
  builder.rule();
  builder.gap(8);
}

// --------------------------------------------------------------------------
// Flights
// --------------------------------------------------------------------------

const FLIGHT_COLUMNS = [70, 72, 140, 78, 78, 77];
const FLIGHT_ROW = 38;

function flightHeader(builder: PdfBuilder): void {
  const labels = ["Airline", "Flight", "Route", "Departs", "Arrives", "Duration"];
  builder.pageRef.drawRectangle({
    x: MARGIN, y: builder.cursor - 16, width: CONTENT, height: 16, color: builder.palette.tableHeadBg,
  });
  let x = MARGIN;
  labels.forEach((label, index) => {
    builder.at(label.toUpperCase(), x + 4, builder.cursor - 4, {
      size: 6.5, font: "bold", color: builder.palette.tableHeadText,
    });
    x += FLIGHT_COLUMNS[index];
  });
  if (builder.palette.tableHeadBorder) {
    builder.pageRef.drawLine({
      start: { x: MARGIN, y: builder.cursor - 16 },
      end: { x: MARGIN + CONTENT, y: builder.cursor - 16 },
      thickness: 0.75,
      color: builder.palette.tableHeadBorder,
    });
  }
  builder.gap(20);
}

async function drawFlights(builder: PdfBuilder, flights: DocumentFlight[]): Promise<void> {
  if (flights.length === 0) {
    builder.paragraph("Flight details to be advised.", { size: 9, color: COLORS.muted });
    return;
  }
  const legs = splitFlightLegs(flights);
  const groups: { label: string | null; group: DocumentFlight[] }[] = legs.returnLeg
    ? [
        { label: "Outbound", group: legs.outbound },
        { label: "Return", group: legs.returnLeg },
      ]
    : [{ label: null, group: legs.outbound }];

  for (const { label, group } of groups) {
    if (label) {
      builder.ensure(30);
      builder.paragraph(label.toUpperCase(), {
        size: 8, font: "bold", color: builder.palette.accent, lineHeight: 12,
      });
      builder.gap(2);
    }
    builder.ensure(FLIGHT_ROW + 22);
    flightHeader(builder);

    for (let i = 0; i < group.length; i += 1) {
      const flight = group[i];
      if (builder.cursor - FLIGHT_ROW < MARGIN + FOOTER_SPACE) {
        builder.newPage();
        flightHeader(builder);
      }
      const top = builder.cursor;
      let x = MARGIN;

      const logoHeight = await builder.imageAt(
        flight.airlineLogo, x + 4, top - 2, FLIGHT_COLUMNS[0] - 10, 18,
      );
      if (logoHeight === 0) {
        const nameLines = builder
          .wrap(flight.airlineName, 7.5, FLIGHT_COLUMNS[0] - 8, "bold")
          .slice(0, 3);
        nameLines.forEach((line, lineIndex) => {
          builder.at(line, x + 4, top - 2 - lineIndex * 8.75, {
            size: 7.5, font: "bold",
          });
        });
      }
      x += FLIGHT_COLUMNS[0];

      builder.at(flight.flightNo, x + 4, top - 2, { size: 8.5, font: "bold" });
      if (flight.operatingCarrier) {
        builder
          .wrap(`Operated by ${flight.operatingCarrier}`, 6.5, FLIGHT_COLUMNS[1] - 8)
          .slice(0, 2)
          .forEach((line, lineIndex) => {
            builder.at(line, x + 4, top - 13 - lineIndex * 7, {
              size: 6.5,
              color: COLORS.slate,
            });
          });
      }
      x += FLIGHT_COLUMNS[1];

      builder.at(`${flight.fromIata} -> ${flight.toIata}`, x + 4, top - 2, {
        size: 8.5, font: "bold",
      });
      builder.at(`${flight.fromCity} to ${flight.toCity}`, x + 4, top - 16, {
        size: 7.5, color: COLORS.slate,
      });
      x += FLIGHT_COLUMNS[2];

      builder.at(formatWallClockTime(flight.departLocal), x + 4, top - 2, {
        size: 8.5, font: "bold",
      });
      builder.at(formatWallClockDate(flight.departLocal), x + 4, top - 16, {
        size: 7.5, color: COLORS.slate,
      });
      x += FLIGHT_COLUMNS[3];

      builder.at(formatWallClockTime(flight.arriveLocal), x + 4, top - 2, {
        size: 8.5, font: "bold",
      });
      builder.at(formatWallClockDate(flight.arriveLocal), x + 4, top - 16, {
        size: 7.5, color: COLORS.slate,
      });
      x += FLIGHT_COLUMNS[4];

      builder.at(formatDuration(flight.durationMinutes), x + 4, top - 2, { size: 8.5 });

      builder.cursor = top - FLIGHT_ROW + 6;
      builder.rule();
      builder.cursor = top - FLIGHT_ROW;

      if (i < group.length - 1 && flight.layoverAfterMinutes !== undefined) {
        builder.ensure(14);
        builder.pageRef.drawRectangle({
          x: MARGIN, y: builder.cursor - 12, width: CONTENT, height: 12, color: COLORS.pale,
        });
        builder.at(
          `Layover in ${flight.toCity} (${flight.toIata}) - ${formatDuration(flight.layoverAfterMinutes)}`,
          MARGIN + 4,
          builder.cursor - 2,
          { size: 7.5, font: "italic", color: COLORS.slate },
        );
        builder.gap(14);
      }
    }
    builder.gap(8);
  }
}

// --------------------------------------------------------------------------
// Money, bank, notes
// --------------------------------------------------------------------------

function moneyTable(
  builder: PdfBuilder,
  lines: DocumentLine[],
  currency: string,
  totalMinor: string,
  options: {
    vatMinor?: string;
    vatRateBps?: string;
    showVat?: boolean;
    presentation?: PricePresentation;
    alwaysShowPerPerson?: boolean;
    perPersonCount?: number;
  } = {},
): void {
  const format = (value: string) => formatMoney(BigInt(value), currency);
  const presentation = options.presentation;
  const perPersonCount = presentation?.passengerCount ?? options.perPersonCount;
  const perPersonMinor =
    presentation?.perPersonMinor ??
    (options.alwaysShowPerPerson && perPersonCount && perPersonCount > 0
      ? roundDiv(BigInt(totalMinor), BigInt(perPersonCount)).toString()
      : undefined);
  const perPersonLabel = presentation?.perPersonLabel ?? "Price per person";

  const rows: { description: string; amountMinor: string }[] = [];
  if (presentation) {
    for (const line of presentation.lines) {
      const parts = [line.description];
      if (line.detail) parts.push(line.detail);
      if (line.quantity && line.unit) {
        const unit = isServiceUnit(line.unit)
          ? line.quantity === 1
            ? line.unit.replace("_", " / ")
            : SERVICE_UNIT_PLURALS[line.unit]
          : line.unit;
        parts.push(
          `${line.quantity} ${unit}${line.unitAmountMinor ? ` x ${format(line.unitAmountMinor)}` : ""}`,
        );
      }
      rows.push({ description: parts.join("  -  "), amountMinor: line.amountMinor });
    }
    if (BigInt(presentation.serviceFeeMinor) !== 0n) {
      rows.push({
        description: presentation.serviceFeeLabel,
        amountMinor: presentation.serviceFeeMinor,
      });
    }
    for (const tax of presentation.taxLines) {
      const rate = tax.kind === "percent" ? ` (${taxRateLabel(tax)})` : "";
      rows.push({ description: `${tax.name}${rate}`, amountMinor: tax.amountMinor });
    }
  } else {
    rows.push(...lines.map((line) => ({
      description: line.description,
      amountMinor: line.amountMinor,
    })));
  }

  if (presentation && perPersonMinor) {
    rows.push({
      description: `${perPersonLabel}${perPersonCount ? ` (${perPersonCount} traveller${perPersonCount === 1 ? "" : "s"})` : ""}`,
      amountMinor: perPersonMinor,
    });
  }

  const totalLabel = presentation?.totalLabel ?? "Total";
  const top = builder.cursor;
  builder.pageRef.drawRectangle({
    x: MARGIN, y: top - 15, width: CONTENT, height: 15, color: builder.palette.tableHeadBg,
  });
  builder.at("DESCRIPTION", MARGIN + 4, top - 6, { size: 6.5, font: "bold", color: builder.palette.tableHeadText });
  builder.at("AMOUNT", MARGIN, top - 6, { size: 6.5, font: "bold", color: builder.palette.tableHeadText, right: true });
  if (builder.palette.tableHeadBorder) {
    builder.pageRef.drawLine({
      start: { x: MARGIN, y: top - 15 },
      end: { x: MARGIN + CONTENT, y: top - 15 },
      thickness: 0.75,
      color: builder.palette.tableHeadBorder,
    });
  }
  builder.gap(19);

  // Keep the last line and the total on the same page.
  const totalBlock = 42;
  const wrappedRows = rows.map((row) => {
    const wrapped = builder.wrap(row.description, 8.5, CONTENT - 140);
    return { row, wrapped, height: Math.max(15, wrapped.length * 11 + 4) };
  });
  for (let index = 0; index < wrappedRows.length; index += 1) {
    const entry = wrappedRows[index];
    const isLast = index === wrappedRows.length - 1;
    builder.ensure(entry.height + (isLast ? totalBlock : 0));
    const rowTop = builder.cursor;
    entry.wrapped.forEach((part, lineIndex) => {
      builder.at(part, MARGIN + 4, rowTop - 2 - lineIndex * 11, { size: 8.5 });
    });
    builder.at(format(entry.row.amountMinor), MARGIN, rowTop - 2, { size: 8.5, right: true });
    builder.cursor = rowTop - entry.height;
    builder.rule();
  }

  if (!presentation && options.showVat && options.vatMinor && BigInt(options.vatMinor) !== 0n) {
    const rate = options.vatRateBps ? ` (${Number(options.vatRateBps) / 100}%)` : "";
    builder.ensure(16);
    builder.at(`VAT included${rate}`, MARGIN + 4, builder.cursor - 2, { size: 8.5, color: COLORS.slate });
    builder.at(format(options.vatMinor), MARGIN, builder.cursor - 2, { size: 8.5, right: true });
    builder.gap(15);
  }

  builder.ensure(26);
  builder.rule(COLORS.ink, 1.25);
  builder.gap(3);
  builder.at(totalLabel.toUpperCase(), MARGIN + 4, builder.cursor, { size: 10, font: "bold" });
  builder.at(format(totalMinor), MARGIN, builder.cursor, { size: 11, font: "bold", right: true });
  builder.gap(18);

  if (presentation) {
    if (presentation.taxNote) {
      builder.ensure(14);
      builder.paragraph(presentation.taxNote, { size: 7.5, color: COLORS.muted, lineHeight: 10 });
    }
    if (presentation.taxRegistrationNumber) {
      builder.ensure(14);
      builder.paragraph(
        `${presentation.vatLabel} registration number ${presentation.taxRegistrationNumber}.`,
        { size: 7.5, color: COLORS.muted, lineHeight: 10 },
      );
    }
  }
}

function bankBlock(
  builder: PdfBuilder,
  bank: DocumentBank | null,
  currency: string,
  x: number,
  width: number,
): void {
  builder.paragraph("Payment details", {
    x, maxWidth: width, size: 7.5, font: "bold", color: builder.palette.accent, lineHeight: 10,
  });
  if (!bank) {
    builder.paragraph(`Bank details for ${currency} will be provided with the invoice.`, {
      x, maxWidth: width, size: 8, color: COLORS.muted,
    });
    return;
  }
  builder.paragraph(bank.bankName, { x, maxWidth: width, size: 8.5, font: "bold", lineHeight: 11 });
  builder.paragraph(`Account name: ${bank.accountName}`, { x, maxWidth: width, size: 8, lineHeight: 11 });
  builder.paragraph(`Account number: ${bank.accountNumber}`, { x, maxWidth: width, size: 8, lineHeight: 11 });
  if (bank.branch) builder.paragraph(`Branch: ${bank.branch}`, { x, maxWidth: width, size: 8, lineHeight: 11 });
  if (bank.swift) builder.paragraph(`SWIFT: ${bank.swift}`, { x, maxWidth: width, size: 8, lineHeight: 11 });
  if (bank.sortCode) builder.paragraph(`Sort code: ${bank.sortCode}`, { x, maxWidth: width, size: 8, lineHeight: 11 });
  if (bank.instructions) {
    builder.paragraph(bank.instructions, { x, maxWidth: width, size: 8, color: COLORS.slate, lineHeight: 11 });
  }
}

function signatureBlock(builder: PdfBuilder, companyName: string): void {
  builder.ensure(72);
  builder.gap(8);
  builder.rule(COLORS.line, 0.75);
  builder.gap(4);
  builder.paragraph("SIGNED BY", {
    size: 7.5, font: "bold", color: builder.palette.accent, lineHeight: 10,
  });
  builder.paragraph(`For and on behalf of ${companyName}`, {
    size: 8, color: COLORS.slate, lineHeight: 11,
  });
  builder.gap(6);
  const top = builder.cursor;
  const leftWidth = CONTENT * 0.42;
  const rightX = MARGIN + CONTENT * 0.56;
  const rightWidth = CONTENT * 0.44;
  builder.pageRef.drawLine({
    start: { x: MARGIN, y: top - 22 },
    end: { x: MARGIN + leftWidth, y: top - 22 },
    thickness: 0.75,
    color: COLORS.slate,
  });
  builder.pageRef.drawLine({
    start: { x: rightX, y: top - 22 },
    end: { x: rightX + rightWidth, y: top - 22 },
    thickness: 0.75,
    color: COLORS.slate,
  });
  builder.at("Name and signature", MARGIN, top - 24, { size: 7, color: COLORS.muted });
  builder.at("Date", rightX, top - 24, { size: 7, color: COLORS.muted });
  builder.cursor = top - 42;
}

function notesBlock(
  builder: PdfBuilder,
  notes: string,
  title = "Important notes",
  x = MARGIN,
  width = CONTENT,
): void {
  if (!notes) return;
  builder.paragraph(title, {
    x, maxWidth: width, size: 7.5, font: "bold", color: builder.palette.accent, lineHeight: 10,
  });
  builder.paragraph(notes, { x, maxWidth: width, size: 8, color: COLORS.slate, lineHeight: 11 });
}

// --------------------------------------------------------------------------
// Documents
// --------------------------------------------------------------------------

function flightSummary(flights: DocumentFlight[]): string {
  if (flights.length === 0) return "";
  const first = flights[0];
  const last = flights[flights.length - 1];
  const legs = splitFlightLegs(flights);
  if (legs.returnLeg) {
    const destination = legs.outbound[legs.outbound.length - 1];
    return `Outbound: ${first.fromCity} (${first.fromIata}) to ${destination.toCity} (${destination.toIata})  |  Return: ${destination.toCity} (${destination.toIata}) to ${last.toCity} (${last.toIata})  |  Travel dates: ${formatWallClockDate(first.departLocal)} - ${formatWallClockDate(last.arriveLocal)}`;
  }
  return `Route: ${first.fromCity} (${first.fromIata}) to ${last.toCity} (${last.toIata})  |  Travel dates: ${formatWallClockDate(first.departLocal)} - ${formatWallClockDate(last.arriveLocal)}`;
}

export async function renderQuotationPdf(snapshot: QuotationSnapshot): Promise<Uint8Array> {
  const builder = await PdfBuilder.create(snapshot.template);
  await companyHeader(builder, snapshot.company, "Quotation", snapshot.number);
  partyBlock(builder, {
    title: "Quotation",
    number: snapshot.number,
    meta: [
      { label: "Date", value: displayDate(snapshot.issueDate) },
      { label: "Valid until", value: displayDate(snapshot.validUntil) },
    ],
    contact: snapshot.contact,
    passengers: snapshot.passengers,
    referenceNo: snapshot.referenceNo,
  });

  builder.paragraph(snapshot.heading?.trim() || "QUOTATION", {
    size: 13, font: "bold", lineHeight: 18,
  });
  builder.gap(4);

  const showOptionLabels = snapshot.options.length > 1;
  for (const option of snapshot.options) {
    builder.ensure(60);
    if (showOptionLabels) {
      builder.paragraph(option.label, { size: 11, font: "bold", lineHeight: 15 });
    }
    if (option.pnr) {
      builder.paragraph(`Booking reference ${option.pnr}`, { size: 8, color: COLORS.slate, lineHeight: 11 });
    }
    if (option.flights.length > 0) {
      builder.paragraph(flightSummary(option.flights), { size: 9, color: COLORS.slate, lineHeight: 12 });
      builder.gap(4);
      await drawFlights(builder, option.flights);
    }
    moneyTable(builder, option.lines, snapshot.currency, option.totalMinor, {
      presentation: option.presentation,
      alwaysShowPerPerson: true,
      perPersonCount: documentPassengerCount(snapshot.passengers),
    });
    builder.gap(10);
  }

  builder.ensure(55);
  notesBlock(builder, snapshot.notes, "Important notes");

  if (snapshot.validityStatement) {
    builder.ensure(55);
    builder.gap(2);
    notesBlock(builder, snapshot.validityStatement, "QUOTATION VALIDITY");
  }

  signatureBlock(builder, snapshot.company.name);

  return builder.finish(snapshot.company.name, snapshot.number);
}

export async function renderItineraryPdf(snapshot: ItinerarySnapshot): Promise<Uint8Array> {
  const builder = await PdfBuilder.create(snapshot.template);
  await companyHeader(builder, snapshot.company, "Travel itinerary", snapshot.number);
  partyBlock(builder, {
    title: "Travel itinerary",
    number: snapshot.number,
    meta: [
      { label: "Date", value: displayDate(snapshot.issueDate) },
      ...(snapshot.quotationNumber
        ? [{ label: "Quotation", value: snapshot.quotationNumber }]
        : []),
    ],
    contact: snapshot.contact,
    passengers: snapshot.passengers,
    referenceNo: snapshot.referenceNo,
  });

  if (snapshot.showOptionLabel !== false) {
    builder.paragraph(snapshot.optionLabel, { size: 11, font: "bold", lineHeight: 15 });
  }
  if (snapshot.pnr) {
    builder.paragraph(`Booking reference ${snapshot.pnr}`, { size: 8, color: COLORS.muted, lineHeight: 11 });
  }
  if (snapshot.flights.length > 0) {
    builder.paragraph(flightSummary(snapshot.flights), { size: 8.5, color: COLORS.slate, lineHeight: 12 });
    builder.gap(4);
    await drawFlights(builder, snapshot.flights);
  }

  builder.gap(10);
  notesBlock(builder, snapshot.notes, "Travel notes");
  builder.gap(6);

  return builder.finish(snapshot.company.name, snapshot.number);
}

export interface ProformaPayment {
  paidOn: string;
  amountMinor: string;
  method: string;
  reference?: string;
  reversal: boolean;
}

export async function renderProformaPdf(
  snapshot: ProformaSnapshot,
  options: { payments?: ProformaPayment[]; paidMinor?: string } = {},
): Promise<Uint8Array> {
  const builder = await PdfBuilder.create(snapshot.template);
  await companyHeader(builder, snapshot.company, "Pro forma invoice", snapshot.number);
  partyBlock(builder, {
    title: "Pro forma invoice",
    number: snapshot.number,
    meta: [
      { label: "Date", value: displayDate(snapshot.issueDate) },
      ...(snapshot.dueDate ? [{ label: "Due", value: displayDate(snapshot.dueDate) }] : []),
    ],
    contact: snapshot.contact,
    passengers: snapshot.passengers,
    referenceNo: snapshot.referenceNo,
  });

  if (snapshot.showOptionLabel !== false) {
    builder.paragraph(snapshot.optionLabel, { size: 11, font: "bold", lineHeight: 15 });
  }
  builder.paragraph(`Quotation ${snapshot.quotationNumber}`, { size: 8, color: COLORS.muted, lineHeight: 11 });

  if (snapshot.showFlights && snapshot.flights.length > 0) {
    builder.paragraph(flightSummary(snapshot.flights), { size: 8.5, color: COLORS.slate, lineHeight: 12 });
    builder.gap(4);
    await drawFlights(builder, snapshot.flights);
  }

  moneyTable(builder, snapshot.lines, snapshot.currency, snapshot.totalMinor, {
    vatMinor: snapshot.vatMinor,
    vatRateBps: snapshot.vatRateBps,
    showVat: snapshot.showVat,
    presentation: snapshot.presentation,
  });

  const paid = BigInt(options.paidMinor ?? "0");
  const payments = options.payments ?? [];
  if (payments.length > 0) {
    builder.ensure(50);
    builder.paragraph("Payments received", {
      size: 8, font: "bold", color: builder.palette.accent, lineHeight: 12,
    });
    for (const payment of payments) {
      const label = `${displayDate(payment.paidOn)}  ${payment.method}${payment.reference ? `  ${payment.reference}` : ""}${payment.reversal ? "  (reversal)" : ""}`;
      builder.pair(label, formatMoney(BigInt(payment.amountMinor), snapshot.currency), { size: 8.5 });
    }
    builder.rule();
    builder.gap(2);
    builder.pair("Total paid", formatMoney(paid, snapshot.currency), { size: 9, font: "bold" });
    builder.gap(4);
    builder.pair("Balance due", formatMoney(BigInt(snapshot.totalMinor) - paid, snapshot.currency), {
      size: 10, font: "bold",
    });
    builder.gap(16);
  }

  builder.ensure(130);
  const half = CONTENT / 2 - 8;
  const startY = builder.cursor;
  bankBlock(builder, snapshot.bank, snapshot.currency, MARGIN, half);
  const leftBottom = builder.cursor;
  builder.cursor = startY;
  builder.paragraph("Payment terms", {
    x: MARGIN + half + 16, maxWidth: half, size: 7.5, font: "bold", color: builder.palette.accent, lineHeight: 10,
  });
  builder.paragraph(snapshot.terms, {
    x: MARGIN + half + 16, maxWidth: half, size: 8, color: COLORS.slate, lineHeight: 11,
  });
  if (snapshot.dueDate) {
    builder.paragraph(`Please pay by ${displayDate(snapshot.dueDate)}.`, {
      x: MARGIN + half + 16, maxWidth: half, size: 8, font: "bold", lineHeight: 11,
    });
  }
  builder.cursor = Math.min(builder.cursor, leftBottom);
  builder.gap(10);

  signatureBlock(builder, snapshot.company.name);

  builder.paragraph(
    `Pro forma ${snapshot.number} - issued ${displayDate(snapshot.issueDate)} - this is a pro forma invoice, not a tax invoice.`,
    { size: 7.5, color: COLORS.muted, lineHeight: 10 },
  );

  return builder.finish(snapshot.company.name, snapshot.number);
}
