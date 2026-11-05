import type { Prisma } from "@/generated/prisma/client";
import { DateTime } from "luxon";

import { isExpired, appTimeZone, toDateInput } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { parseFrozenTotals } from "@/lib/documents";
import { groupTravellerPassengers } from "@/lib/travellers";
import {
  computeOption,
  presentOption,
  resolvePriceDisplay,
  resolveTaxDisplay,
  resolveVatContext,
  type ComputedOption,
  type EditorOption,
  type EditorQuotation,
  type VatContext,
} from "@/lib/quotation";
import type {
  PriceDisplayMode,
  PricePresentation,
  TaxDisplayMode,
} from "@/lib/pricing/presentation";
import { isPriceDisplayMode, isTaxDisplayMode } from "@/lib/pricing/presentation";
import { prisma, jsonSafe } from "@/server/db";
import { audit } from "@/server/audit";
import type { AppSettings } from "@/server/settings";

export const quotationInclude = {
  contact: true,
  createdBy: { select: { id: true, name: true, email: true } },
  options: {
    orderBy: { position: "asc" },
    include: {
      segments: { orderBy: { position: "asc" } },
      fares: { include: { passenger: true } },
      services: true,
      taxes: true,
    },
  },
  itineraries: { orderBy: { issuedAt: "desc" } },
  proformas: {
    orderBy: { createdAt: "desc" },
    include: { payments: { orderBy: { createdAt: "asc" } } },
  },
} satisfies Prisma.QuotationInclude;

export type QuotationWithRelations = Prisma.QuotationGetPayload<{
  include: typeof quotationInclude;
}>;

export type QuotationOptionWithRelations = QuotationWithRelations["options"][number];

export async function loadQuotation(id: string): Promise<QuotationWithRelations | null> {
  return prisma.quotation.findUnique({ where: { id }, include: quotationInclude });
}

export async function loadQuotationByNumber(number: string): Promise<QuotationWithRelations | null> {
  return prisma.quotation.findUnique({ where: { number }, include: quotationInclude });
}

export function vatContextFor(
  quotation: Pick<QuotationWithRelations, "vatOverride">,
  settings: AppSettings,
): VatContext {
  return resolveVatContext(
    settings.vatEnabled,
    settings.vatRateBps,
    quotation.vatOverride,
    settings.roundingUnit,
  );
}

export function priceDisplayFor(
  quotation: Pick<QuotationWithRelations, "pricingDisplay">,
  settings: AppSettings,
): PriceDisplayMode {
  const override = isPriceDisplayMode(quotation.pricingDisplay)
    ? quotation.pricingDisplay
    : null;
  return resolvePriceDisplay(override, settings.pricingDisplay);
}

export function taxDisplayFor(
  quotation: Pick<QuotationWithRelations, "taxDisplay">,
  settings: AppSettings,
): TaxDisplayMode {
  const override = isTaxDisplayMode(quotation.taxDisplay) ? quotation.taxDisplay : null;
  return resolveTaxDisplay(override, settings.taxDisplay);
}

export interface PresentationContext {
  priceDisplay: PriceDisplayMode;
  taxDisplay: TaxDisplayMode;
  serviceFeeLabel: string;
  taxLabel: string;
  vatLabel: string;
  totalLabel: string;
  perPersonLabel: string;
  taxNote?: string;
  taxRegistrationNumber?: string;
}

export function presentationContextFor(
  quotation: Pick<QuotationWithRelations, "pricingDisplay" | "taxDisplay">,
  settings: AppSettings,
): PresentationContext {
  return {
    priceDisplay: priceDisplayFor(quotation, settings),
    taxDisplay: taxDisplayFor(quotation, settings),
    serviceFeeLabel: settings.serviceFeeLabel,
    taxLabel: settings.taxLabel,
    vatLabel: settings.vatLabel,
    totalLabel: settings.totalLabel,
    perPersonLabel: settings.perPersonLabel,
    taxNote: settings.taxNote || undefined,
    taxRegistrationNumber: settings.vatRegistrationNumber || undefined,
  };
}

