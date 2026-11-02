/** Serialisable document data. Everything here is copied when a document is
 * issued, so later setting, rate or reference-data changes never alter it. */

import type { PricePresentation } from "@/lib/pricing/presentation";

export const DOCUMENT_TEMPLATE_IDS = [
  "classic",
  "modern",
  "minimal",
  "executive",
  "vivid",
] as const;

export type DocumentTemplate = (typeof DOCUMENT_TEMPLATE_IDS)[number];

export const DOCUMENT_TEMPLATES = [
  ["classic", "Classic"],
  ["modern", "Modern"],
  ["minimal", "Minimal"],
  ["executive", "Executive"],
  ["vivid", "Vivid"],
] as const;

export const DOCUMENT_TEMPLATE_LABELS = Object.fromEntries(
  DOCUMENT_TEMPLATES,
) as Record<DocumentTemplate, string>;

export const DOCUMENT_TEMPLATE_DESCRIPTIONS: Record<DocumentTemplate, string> = {
  classic: "Teal accents, a light header and soft table headings: the default look.",
  modern: "Charcoal header band, high-contrast table headings and strong section rules.",
  minimal: "Quiet black-and-white layout with hairline rules and no filled table backgrounds.",
  executive: "Centred formal header in navy and gold, with refined section labels.",
  vivid: "Bright blue header block, oversized document title and an amber accent bar.",
};

export function isDocumentTemplate(value: unknown): value is DocumentTemplate {
  return typeof value === "string" && DOCUMENT_TEMPLATE_IDS.includes(value as DocumentTemplate);
}

/** How the top of a printed document is branded. */
export const DOCUMENT_HEADER_MODES = ["letterhead", "details"] as const;

export type DocumentHeaderMode = (typeof DOCUMENT_HEADER_MODES)[number];

export const DOCUMENT_HEADER_MODE_LABELS: Record<DocumentHeaderMode, string> = {
  letterhead: "Picture letterhead",
  details: "Company details and logo",
};

export const DOCUMENT_HEADER_MODE_DESCRIPTIONS: Record<DocumentHeaderMode, string> = {
  letterhead: "Print the uploaded letterhead image across the top of the page.",
  details: "Print the company name, address, contacts, TIN and logo as a text header.",
};

export function isDocumentHeaderMode(value: unknown): value is DocumentHeaderMode {
  return typeof value === "string" && DOCUMENT_HEADER_MODES.includes(value as DocumentHeaderMode);
}

/**
 * Pick the header actually printed. A picture letterhead is used only when it
 * exists and the document asks for it; choosing company details always wins,
 * and a missing letterhead falls back to details.
 *
 * Snapshots created before this setting existed have no headerMode, so they
 * keep the original behaviour: letterhead when one is present.
 */
export function resolveDocumentHeader(
  company: Pick<DocumentCompany, "letterhead" | "headerMode">,
): DocumentHeaderMode {
  return company.letterhead && company.headerMode !== "details" ? "letterhead" : "details";
}

export interface DocumentCompany {
  name: string;
  address: string;
  email: string;
  phone: string;
  website: string;
  tin: string;
  headerImage: string;
  /** Full-width picture letterhead printed above the document header. */
  letterhead?: string;
  /** Which header to print; legacy snapshots omit it and keep the letterhead. */
  headerMode?: DocumentHeaderMode;
  footerText: string;
  vatRegistrationNumber: string;
}

export interface DocumentContact {
  name: string;
  attention?: string;
  poBox?: string;
  city?: string;
  country?: string;
  physicalAddress?: string;
  email?: string;
  phone?: string;
}

export interface DocumentPassenger {
  title?: string;
  firstName: string;
  lastName: string;
  type: "adult" | "child" | "infant";
  /** True when the names are not known yet; quantity then gives the count. */
  unnamed?: boolean;
  quantity?: number;
}

