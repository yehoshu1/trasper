import { DateTime } from "luxon";

import { appTimeZone } from "./dates";

/**
 * Pure document-number helpers. The database-backed allocator
 * lives in src/server/numbering.ts; nothing here touches a database, so the
 * rules are unit-testable on their own.
 */

/**
 * Fill a number template.
 *
 * QT-{BRANCH}-{YYYY}-{MM}-{DD}-{SEQ:4} → QT-01-2026-10-31-0001
 *
 * `branch` defaults to 01 so templates without the placeholder are unaffected.
 */
export function renderNumber(
  template: string,
  sequence: number,
  date: Date,
  branch = "01",
): string {
  const dt = DateTime.fromJSDate(date, { zone: appTimeZone() });
  return template
    .replace(/\{BRANCH\}/g, branch)
    .replace(/\{YYYY\}/g, dt.toFormat("yyyy"))
    .replace(/\{YY\}/g, dt.toFormat("yy"))
    .replace(/\{MM\}/g, dt.toFormat("MM"))
    .replace(/\{DD\}/g, dt.toFormat("dd"))
    .replace(/\{SEQ(?::(\d+))?\}/g, (_match, padding: string | undefined) => {
      // A template such as {SEQ:999999999} must not allocate a giant string.
      const width = Math.min(Math.max(Number(padding ?? 4) || 4, 1), 12);
      return sequence.toString().padStart(width, "0");
    });
}

/**
 * Revision numbers keep the original document number and add -R2, -R3, ...
 * They are derived, not taken from the sequence, and the original number is
 * never reused.
 */
export function revisionNumber(originalNumber: string, revision: number): string {
  const base = originalNumber.replace(/-R\d+$/, "");
  return `${base}-R${revision}`;
}

/** Parse a stored document number's base and revision, for display. */
export function splitRevision(number: string): { base: string; revision: number } {
  const match = /^(.*)-R(\d+)$/.exec(number);
  if (!match) return { base: number, revision: 1 };
  return { base: match[1], revision: Number(match[2]) };
}