export function presentationFor(
  computed: ComputedOption,
  option: EditorOption,
  context: PresentationContext,
): PricePresentation {
  return presentOption(computed, option, context);
}

export function toEditorOption(option: QuotationOptionWithRelations): EditorOption {
  return {
    id: option.id,
    label: option.label,
    optionType: option.optionType === "accommodation" ||
      option.optionType === "package" ||
      option.optionType === "tour" ||
      option.optionType === "cruise" ||
      option.optionType === "other"
      ? option.optionType
      : "flight",
    pnr: option.pnr ?? "",
    ticketingDeadline: option.ticketingDeadline
      ? toLocalInput(option.ticketingDeadline)
      : "",
    costCurrency: option.costCurrency,
    rateMicro: option.rateMicro.toString(),
    marginKind: option.marginKind === "lump" ? "lump" : "percent",
    marginValue: option.marginValue.toString(),
    segments: option.segments.map((segment) => ({
      id: segment.id,
      airline: segment.airline,
      flightNo: segment.flightNo,
      fromIata: segment.fromIata,
      toIata: segment.toIata,
      departLocal: segment.departLocal,
      arriveLocal: segment.arriveLocal,
      cabin: segment.cabin ?? undefined,
      operatingCarrier: segment.operatingCarrier ?? undefined,
    })),
    fares: option.fares.map((fare) => ({
      id: fare.id,
      passengerId: fare.passengerId ?? "",
      passengerName: fare.passenger
        ? `${fare.passenger.firstName} ${fare.passenger.lastName}`
        : "",
      passengerType: (fare.passenger?.type ??
        fare.passengerType) as EditorOption["fares"][number]["passengerType"],
      quantity: fare.quantity.toString(),
      costMinor: fare.costMinor.toString(),
      travellerNames: fare.travellerNames ?? undefined,
    })),
    services: option.services.map((service) => ({
      id: service.id,
      category: service.category,
      description: service.description,
      costMinor: service.costMinor.toString(),
      quantity: service.quantity.toString(),
      unit: service.unit,
      unitCostMinor:
        service.unitCostMinor === null ? undefined : service.unitCostMinor.toString(),
      details: service.details ?? undefined,
    })),
    taxes: option.taxes.map((tax) => ({
      id: tax.id,
      name: tax.name,
      kind: tax.kind === "percent" ? "percent" : "fixed",
      value: tax.value.toString(),
      enabled: tax.enabled,
      base: tax.base === "markup" || tax.base === "subtotal" ? tax.base : "cost",
    })),
  };
}

function toLocalInput(date: Date): string {
  // Stored as an instant; show the agency's local wall clock for editing.
  return DateTime.fromJSDate(date, { zone: appTimeZone() }).toFormat("yyyy-LL-dd'T'HH:mm");
}

export function toEditorQuotation(quotation: QuotationWithRelations): EditorQuotation {
  return {
    id: quotation.id,
    number: quotation.number,
    revision: quotation.revision,
    status: quotation.status,
    contactId: quotation.contactId,
    contactName: quotation.contact.name,
    referenceNo: quotation.referenceNo ?? "",
    branch: quotation.branch,
    currency: quotation.currency,
    issueDate: toDateInput(quotation.issueDate),
    validUntil: toDateInput(quotation.validUntil),
    vatOverride: quotation.vatOverride,
    pricingDisplay: isPriceDisplayMode(quotation.pricingDisplay) ? quotation.pricingDisplay : null,
    taxDisplay: isTaxDisplayMode(quotation.taxDisplay) ? quotation.taxDisplay : null,
    heading: quotation.heading ?? "",
    notes: quotation.notes ?? "",
    bankAccountId: quotation.bankAccountId ?? "",
    version: quotation.version,
    locked: quotation.status !== "draft",
    acceptedOptionId: quotation.acceptedOptionId,
    options: quotation.options.map(toEditorOption),
  };
}