/**
 * Printed traveller label. Unnamed groups read "2 Adults"; named travellers
 * keep their name. Shared by every document template.
 */
export function passengerName(passenger: DocumentPassenger): string {
  if (passenger.unnamed) {
    const quantity = Math.max(1, passenger.quantity ?? 1);
    const label =
      passenger.type === "child" ? "Child" : passenger.type === "infant" ? "Infant" : "Adult";
    return `${quantity} ${label}${quantity === 1 ? "" : "s"}`;
  }
  return [passenger.title, passenger.firstName, passenger.lastName].filter(Boolean).join(" ");
}

/** PNRs store carrier names in capitals; quotes should read "Example Airlines". */export function titleCaseCarrier(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/(^|[\s/-])([a-z])/g, (_, prefix: string, letter: string) => prefix + letter.toUpperCase());
}

export interface DocumentFlight {
  airline: string;
  airlineName: string;
  airlineLogo?: string;
  flightNo: string;
  fromIata: string;
  toIata: string;
  fromName: string;
  fromCity: string;
  toName: string;
  toCity: string;
  departLocal: string;
  arriveLocal: string;
  durationMinutes: number;
  /** Wait after this flight, when it is followed by another segment. */
  layoverAfterMinutes?: number;
  cabin?: string;
  /** Marketing carrier's operating airline, when it differs (codeshare). */
  operatingCarrier?: string;
}

export interface DocumentLine {
  description: string;
  amountMinor: string;
  /** Optional presentation metadata for accommodation and unit-priced services. */
  kind?: "fare" | "service" | "fee" | "tax";
  quantity?: number;
  unit?: string;
  unitAmountMinor?: string;
  detail?: string;
}

export interface DocumentBank {
  /** Staff-facing label, e.g. "Stanbic MWK". */
  label?: string;
  currency: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  branch?: string;
  swift?: string;
  sortCode?: string;
  instructions?: string;
}

export interface DocumentPayment {
  id: string;
  paidOn: string;
  amountMinor: string;
  method: string;
  reference?: string;
  reversal: boolean;
}

export interface QuotationSnapshot {
  kind: "quotation";
  number: string;
  revision: number;
  referenceNo?: string;
  /** Branch code the quotation was issued from, e.g. 01. */
  branch?: string;
  issueDate: string;
  validUntil: string;
  currency: string;
  template?: DocumentTemplate;
  company: DocumentCompany;
  contact: DocumentContact;
  passengers: DocumentPassenger[];
  flights: DocumentFlight[];
  options: {
    label: string;
    optionType?: string;
    pnr?: string;
    ticketingDeadline?: string;
    flights: DocumentFlight[];
    lines: DocumentLine[];
    /** Frozen customer price layout; legacy snapshots omit it. */
    presentation?: PricePresentation;
    totalMinor: string;
    vatEnabled: boolean;
    vatMinor: string;
    costMinor: string;
    markupMinor: string;
    taxesMinor: string;
  }[];
  /** Editable heading above the options; defaults to "QUOTATION". */
  heading?: string;
  notes: string;
  /** Frozen validity statement; omitted on snapshots created before it existed. */
  validityStatement?: string;
  bank: DocumentBank | null;
  createdAt: string;
}

export interface ItinerarySnapshot {
  kind: "itinerary";
  number: string;
  referenceNo?: string;
  branch?: string;
  issueDate: string;
  template?: DocumentTemplate;
  /** Omitted for a standalone itinerary that was not issued from a quotation. */
  quotationNumber?: string;
  /** True when the itinerary has no quotation, option or prices behind it. */
  standalone?: boolean;
  company: DocumentCompany;
  contact: DocumentContact;
  passengers: DocumentPassenger[];
  optionLabel: string;
  /** False when the quotation had a single option; the label is then omitted. */
  showOptionLabel?: boolean;
  pnr?: string;
  flights: DocumentFlight[];
  notes: string;
}

