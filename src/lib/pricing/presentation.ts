import { roundDiv, type PricingResult, type TaxBase, type TaxKind } from "./index";

/**
 * Customer-facing price presentation.
 *
 * The calculation stays exactly the same for every display mode: cost is
 * converted, markup and VAT/taxes are calculated once, and the total is
 * rounded once. This module only decides how those already-rounded amounts are
 * laid out on a quotation. Every row it returns adds up to the same total, so
 * changing the presentation can never change what the customer owes.
 *
 * All money values are decimal strings in the quotation currency's minor
 * units, which keeps the result JSON-safe for frozen document snapshots.
 */

export const PRICE_DISPLAY_MODES = [
  "lump_sum",
  "net_plus_fee",
  "itemised",
  "per_person",
  "total_only",
] as const;

export type PriceDisplayMode = (typeof PRICE_DISPLAY_MODES)[number];

export const PRICE_DISPLAY_LABELS: Record<PriceDisplayMode, string> = {
  lump_sum: "Lump sum per line",
  net_plus_fee: "Price plus service fee",
  itemised: "Itemised cost, fee and taxes",
  per_person: "Per-person price",
  total_only: "Single total only",
};

export const PRICE_DISPLAY_DESCRIPTIONS: Record<PriceDisplayMode, string> = {
  lump_sum:
    "One all-inclusive amount per flight or service. This is the traditional quotation layout.",
  net_plus_fee:
    "Show the supplier price for each flight or service, then one clearly labelled service fee.",
  itemised:
    "Show the supplier cost, the service fee and each tax as separate rows. Most transparent, and closest to a tax invoice layout.",
  per_person:
    "Show the all-inclusive lines plus the price per traveller, as used for packages and group trips.",
  total_only:
    "Show a single package total without line prices, as some tour operators and cruise lines do.",
};

export const TAX_DISPLAY_MODES = ["included", "note", "summary", "itemised"] as const;

export type TaxDisplayMode = (typeof TAX_DISPLAY_MODES)[number];

export const TAX_DISPLAY_LABELS: Record<TaxDisplayMode, string> = {
  included: "Taxes included — hidden",
  note: "Taxes included — with a note",
  summary: "Taxes NOT included — one combined tax line",
  itemised: "Taxes NOT included — each tax shown separately",
};

export const TAX_DISPLAY_DESCRIPTIONS: Record<TaxDisplayMode, string> = {
  included:
    "Line prices already contain tax; no tax row is printed. This is the traditional quotation layout.",
  note:
    "Line prices already contain tax, with a short note confirming that taxes are included.",
  summary:
    "Line prices exclude tax. One combined taxes-and-fees row is added before the total, so the customer can see that tax is not included in the line prices.",
  itemised:
    "Line prices exclude tax. VAT and every enabled optional tax are listed by name, rate and base before the total.",
};

export const SERVICE_UNITS = [
  "unit",
  "night",
  "day",
  "room",
  "room_night",
  "person",
  "person_night",
  "package",
] as const;

export type ServiceUnit = (typeof SERVICE_UNITS)[number];

export const SERVICE_UNIT_LABELS: Record<ServiceUnit, string> = {
  unit: "Unit",
  night: "Night",
  day: "Day",
  room: "Room",
  room_night: "Room/night",
  person: "Person",
  person_night: "Person/night",
  package: "Package",
};

export const SERVICE_UNIT_PLURALS: Record<ServiceUnit, string> = {
  unit: "units",
  night: "nights",
  day: "days",
  room: "rooms",
  room_night: "room-nights",
  person: "people",
  person_night: "person-nights",
  package: "packages",
};

export function isPriceDisplayMode(value: unknown): value is PriceDisplayMode {
  return typeof value === "string" && PRICE_DISPLAY_MODES.includes(value as PriceDisplayMode);
}

export function isTaxDisplayMode(value: unknown): value is TaxDisplayMode {
  return typeof value === "string" && TAX_DISPLAY_MODES.includes(value as TaxDisplayMode);
}

export function isServiceUnit(value: unknown): value is ServiceUnit {
  return typeof value === "string" && SERVICE_UNITS.includes(value as ServiceUnit);
}