export function computeDbOption(
  option: QuotationOptionWithRelations,
  quotation: Pick<QuotationWithRelations, "vatOverride">,
  settings: AppSettings,
): ComputedOption {
  return computeOption(toEditorOption(option), vatContextFor(quotation, settings));
}

export interface OptionSummary {
  option: QuotationOptionWithRelations;
  computed: ComputedOption;
  frozen: boolean;
}

/** Totals for lists and internal panels. Sent options use their frozen totals. */
export async function computeQuotationSummary(
  quotation: QuotationWithRelations,
  settings: AppSettings,
): Promise<{ options: OptionSummary[]; totalMinor: bigint }> {
  const options = quotation.options.map((option) => {
    const frozen = option.frozenTotals;
    const computed = computeDbOption(option, quotation, settings);
    return { option, computed, frozen: Boolean(frozen) };
  });
  return {
    options,
    totalMinor: options.reduce((sum, entry) => sum + entry.computed.totalMinor, 0n),
  };
}

/** Total that respects a sent quotation's frozen figures. */
export function displayOptionTotal(
  option: QuotationOptionWithRelations,
  quotation: Pick<QuotationWithRelations, "vatOverride">,
  settings: AppSettings,
): bigint {
  const frozen = parseFrozenTotals(option.frozenTotals);
  if (frozen) return BigInt(frozen.totals.totalMinor);
  try {
    return computeDbOption(option, quotation, settings).totalMinor;
  } catch {
    // A draft option with no fare or service lines yet (pasted PNR, fares
    // still to be added) has no price to show. The pricing engine stays
    // strict — sending is blocked by validation — but lists must render.
    return 0n;
  }
}

export function displayQuotationTotal(
  quotation: QuotationWithRelations,
  settings: AppSettings,
): bigint {
  return quotation.options.reduce(
    (sum, option) => sum + displayOptionTotal(option, quotation, settings),
    0n,
  );
}

/**
 * Persist the calculated totals, rate and VAT setting for every option. From
 * this point the quotation is frozen: later rate or setting changes cannot
 * alter it.
 */
