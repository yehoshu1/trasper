import {
  calculateOption,
  sumLinePrices,
  type PricedLine,
  type PricingResult,
  type TaxBase,
  type TaxKind,
} from "./pricing";
import {
  presentPricing,
  type PriceDisplayMode,
  type PricePresentation,
  type PresentationOptions,
  type TaxDisplayMode,
} from "./pricing/presentation";
import type { PassengerType } from "./pnr";
import { enteredTravellerNames } from "./travellers";

/** Draft shapes shared by the editor (client) and server actions. Money is
 * carried as decimal strings across the action boundary and converted to
 * BigInt before any calculation. */

export interface EditorSegment {
  id?: string;
  airline: string;
  flightNo: string;
  fromIata: string;
  toIata: string;
  departLocal: string;
  arriveLocal: string;
  cabin?: string;
  operatingCarrier?: string;
}

export interface EditorFare {
  id?: string;
  /** Empty when the travellers are not named yet. */
  passengerId: string;
  passengerName: string;
  passengerType: PassengerType;
  /** Number of travellers covered by an unnamed fare line. */
  quantity?: string;
  /** For an unnamed group, costMinor is the cost per traveller. */
  costMinor: string;
  /** Optional names for an unnamed group, one per line. */
  travellerNames?: string;
}

export interface EditorService {
  id?: string;
  category: string;
  description: string;
  costMinor: string;
  /** Quantity used for accommodation and other unit-priced services. */
  quantity?: string;
  /** Night, room_night, person_night, package and similar. */
  unit?: string;
  /** Optional per-unit cost in the option's cost currency. */
  unitCostMinor?: string;
  /** Room type, board basis or supplier reference printed below the line. */
  details?: string;
}

export interface EditorTax {
  id?: string;
  name: string;
  kind: TaxKind;
  value: string;
  enabled: boolean;
  /** Percentage base: converted cost (default), service fee or subtotal. */
  base?: TaxBase;
}

export const OPTION_TYPES = [
  "flight",
  "accommodation",
  "package",
  "tour",
  "cruise",
  "other",
] as const;

export type OptionType = (typeof OPTION_TYPES)[number];

export const OPTION_TYPE_LABELS: Record<OptionType, string> = {
  flight: "Flight",
  accommodation: "Accommodation",
  package: "Package",
  tour: "Tour",
  cruise: "Cruise",
  other: "Other",
};

export function isOptionType(value: unknown): value is OptionType {
  return typeof value === "string" && OPTION_TYPES.includes(value as OptionType);
}

export interface EditorQuotation {
  id: string;
  number: string;
  revision: number;
  status: string;
  contactId: string;
  contactName: string;
  referenceNo: string;
  branch: string;
  currency: string;
  issueDate: string;
  validUntil: string;
  vatOverride: boolean | null;
  /** null = follow the agency default in Settings → Pricing presentation. */
  pricingDisplay: PriceDisplayMode | null;
  taxDisplay: TaxDisplayMode | null;
  /** Printed heading above the options. */
  heading: string;
  notes: string;
  bankAccountId: string;
  /** Optimistic-locking token sent back with every save. */
  version: number;
  locked: boolean;
  acceptedOptionId: string | null;
  options: EditorOption[];
}

export interface EditorOption {
  id?: string;
  label: string;
  /** A flight option requires segments; accommodation/tour options do not. */
  optionType?: OptionType;
  pnr: string;
  ticketingDeadline: string;
  costCurrency: string;
  rateMicro: string;
  marginKind: "percent" | "lump";
  marginValue: string;
  segments: EditorSegment[];
  fares: EditorFare[];
  services: EditorService[];
  taxes: EditorTax[];
}

export interface VatContext {
  enabled: boolean;
  rateBps: bigint;
  roundingUnit: bigint;
}

/** Resolve a per-quotation display override against the agency default. */
export function resolvePriceDisplay(
  override: PriceDisplayMode | null | undefined,
  fallback: PriceDisplayMode,
): PriceDisplayMode {
  return override ?? fallback;
}

export function resolveTaxDisplay(
  override: TaxDisplayMode | null | undefined,
  fallback: TaxDisplayMode,
): TaxDisplayMode {
  return override ?? fallback;
}

/**
 * VAT follows the global switch unless the quotation overrides it
 * (null = inherit, true = on, false = off).
 */
export function resolveVatContext(
  globalEnabled: boolean,
  rateBps: bigint,
  override: boolean | null | undefined,
  roundingUnit: bigint,
): VatContext {
  return {
    enabled: override === null || override === undefined ? globalEnabled : override,
    rateBps,
    roundingUnit,
  };
}

export interface ComputedLine {
  id: string;
  description: string;
  kind: "fare" | "service";
  passengerId?: string;
  priceMinor: bigint;
}

export interface ComputedOption {
  result: PricingResult;
  lines: ComputedLine[];
  totalMinor: bigint;
}