export interface PresentationLine {
  description: string;
  amountMinor: string;
  kind: "fare" | "service";
  /** Accommodation / service quantity, e.g. 3 nights or 2 rooms. */
  quantity?: number;
  unit?: string;
  /** Display-only unit rate derived from the amount shown on this row. */
  unitAmountMinor?: string;
  /** Room type, board basis, supplier reference and similar sub-text. */
  detail?: string;
}

export interface PresentationTaxLine {
  name: string;
  amountMinor: string;
  kind: TaxKind;
  /** Basis points for percentage taxes, otherwise undefined. */
  rateBps?: string;
  base?: TaxBase;
}

export interface PricePresentation {
  priceDisplay: PriceDisplayMode;
  taxDisplay: TaxDisplayMode;
  lines: PresentationLine[];
  /** Sum of the line rows before a separately shown service fee/tax. */
  subtotalMinor: string;
  serviceFeeMinor: string;
  serviceFeeLabel: string;
  taxLines: PresentationTaxLine[];
  /** VAT plus optional taxes shown as separate rows (empty when included). */
  taxesMinor: string;
  vatMinor: string;
  taxLabel: string;
  vatLabel: string;
  taxNote?: string;
  taxRegistrationNumber?: string;
  totalMinor: string;
  totalLabel: string;
  perPersonMinor?: string;
  perPersonLabel?: string;
  passengerCount?: number;
}

export interface PresentationOptions {
  priceDisplay: PriceDisplayMode;
  taxDisplay: TaxDisplayMode;
  serviceFeeLabel?: string;
  taxLabel?: string;
  vatLabel?: string;
  totalLabel?: string;
  perPersonLabel?: string;
  /** Overrides the built-in "taxes included" note. */
  taxNote?: string;
  taxRegistrationNumber?: string;
  passengerCount?: number;
}

const DEFAULT_LABELS = {
  serviceFeeLabel: "Service fee",
  taxLabel: "Taxes",
  vatLabel: "VAT",
  totalLabel: "Total",
  perPersonLabel: "Price per person",
};

function taxBaseLabel(base: TaxBase | undefined): string {
  if (base === "markup") return "service fee";
  if (base === "subtotal") return "subtotal";
  return "cost";
}

/** Human-readable rate/base suffix used by document renderers. */
export function taxRateLabel(tax: PresentationTaxLine): string {
  if (tax.kind === "fixed") return "fixed";
  const rate = Number(tax.rateBps ?? "0") / 100;
  return `${rate}% of ${taxBaseLabel(tax.base)}`;
}

/**
 * Build the customer-facing rows for an already calculated option.
 *
 * The invariant is checked here as well as in the pricing tests: the sum of
 * the main rows plus the service fee plus the tax rows equals the total.
 */
