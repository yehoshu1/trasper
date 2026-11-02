/** Upper bounds for an imported customer file (avoids long write loops). */
export const MAX_CSV_CHARACTERS = 5 * 1024 * 1024;
export const MAX_CSV_ROWS = 5_000;

/**
 * Neutralise spreadsheet formula injection before a cell is written to CSV.
 *
 * Excel and LibreOffice treat a cell beginning with =, +, -, @, tab or CR as a
 * formula. A customer name such as `=HYPERLINK("https://evil","click")` would
 * execute when an accountant opens the export. Plain numbers (including
 * negative amounts) are left untouched so financial exports stay numeric.
 */
export function escapeCsvFormula(value: string): string {
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return value;
  return /^[\s]*[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

/** RFC 4180 escaping plus formula-injection protection for one cell. */
export function csvCell(value: string | number | bigint | null | undefined): string {
  const text = escapeCsvFormula(value === null || value === undefined ? "" : String(value));
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Small RFC-4180-style CSV reader: quoted fields, doubled quotes, CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char === "\r") {
      // ignore; the following \n ends the row
    } else {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ""));
}

export const CONTACT_CSV_COLUMNS = [
  "name",
  "type",
  "attention",
  "poBox",
  "city",
  "country",
  "physicalAddress",
  "email",
  "phone",
  "notes",
] as const;

export type ContactCsvColumn = (typeof CONTACT_CSV_COLUMNS)[number];

const HEADER_ALIASES: Record<string, ContactCsvColumn> = {
  name: "name",
  "contact name": "name",
  "customer name": "name",
  organisation: "name",
  organization: "name",
  type: "type",
  "contact type": "type",
  attention: "attention",
  "attention of": "attention",
  "po box": "poBox",
  pobox: "poBox",
  "p.o. box": "poBox",
  city: "city",
  town: "city",
  country: "country",
  address: "physicalAddress",
  "physical address": "physicalAddress",
  email: "email",
  "email address": "email",
  phone: "phone",
  telephone: "phone",
  mobile: "phone",
  notes: "notes",
};

export interface ContactCsvRow {
  line: number;
  values: Partial<Record<ContactCsvColumn, string>>;
  errors: string[];
}

export interface ParsedContactCsv {
  columns: Partial<Record<ContactCsvColumn, number>>;
  rows: ContactCsvRow[];
  unknownHeaders: string[];
  /** True when the file exceeded MAX_CSV_ROWS and only the first rows were read. */
  truncated: boolean;
}

/**
 * Map a CSV file's headers onto contact fields. Unknown columns are reported,
 * never silently dropped into the wrong field.
 */
export function parseContactCsv(text: string): ParsedContactCsv {
  if (text.length > MAX_CSV_CHARACTERS) {
    throw new Error("The CSV file is too large. Keep it under 5 MB.");
  }
  const [headerRow, ...allDataRows] = parseCsv(text);
  if (!headerRow) {
    return { columns: {}, rows: [], unknownHeaders: [], truncated: false };
  }
  const truncated = allDataRows.length > MAX_CSV_ROWS;
  const dataRows = truncated ? allDataRows.slice(0, MAX_CSV_ROWS) : allDataRows;

  const columns: Partial<Record<ContactCsvColumn, number>> = {};
  const unknownHeaders: string[] = [];
  headerRow.forEach((header, index) => {
    const key = header.trim().toLowerCase();
    const mapped = HEADER_ALIASES[key];
    if (mapped) {
      if (columns[mapped] === undefined) columns[mapped] = index;
    } else if (key !== "") {
      unknownHeaders.push(header.trim());
    }
  });

  const rows: ContactCsvRow[] = dataRows.map((cells, rowIndex) => {
    const values: Partial<Record<ContactCsvColumn, string>> = {};
    for (const [column, index] of Object.entries(columns) as [ContactCsvColumn, number][]) {
      const value = cells[index]?.trim();
      if (value) values[column] = value;
    }
    const errors: string[] = [];
    if (!values.name) errors.push("Name is missing");
    if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) {
      errors.push("Email is not valid");
    }
    if (values.type && !["organisation", "individual"].includes(values.type.toLowerCase())) {
      errors.push("Type must be organisation or individual");
    }
    return { line: rowIndex + 2, values, errors };
  });

  return { columns, rows, unknownHeaders, truncated };
}