export interface ProformaSnapshot {
  kind: "proforma";
  number: string;
  referenceNo?: string;
  branch?: string;
  issueDate: string;
  template?: DocumentTemplate;
  dueDate?: string;
  terms: string;
  currency: string;
  company: DocumentCompany;
  contact: DocumentContact;
  passengers: DocumentPassenger[];
  optionLabel: string;
  /** False when the quotation had a single option; the label is then omitted. */
  showOptionLabel?: boolean;
  flights: DocumentFlight[];
  showFlights: boolean;
  showVat: boolean;
  vatMinor: string;
  vatRateBps: string;
  vatRegistrationNumber?: string;
  lines: DocumentLine[];
  /** Frozen customer price layout; legacy snapshots omit it. */
  presentation?: PricePresentation;
  totalMinor: string;
  bank: DocumentBank | null;
  quotationNumber: string;
}

export interface FrozenLine {
  id: string;
  description: string;
  kind: "fare" | "service";
  priceMinor: string;
  costMinor: string;
}

export interface FrozenPassenger extends DocumentPassenger {
  id: string;
}

export interface FrozenTotals {
  version: 1;
  frozenAt: string;
  currency: string;
  label: string;
  optionType?: string;
  pnr?: string;
  ticketingDeadline?: string;
  costCurrency: string;
  rateMicro: string;
  marginKind: "percent" | "lump";
  marginValue: string;
  vatEnabled: boolean;
  vatRateBps: string;
  roundingUnit: string;
  totals: {
    costMinor: string;
    markupMinor: string;
    vatMinor: string;
    taxesMinor: string;
    totalMinor: string;
    profitMinor: string;
  };
  lines: FrozenLine[];
  presentation?: PricePresentation;
  passengers: FrozenPassenger[];
  services: {
    category: string;
    description: string;
    costMinor: string;
    quantity?: number;
    unit?: string;
    unitCostMinor?: string;
    details?: string;
  }[];
  taxes: {
    name: string;
    kind: string;
    value: string;
    enabled: boolean;
    base?: string;
    amountMinor: string;
  }[];
  segments: {
    airline: string;
    flightNo: string;
    fromIata: string;
    toIata: string;
    departLocal: string;
    arriveLocal: string;
    cabin?: string;
    operatingCarrier?: string;
  }[];
}

export function parseFrozenTotals(raw: string | null | undefined): FrozenTotals | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as FrozenTotals;
  } catch {
    return null;
  }
}

/** A journey split into its outbound and (when there is one) return legs. */
export interface FlightLegs {
  outbound: DocumentFlight[];
  returnLeg: DocumentFlight[] | null;
}

/**
 * Split flights into outbound and return legs (UK travel language: the
 * outbound is everything up to the furthest point, the return is the journey
 * home from it).
 *
 * The return starts at the first segment that lands on an airport already
 * visited — that revisit marks the turnaround. A hub used on the way out and
 * again on the way home (LLW→ADD→JNB→ADD→LLW) therefore splits correctly, as
 * does an open-jaw itinerary, which has no revisit and stays in one leg.
 */
export function splitFlightLegs(flights: DocumentFlight[]): FlightLegs {
  if (flights.length < 2) return { outbound: [...flights], returnLeg: null };

  const airports = [flights[0].fromIata, ...flights.map((flight) => flight.toIata)];
  const visited = new Set<string>([airports[0]]);
  for (let k = 1; k < airports.length; k += 1) {
    if (visited.has(airports[k])) {
      const splitIndex = k - 1; // the segment departing the turnaround point
      if (splitIndex >= 1) {
        return {
          outbound: flights.slice(0, splitIndex),
          returnLeg: flights.slice(splitIndex),
        };
      }
    }
    visited.add(airports[k]);
  }
  return { outbound: [...flights], returnLeg: null };
}

export function parseSnapshot<T extends QuotationSnapshot | ItinerarySnapshot | ProformaSnapshot>(
  raw: string | null | undefined,
): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
