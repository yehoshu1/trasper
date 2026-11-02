import { DateTime } from "luxon";

import { appTimeZone } from "@/lib/dates";
import { renderNumber } from "@/lib/numbering";
import { DEFAULT_SETTINGS } from "@/server/settings";

/**
 * Document numbers come from the Sequence table, incremented atomically
 * inside a database transaction. A number is never reused, even if the
 * document is later cancelled.
 *
 * The template filling and revision rules are pure and live in
 * src/lib/numbering.ts; this module adds only the database part.
 */

export type NumberKind = "quotation" | "itinerary" | "proforma";

const TEMPLATE_KEY: Record<NumberKind, string> = {
  quotation: "numbering.quotation",
  itinerary: "numbering.itinerary",
  proforma: "numbering.proforma",
};

const DEFAULT_TEMPLATE: Record<NumberKind, string> = {
  quotation: DEFAULT_SETTINGS.numberingQuotation,
  itinerary: DEFAULT_SETTINGS.numberingItinerary,
  proforma: DEFAULT_SETTINGS.numberingProforma,
};

interface NumberingTx {
  setting: {
    findUnique: (args: { where: { key: string } }) => Promise<{ value: string } | null>;
  };
  sequence: {
    upsert: (args: {
      where: { key: string };
      create: { key: string; value: number };
      update: { value: { increment: number } };
    }) => Promise<{ key: string; value: number }>;
  };
}

/**
 * Allocate the next number for a document type. Must be called inside the
 * same transaction that writes the document.
 */
export async function allocateNumber(
  tx: NumberingTx,
  kind: NumberKind,
  date: Date,
  branch = "01",
): Promise<string> {
  const setting = await tx.setting.findUnique({ where: { key: TEMPLATE_KEY[kind] } });
  const template = setting?.value?.trim() || DEFAULT_TEMPLATE[kind];
  const year = DateTime.fromJSDate(date, { zone: appTimeZone() }).toFormat("yyyy");
  // A branch in the template gets its own sequence, so 01 and 02 never share
  // a counter. The year is part of the key only when the number prints it;
  // without a year the sequence must run across years to stay unique.
  const parts: string[] = [kind];
  if (template.includes("{BRANCH}")) parts.push(branch);
  if (template.includes("{YYYY}") || template.includes("{YY}")) parts.push(year);
  const key = parts.join(":");

  const sequence = await tx.sequence.upsert({
    where: { key },
    create: { key, value: 1 },
    update: { value: { increment: 1 } },
  });

  return renderNumber(template, sequence.value, date, branch);
}

/**
 * Revision numbers keep the original document number and add -R2, -R3, ...
 * Pure rules live in src/lib/numbering.ts and are re-exported here so
 * callers keep one import path.
 */
export { renderNumber, revisionNumber, splitRevision } from "@/lib/numbering";
