/**
 * Archiving is a visibility flag, not a status transition.
 *
 * Only closed documents can be archived:
 * - a quotation must have finished its working life (accepted or terminal);
 * - a pro forma must have no money outstanding (paid or cancelled).
 *
 * Draft and sent quotations stay in the work queue, and unpaid/part-paid pro
 * formas stay visible so their balance can still be followed. Archived
 * records remain readable, appear in the audit log and are included in
 * historical financial reports. Restoring clears the flag.
 */

export const ARCHIVABLE_QUOTATION_STATUSES = [
  "accepted",
  "declined",
  "expired",
  "cancelled",
  "superseded",
] as const;

export const ARCHIVABLE_PROFORMA_STATUSES = ["paid", "cancelled"] as const;

export function canArchiveQuotation(status: string): boolean {
  return (ARCHIVABLE_QUOTATION_STATUSES as readonly string[]).includes(status);
}

export function canArchiveProforma(status: string): boolean {
  return (ARCHIVABLE_PROFORMA_STATUSES as readonly string[]).includes(status);
}

export function quotationArchiveError(status: string): string {
  if (status === "draft") return "A draft is deleted rather than archived";
  if (status === "sent") return "Cancel this quotation before archiving it";
  return "Only a closed quotation can be archived";
}

export function proformaArchiveError(status: string): string {
  if (status === "draft") {
    return "Send or cancel this pro forma before archiving it";
  }
  if (status === "unpaid" || status === "part_paid") {
    return "Only a fully paid or cancelled pro forma can be archived; the balance is still open";
  }
  return "Only a fully paid or cancelled pro forma can be archived";
}
