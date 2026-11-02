import { CONTACT_CSV_COLUMNS, csvCell } from "./csv";
import type { Contact } from "@/generated/prisma/client";

/** Build the same column order the importer understands. */
export function contactsCsv(contacts: Contact[]): string {
  const header = CONTACT_CSV_COLUMNS.join(",");
  const rows = contacts.map((contact) =>
    CONTACT_CSV_COLUMNS.map((column) => csvCell(contact[column] ?? "")).join(","),
  );
  return [header, ...rows].join("\r\n");
}