function fareTypeLabel(type: PassengerType): string {
  return type === "child" ? "Child" : type === "infant" ? "Infant" : "Adult";
}

export function fareQuantity(fare: EditorFare): number {
  return Math.max(1, Number.parseInt(fare.quantity || "1", 10) || 1);
}

function fareDescription(fare: EditorFare): string {
  if (!fare.passengerId) {
    const quantity = fareQuantity(fare);
    return `${quantity} ${fareTypeLabel(fare.passengerType)}${quantity === 1 ? "" : "s"}`;
  }
  return `${fareTypeLabel(fare.passengerType)} — ${fare.passengerName}`;
}

/** Build the pure pricing input from an editor option. IDs are synthetic when
 * the option has not been saved yet. */
export function computeOption(option: EditorOption, vat: VatContext): ComputedOption {
  const lines = [
    ...option.fares.map((fare, index) => {
      const quantity = fare.passengerId ? 1 : fareQuantity(fare);
      return {
        id: fare.id ?? `fare-${index}-${fare.passengerId || fare.passengerType}`,
        description: fareDescription(fare),
        costMinor: BigInt(fare.costMinor || "0") * BigInt(quantity),
        kind: "fare" as const,
        passengerId: fare.passengerId || undefined,
        ...(quantity > 1 ? { quantity, unit: "person" } : {}),
      };
    }),
    ...option.services.map((service, index) => {
      const quantity = Math.max(1, Number.parseInt(service.quantity || "1", 10) || 1);
      return {
        id: service.id ?? `service-${index}`,
        description: service.description,
        costMinor: BigInt(service.costMinor || "0"),
        kind: "service" as const,
        passengerId: undefined as string | undefined,
        quantity,
        unit: service.unit || "unit",
        unitCostMinor:
          service.unitCostMinor && service.unitCostMinor !== ""
            ? BigInt(service.unitCostMinor)
            : undefined,
        detail: service.details?.trim() || undefined,
      };
    }),
  ];

  const result = calculateOption({
    lines,
    rateMicro: BigInt(option.rateMicro || "0"),
    marginKind: option.marginKind,
    marginValue: BigInt(option.marginValue || "0"),
    // A lump sum is a markup per traveller; percentage margins already scale
    // with the cost of every fare line.
    marginUnits: optionPassengerCount(option) ?? 1,
    vatEnabled: vat.enabled,
    vatRateBps: vat.rateBps,
    taxes: option.taxes.map((tax, index) => ({
      id: tax.id ?? `tax-${index}`,
      name: tax.name,
      kind: tax.kind,
      value: BigInt(tax.value || "0"),
      enabled: tax.enabled,
      base: tax.base ?? "cost",
    })),
    roundingUnit: vat.roundingUnit,
  });

  return {
    result,
    lines: lines.map((line, index) => ({
      id: line.id,
      description: line.description,
      kind: line.kind,
      passengerId: line.passengerId,
      priceMinor: result.lines[index].priceMinor,
    })),
    totalMinor: result.totalMinor,
  };
}

/** The number of distinct fare-paying travellers in an option. Unnamed
 * traveller groups count by their quantity, so per-person layouts stay right
 * before the names are known. */
export function optionPassengerCount(option: EditorOption): number | undefined {
  const named = new Set<string>();
  let count = 0;
  for (const fare of option.fares) {
    if (fare.passengerId) {
      if (!named.has(fare.passengerId)) {
        named.add(fare.passengerId);
        count += 1;
      }
    } else {
      count += fareQuantity(fare);
    }
  }
  return count > 0 ? count : undefined;
}

/** Build the customer-facing price layout for an option. */
export function presentOption(
  computed: ComputedOption,
  option: EditorOption,
  options: Omit<PresentationOptions, "passengerCount">,
): PricePresentation {
  return presentPricing(computed.result, {
    ...options,
    passengerCount: optionPassengerCount(option),
  });
}

export interface DraftIssue {
  optionLabel: string;
  message: string;
  severity: "error" | "warning";
}

export interface DraftValidation {
  issues: DraftIssue[];
  errors: DraftIssue[];
  warnings: DraftIssue[];
  requiresZeroFareConfirmation: boolean;
  hasNegativeMargin: boolean;
}

function localToMinutes(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  return (
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5])) /
    60_000
  );
}

/**
 * Send-readiness rules . Errors block sending; warnings are
 * shown and allow sending. Times are compared as local wall-clock values only
 * for ordering within one option; the itinerary module does the zone maths.
 */
