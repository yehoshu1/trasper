/**
 * Pure pricing engine. No database, no I/O, no clock.
 *
 * Money is always BigInt in minor units. Exchange rates are scaled by
 * 1,000,000. Percentages (margin, VAT, percentage taxes) are basis points.
 *
 * Calculation order:
 *   1. convert each cost line at the option's stored rate
 *   2. sum to the cost total
 *   3. markup = cost total x percentage, or the lump sum
 *   4. VAT = markup x rate, only when switched on (never on cost or taxes)
 *   5. enabled optional taxes are added
 *   6. customer total = cost + markup + VAT + taxes
 *   7. round once to the rounding unit at the end
 *
 * The rounded total is then allocated back over the lines in proportion to
 * cost. The last line absorbs any remainder so line prices always add up
 * exactly to the total.
 */

export const RATE_SCALE = 1_000_000n;
export const BPS_SCALE = 10_000n;

export type MarginKind = "percent" | "lump";
export type TaxKind = "fixed" | "percent";
/** What an optional percentage tax is charged on. VAT is always on markup. */
export type TaxBase = "cost" | "markup" | "subtotal";

export interface PricingLineInput {
  id: string;
  /** Label used on customer documents, e.g. "Adult 1 — J. Banda". */
  description: string;
  /** Cost in the option's cost currency, minor units. */
  costMinor: bigint;
  /** Optional grouping used by document renderers. */
  kind?: "fare" | "service";
  passengerId?: string;
  /** Accommodation/service quantity, e.g. 3 nights or 2 rooms. */
  quantity?: number;
  /** Unit label used on quotations: night, room_night, person, package... */
  unit?: string;
  /** Optional per-unit cost in the option's cost currency. */
  unitCostMinor?: bigint;
  /** Room type, board basis, supplier reference and similar sub-text. */
  detail?: string;
}

export interface TaxInput {
  id: string;
  name: string;
  kind: TaxKind;
  /** Minor units when fixed, basis points when percent. */
  value: bigint;
  enabled: boolean;
  /** Percentage base; defaults to the converted cost. */
  base?: TaxBase;
}

export interface PricingInput {
  lines: PricingLineInput[];
  /** Quotation currency per 1 cost currency, multiplied by 1,000,000. */
  rateMicro: bigint;
  marginKind: MarginKind;
  /** Basis points when percent, quotation minor units when lump. */
  marginValue: bigint;
  vatEnabled: boolean;
  /** Basis points, e.g. 16.5% = 1650. */
  vatRateBps: bigint;
  taxes: TaxInput[];
  /** Rounding unit in quotation minor units, e.g. 100 = whole MWK. */
  roundingUnit: bigint;
}

export interface PricedLine extends PricingLineInput {
  /** Cost converted to quotation currency, minor units. */
  convertedCostMinor: bigint;
  /** Per-unit cost converted to quotation currency, when supplied. */
  convertedUnitCostMinor?: bigint;
  /** Line's share of markup, VAT and taxes (customer never sees this split). */
  markupShareMinor: bigint;
  vatShareMinor: bigint;
  taxShareMinor: bigint;
  /** The single lump sum shown to the customer. */
  priceMinor: bigint;
}

export interface PricingResult {
  currencyCost?: string;
  lines: PricedLine[];
  costTotalMinor: bigint;
  markupMinor: bigint;
  vatMinor: bigint;
  taxesMinor: bigint;
  taxes: {
    id: string;
    name: string;
    kind: TaxKind;
    value: bigint;
    base: TaxBase;
    amountMinor: bigint;
  }[];
  /** Total before the final rounding step. */
  unroundedTotalMinor: bigint;
  /** totalMinor - unroundedTotalMinor; shown as a rounding row when needed. */
  roundingAdjustmentMinor: bigint;
  totalMinor: bigint;
  /** Profit is markup. VAT is a liability, not profit. */
  profitMinor: bigint;
  vatRateBps?: bigint;
}

export class PricingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PricingError";
  }
}

/** Round a rational number to the nearest integer, halves away from zero. */
export function roundDiv(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new PricingError("Division by zero");
  const negative = numerator < 0n !== denominator < 0n;
  const absN = numerator < 0n ? -numerator : numerator;
  const absD = denominator < 0n ? -denominator : denominator;
  let q = absN / absD;
  const remainder = absN % absD;
  if (remainder * 2n >= absD) q += 1n;
  return negative ? -q : q;
}

/** Round to a positive unit, halves away from zero. */
export function roundToUnit(value: bigint, unit: bigint): bigint {
  if (unit <= 0n) throw new PricingError("Rounding unit must be positive");
  return roundDiv(value, unit) * unit;
}

/**
 * Convert a cost from the cost currency to the quotation currency.
 * Both are minor units; cross-currency conversion rounds to the smaller
 * unit once per line, which is the amount that appears on the quotation.
 */
export function convertMinor(
  costMinor: bigint,
  rateMicro: bigint,
): bigint {
  if (rateMicro <= 0n) throw new PricingError("Exchange rate must be positive");
  return roundDiv(costMinor * rateMicro, RATE_SCALE);
}