export function presentPricing(
  result: PricingResult,
  options: PresentationOptions,
): PricePresentation {
  const serviceFeeLabel = options.serviceFeeLabel?.trim() || DEFAULT_LABELS.serviceFeeLabel;
  const taxLabel = options.taxLabel?.trim() || DEFAULT_LABELS.taxLabel;
  const vatLabel = options.vatLabel?.trim() || DEFAULT_LABELS.vatLabel;
  const totalLabel = options.totalLabel?.trim() || DEFAULT_LABELS.totalLabel;
  const perPersonLabel = options.perPersonLabel?.trim() || DEFAULT_LABELS.perPersonLabel;

  // An itemised price layout is only useful when the tax rows are visible.
  // If the agency left taxes "included", promote the tax layout to a combined
  // row so that the service-fee row cannot silently absorb the tax.
  const effectiveTaxDisplay: TaxDisplayMode =
    options.priceDisplay === "total_only"
      ? "included"
      : options.priceDisplay === "itemised" &&
          (options.taxDisplay === "included" || options.taxDisplay === "note")
        ? "summary"
        : options.taxDisplay;

  const taxSeparate =
    effectiveTaxDisplay === "summary" || effectiveTaxDisplay === "itemised";

  const taxLines: PresentationTaxLine[] = [];
  if (taxSeparate) {
    if (effectiveTaxDisplay === "summary") {
      const combined = result.vatMinor + result.taxesMinor;
      if (combined !== 0n) {
        taxLines.push({
          name: taxLabel,
          amountMinor: combined.toString(),
          kind: "fixed",
        });
      }
    } else {
      if (result.vatMinor !== 0n) {
        taxLines.push({
          name: vatLabel,
          amountMinor: result.vatMinor.toString(),
          kind: "percent",
          rateBps: result.vatRateBps?.toString(),
          base: "markup",
        });
      }
      for (const tax of result.taxes) {
        if (tax.amountMinor === 0n) continue;
        taxLines.push({
          name: tax.name,
          amountMinor: tax.amountMinor.toString(),
          kind: tax.kind,
          rateBps: tax.kind === "percent" ? tax.value.toString() : undefined,
          base: tax.base,
        });
      }
    }
  }
  const taxRowsTotal = taxLines.reduce((sum, line) => sum + BigInt(line.amountMinor), 0n);

  const showFee =
    options.priceDisplay === "net_plus_fee" || options.priceDisplay === "itemised";

  const lines: PresentationLine[] = [];
  if (options.priceDisplay !== "total_only") {
    for (const line of result.lines) {
      let amount: bigint;
      switch (options.priceDisplay) {
        case "net_plus_fee":
          // Supplier price, with VAT/taxes folded in only when the tax layout
          // says they are included.
          amount =
            line.convertedCostMinor +
            (taxSeparate ? 0n : line.vatShareMinor + line.taxShareMinor);
          break;
        case "itemised":
          amount = line.convertedCostMinor;
          break;
        case "per_person":
        case "lump_sum":
        default:
          amount = line.priceMinor - (taxSeparate ? line.vatShareMinor + line.taxShareMinor : 0n);
          break;
      }

      const quantity = line.quantity && line.quantity > 0 ? line.quantity : undefined;
      const unit = line.unit;
      const showUnit = Boolean(quantity && quantity > 1) || (unit !== undefined && unit !== "unit");
      const unitAmountMinor = showUnit && quantity
        ? roundDiv(amount, BigInt(quantity)).toString()
        : undefined;

      lines.push({
        description: line.description,
        amountMinor: amount.toString(),
        kind: line.kind === "fare" ? "fare" : "service",
        quantity,
        unit,
        unitAmountMinor,
        detail: line.detail,
      });
    }
  }

  const subtotalMinor = lines.reduce((sum, line) => sum + BigInt(line.amountMinor), 0n);
  const serviceFeeMinor = showFee ? result.totalMinor - subtotalMinor - taxRowsTotal : 0n;
  const totalMinor = result.totalMinor;

  const passengerCount =
    options.passengerCount && options.passengerCount > 0 ? options.passengerCount : undefined;
  const perPersonMinor =
    options.priceDisplay === "per_person" && passengerCount
      ? roundDiv(totalMinor, BigInt(passengerCount)).toString()
      : undefined;

  const taxNote =
    effectiveTaxDisplay === "note"
      ? options.taxNote?.trim() ||
        `Prices include ${vatLabel.toLowerCase()} and applicable taxes.`
      : options.taxNote?.trim() || undefined;

  return {
    priceDisplay: options.priceDisplay,
    taxDisplay: effectiveTaxDisplay,
    lines,
    subtotalMinor: subtotalMinor.toString(),
    serviceFeeMinor: serviceFeeMinor.toString(),
    serviceFeeLabel,
    taxLines,
    taxesMinor: taxRowsTotal.toString(),
    vatMinor: result.vatMinor.toString(),
    taxLabel,
    vatLabel,
    taxNote,
    taxRegistrationNumber: taxSeparate ? options.taxRegistrationNumber : undefined,
    totalMinor: totalMinor.toString(),
    totalLabel,
    perPersonMinor,
    perPersonLabel,
    passengerCount,
  };
}

/**
 * Sum of the rows a customer can add up: main rows + service fee + tax rows.
 * Document renderers and tests use this to prove the layout matches the total.
 */
export function sumPresentation(presentation: PricePresentation): bigint {
  if (presentation.priceDisplay === "total_only") {
    // The single total is the only amount printed in this layout.
    return BigInt(presentation.totalMinor);
  }
  const rows = presentation.lines.reduce((sum, line) => sum + BigInt(line.amountMinor), 0n);
  const taxes = presentation.taxLines.reduce((sum, line) => sum + BigInt(line.amountMinor), 0n);
  return rows + BigInt(presentation.serviceFeeMinor) + taxes;
}