export function validateDraftOption(option: EditorOption): DraftValidation {
  const issues: DraftIssue[] = [];
  const push = (message: string, severity: "error" | "warning") =>
    issues.push({ optionLabel: option.label, message, severity });

  const optionType = option.optionType ?? "flight";
  if (optionType === "flight" && option.segments.length === 0) {
    push("Add at least one flight segment", "error");
  }
  if (option.fares.length === 0 && option.services.length === 0) {
    push("Add at least one fare, traveller group or service line", "error");
  }
  if (optionType === "flight" && option.fares.length === 0) {
    push("Add at least one passenger fare or traveller group", "error");
  }
  if (BigInt(option.rateMicro || "0") <= 0n) push("Enter an exchange rate", "error");
  if (option.marginKind === "percent" && option.marginValue === "") {
    push("Enter a margin", "error");
  }

  const seenPassengers = new Set<string>();
  const seenGroups = new Set<string>();
  for (const fare of option.fares) {
    if (fare.passengerId) {
      if (seenPassengers.has(fare.passengerId)) {
        push(`The same passenger is listed twice (${fare.passengerName})`, "error");
      }
      seenPassengers.add(fare.passengerId);
      continue;
    }
    if (seenGroups.has(fare.passengerType)) {
      push(
        `Add unnamed ${fareTypeLabel(fare.passengerType).toLowerCase()} travellers as one group, not several lines`,
        "error",
      );
    }
    seenGroups.add(fare.passengerType);
    const rawQuantity = Number.parseInt(fare.quantity || "1", 10);
    if (!Number.isFinite(rawQuantity) || rawQuantity < 1) {
      push("A traveller group needs at least one traveller", "error");
    }
    const names = enteredTravellerNames(fare.travellerNames);
    if (rawQuantity > 0 && names.length > rawQuantity) {
      push(
        `More traveller names than the group quantity (${names.length} names for ${rawQuantity} travellers)`,
        "error",
      );
    }
  }

  const hasAdult = option.fares.some((fare) => fare.passengerType === "adult");
  if (!hasAdult && option.fares.some((fare) => fare.passengerType === "infant")) {
    push("An infant is booked without an adult in this option", "warning");
  }

  for (let i = 0; i < option.segments.length; i += 1) {
    if (option.segments[i].flightNo.toUpperCase() === "XXX") {
      push(`Segment ${i + 1} has a placeholder flight number (XXX)`, "warning");
    }
  }

  for (let i = 1; i < option.segments.length; i += 1) {
    const previous = option.segments[i - 1];
    if (previous.toIata !== option.segments[i].fromIata) {
      push(
        `Segment ${i + 1} departs ${option.segments[i].fromIata} but segment ${i} arrives ${previous.toIata}`,
        "warning",
      );
    }
    const arrive = localToMinutes(previous.arriveLocal);
    const depart = localToMinutes(option.segments[i].departLocal);
    if (arrive !== null && depart !== null && depart < arrive) {
      push(`Segment ${i + 1} departs before segment ${i} arrives`, "warning");
    }
  }

  // The Zod schema already rejects these, but the pure validator is also used
  // directly by tests and by data loaded from older drafts.
  if (option.fares.some((fare) => BigInt(fare.costMinor || "0") < 0n)) {
    push("Fare costs cannot be negative", "error");
  }
  if (option.services.some((service) => BigInt(service.costMinor || "0") < 0n)) {
    push("Service costs cannot be negative", "error");
  }
  if (option.taxes.some((tax) => BigInt(tax.value || "0") < 0n)) {
    push("Tax amounts cannot be negative", "error");
  }

  const zeroFare = option.fares.some((fare) => BigInt(fare.costMinor || "0") === 0n);
  if (zeroFare) push("One or more fares are zero; confirm this before sending", "warning");

  const negativeMargin =
    option.marginKind === "percent"
      ? BigInt(option.marginValue || "0") < 0n
      : BigInt(option.marginValue || "0") < 0n;
  if (negativeMargin) push("The margin is negative", "warning");

  const errors = issues.filter((issue) => issue.severity === "error");
  const warnings = issues.filter((issue) => issue.severity === "warning");
  return {
    issues,
    errors,
    warnings,
    requiresZeroFareConfirmation: zeroFare,
    hasNegativeMargin: negativeMargin,
  };
}

export function validateQuotationDraft(options: EditorOption[]): {
  valid: boolean;
  errors: DraftIssue[];
  warnings: DraftIssue[];
  requiresZeroFareConfirmation: boolean;
  hasNegativeMargin: boolean;
} {
  const results = options.map(validateDraftOption);
  const errors = results.flatMap((r) => r.errors);
  const warnings = results.flatMap((r) => r.warnings);
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    requiresZeroFareConfirmation: results.some((r) => r.requiresZeroFareConfirmation),
    hasNegativeMargin: results.some((r) => r.hasNegativeMargin),
  };
}

export function quotationTotal(options: EditorOption[], vat: VatContext): bigint {
  return options.reduce((sum, option) => {
    try {
      const computed = computeOption(option, vat);
      return sum + computed.totalMinor;
    } catch {
      return sum;
    }
  }, 0n);
}

export function invariantLineTotal(computed: ComputedOption): boolean {
  return sumLinePrices(computed.result) === computed.totalMinor;
}

export function pricedLineForDisplay(line: PricedLine): { description: string; priceMinor: bigint } {
  return { description: line.description, priceMinor: line.priceMinor };
}