export async function freezeOptions(
  tx: Prisma.TransactionClient,
  quotation: QuotationWithRelations,
  settings: AppSettings,
): Promise<void> {
  const vat = vatContextFor(quotation, settings);
  const presentationContext = presentationContextFor(quotation, settings);
  for (const option of quotation.options) {
    const editorOption = toEditorOption(option);
    const computed = computeOption(editorOption, vat);
    const presentation = presentationFor(computed, editorOption, presentationContext);
    const passengers = new Map<string, { id: string; title?: string; firstName: string; lastName: string; type: string; quantity?: number; unnamed?: boolean }>();
    for (const fare of option.fares) {
      if (!fare.passengerId || !fare.passenger) continue;
      passengers.set(fare.passengerId, {
        id: fare.passengerId,
        title: fare.passenger.title ?? undefined,
        firstName: fare.passenger.firstName,
        lastName: fare.passenger.lastName,
        type: fare.passenger.type,
      });
    }
    for (const fare of option.fares) {
      if (fare.passengerId) continue;
      const expanded = groupTravellerPassengers(
        fare.passengerType as "adult" | "child" | "infant",
        fare.quantity,
        fare.travellerNames,
      );
      for (const passenger of expanded) {
        if (passenger.unnamed) {
          passengers.set(`group-${fare.passengerType}`, {
            id: `group-${fare.passengerType}`,
            firstName: "",
            lastName: "",
            type: fare.passengerType,
            quantity: passenger.quantity,
            unnamed: true,
          });
        } else {
          const id = `name-${fare.passengerType}-${passenger.firstName}-${passenger.lastName}`;
          passengers.set(id, {
            id,
            firstName: passenger.firstName,
            lastName: passenger.lastName,
            type: fare.passengerType,
          });
        }
      }
    }

    const frozen = {
      version: 1 as const,
      frozenAt: new Date().toISOString(),
      currency: quotation.currency,
      label: option.label,
      optionType: option.optionType,
      pnr: option.pnr ?? undefined,
      ticketingDeadline: option.ticketingDeadline?.toISOString(),
      costCurrency: option.costCurrency,
      rateMicro: option.rateMicro.toString(),
      marginKind: option.marginKind,
      marginValue: option.marginValue.toString(),
      vatEnabled: vat.enabled,
      vatRateBps: vat.rateBps.toString(),
      roundingUnit: vat.roundingUnit.toString(),
      totals: {
        costMinor: computed.result.costTotalMinor.toString(),
        markupMinor: computed.result.markupMinor.toString(),
        vatMinor: computed.result.vatMinor.toString(),
        taxesMinor: computed.result.taxesMinor.toString(),
        totalMinor: computed.totalMinor.toString(),
        profitMinor: computed.result.profitMinor.toString(),
      },
      lines: computed.lines.map((line, index) => ({
        id: line.id,
        description: line.description,
        kind: line.kind,
        priceMinor: line.priceMinor.toString(),
        costMinor: computed.result.lines[index].convertedCostMinor.toString(),
      })),
      presentation,
      passengers: [...passengers.values()],
      services: option.services.map((service) => ({
        category: service.category,
        description: service.description,
        costMinor: service.costMinor.toString(),
        quantity: service.quantity,
        unit: service.unit,
        unitCostMinor:
          service.unitCostMinor === null ? undefined : service.unitCostMinor.toString(),
        details: service.details ?? undefined,
      })),
      taxes: option.taxes.map((tax, index) => ({
        name: tax.name,
        kind: tax.kind,
        value: tax.value.toString(),
        enabled: tax.enabled,
        base: tax.base,
        amountMinor: (computed.result.taxes.find((t) => t.id === (tax.id ?? `tax-${index}`))?.amountMinor ?? 0n).toString(),
      })),
      segments: option.segments.map((segment) => ({
        airline: segment.airline,
        flightNo: segment.flightNo,
        fromIata: segment.fromIata,
        toIata: segment.toIata,
        departLocal: segment.departLocal,
        arriveLocal: segment.arriveLocal,
        cabin: segment.cabin ?? undefined,
        operatingCarrier: segment.operatingCarrier ?? undefined,
      })),
    };

    await tx.quoteOption.update({
      where: { id: option.id },
      data: { frozenTotals: jsonSafe(frozen) },
    });
  }
}

/** Mark sent quotations past their valid-until date as expired (agency time). */
export async function expireOverdueQuotations(): Promise<number> {
  const sent = await prisma.quotation.findMany({
    where: { status: "sent" },
    select: { id: true, validUntil: true },
  });
  let count = 0;
  for (const quotation of sent) {
    if (!isExpired(quotation.validUntil)) continue;
    await prisma.$transaction(async (tx) => {
      await tx.quotation.update({ where: { id: quotation.id }, data: { status: "expired" } });
      await audit(tx, {
        userId: null,
        action: "expireQuotation",
        entity: "Quotation",
        entityId: quotation.id,
        before: { status: "sent" },
        after: { status: "expired" },
      });
    });
    count += 1;
  }
  return count;
}

export function formatQuotationTotal(totalMinor: bigint, currency: string): string {
  return formatMoney(totalMinor, currency);
}

export async function latestRate(fromCcy: string, toCcy: string): Promise<{
  rateMicro: bigint;
  effectiveFrom: Date;
} | null> {
  if (fromCcy === toCcy) {
    return { rateMicro: 1_000_000n, effectiveFrom: new Date() };
  }
  const rate = await prisma.exchangeRate.findFirst({
    where: { fromCcy, toCcy, effectiveFrom: { lte: new Date() } },
    orderBy: { effectiveFrom: "desc" },
  });
  return rate ? { rateMicro: rate.rateMicro, effectiveFrom: rate.effectiveFrom } : null;
}