function percentOf(amount: bigint, bps: bigint): bigint {
  return roundDiv(amount * bps, BPS_SCALE);
}

export function calculateOption(input: PricingInput): PricingResult {
  const {
    lines,
    rateMicro,
    marginKind,
    marginValue,
    vatEnabled,
    vatRateBps,
    taxes,
    roundingUnit,
  } = input;

  if (roundingUnit <= 0n) throw new PricingError("Rounding unit must be positive");
  if (lines.length === 0) throw new PricingError("At least one cost line is required");
  if (marginKind === "percent" && marginValue < -100_000n) {
    throw new PricingError("Negative margin cannot exceed 100%");
  }
  if (vatEnabled && vatRateBps < 0n) throw new PricingError("VAT rate cannot be negative");

  const converted = lines.map((line) => ({
    ...line,
    convertedCostMinor: convertMinor(line.costMinor, rateMicro),
    convertedUnitCostMinor:
      line.unitCostMinor === undefined
        ? undefined
        : convertMinor(line.unitCostMinor, rateMicro),
  }));
  const costTotalMinor = converted.reduce(
    (sum, line) => sum + line.convertedCostMinor,
    0n,
  );

  const markupMinor =
    marginKind === "percent"
      ? percentOf(costTotalMinor, marginValue)
      : marginValue;

  const vatMinor = vatEnabled ? percentOf(markupMinor, vatRateBps) : 0n;

  const taxResults = taxes
    .filter((tax) => tax.enabled)
    .map((tax) => {
      const base = tax.base ?? "cost";
      const baseAmount =
        base === "markup"
          ? markupMinor
          : base === "subtotal"
            ? costTotalMinor + markupMinor
            : costTotalMinor;
      return {
        id: tax.id,
        name: tax.name,
        kind: tax.kind,
        value: tax.value,
        base,
        amountMinor:
          tax.kind === "percent" ? percentOf(baseAmount, tax.value) : tax.value,
      };
    });
  const taxesMinor = taxResults.reduce((sum, t) => sum + t.amountMinor, 0n);

  const unroundedTotalMinor =
    costTotalMinor + markupMinor + vatMinor + taxesMinor;
  const totalMinor = roundToUnit(unroundedTotalMinor, roundingUnit);
  const roundingAdjustmentMinor = totalMinor - unroundedTotalMinor;

  // Shares are proportional to converted cost. The final line absorbs the
  // rounding difference, so line prices always sum exactly to the total.
  const markupShares: bigint[] = [];
  const vatShares: bigint[] = [];
  const taxShares: bigint[] = [];
  const prices: bigint[] = [];

  let markupAllocated = 0n;
  let vatAllocated = 0n;
  let taxAllocated = 0n;
  let priceAllocated = 0n;

  for (let i = 0; i < converted.length; i += 1) {
    const last = i === converted.length - 1;
    const cost = converted[i].convertedCostMinor;
    // With a zero cost total there is no proportion to follow; the whole
    // amount belongs to the final line.
    const proportional = costTotalMinor !== 0n;

    const priceShare = last
      ? totalMinor - priceAllocated
      : proportional
        ? roundToUnit(roundDiv(cost * totalMinor, costTotalMinor), roundingUnit)
        : 0n;
    const markupShare = last
      ? markupMinor - markupAllocated
      : proportional
        ? roundDiv(cost * markupMinor, costTotalMinor)
        : 0n;
    const vatShare = last
      ? vatMinor - vatAllocated
      : proportional
        ? roundDiv(cost * vatMinor, costTotalMinor)
        : 0n;
    const taxShare = last
      ? taxesMinor - taxAllocated
      : proportional
        ? roundDiv(cost * taxesMinor, costTotalMinor)
        : 0n;

    prices.push(priceShare);
    markupShares.push(markupShare);
    vatShares.push(vatShare);
    taxShares.push(taxShare);

    if (!last) {
      priceAllocated += priceShare;
      markupAllocated += markupShare;
      vatAllocated += vatShare;
      taxAllocated += taxShare;
    }
  }

  const pricedLines: PricedLine[] = converted.map((line, i) => ({
    ...line,
    convertedCostMinor: line.convertedCostMinor,
    convertedUnitCostMinor: line.convertedUnitCostMinor,
    markupShareMinor: markupShares[i],
    vatShareMinor: vatShares[i],
    taxShareMinor: taxShares[i],
    priceMinor: prices[i],
  }));

  return {
    lines: pricedLines,
    costTotalMinor,
    markupMinor,
    vatMinor,
    taxesMinor,
    taxes: taxResults,
    unroundedTotalMinor,
    roundingAdjustmentMinor,
    totalMinor,
    profitMinor: markupMinor,
    vatRateBps,
  };
}

/** Sum of line prices; used by tests and invariant checks. */
export function sumLinePrices(result: PricingResult): bigint {
  return result.lines.reduce((sum, line) => sum + line.priceMinor, 0n);
}
