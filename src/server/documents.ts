import { DateTime } from "luxon";

import type { Contact, Airport } from "@/generated/prisma/client";
import { chooseBankAccount } from "@/lib/bank-accounts";
import { groupTravellerPassengers } from "@/lib/travellers";
import { toDateInput } from "@/lib/dates";
import type {
  DocumentBank,
  DocumentCompany,
  DocumentContact,
  DocumentFlight,
  DocumentLine,
  DocumentPassenger,
  FrozenTotals,
  ItinerarySnapshot,
  ProformaSnapshot,
  QuotationSnapshot,
} from "@/lib/documents";
import { parseFrozenTotals, titleCaseCarrier } from "@/lib/documents";
import { formatMoney } from "@/lib/money";
import { formatDuration, timeItinerary } from "@/lib/time";
import { prisma, jsonSafe } from "@/server/db";
import type { AppSettings } from "@/server/settings";
import type { QuotationOptionWithRelations, QuotationWithRelations } from "@/server/quotations";
import {
  computeDbOption,
  presentationContextFor,
  presentationFor,
  toEditorOption,
} from "@/server/quotations";
import type { PricePresentation } from "@/lib/pricing/presentation";

export class DocumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DocumentError";
  }
}

export function companySnapshot(settings: AppSettings): DocumentCompany {
  return {
    name: settings.companyName,
    address: settings.companyAddress,
    email: settings.companyEmail,
    phone: settings.companyPhone,
    website: settings.companyWebsite,
    tin: settings.companyTin,
    headerImage: settings.companyHeaderImage,
    letterhead: settings.companyLetterheadImage || undefined,
    headerMode: settings.companyHeaderMode,
    footerText: settings.companyFooterText,
    vatRegistrationNumber: settings.vatRegistrationNumber,
  };
}

export function contactSnapshot(contact: Contact): DocumentContact {
  return {
    name: contact.name,
    attention: contact.attention ?? undefined,
    poBox: contact.poBox ?? undefined,
    city: contact.city ?? undefined,
    country: contact.country ?? undefined,
    physicalAddress: contact.physicalAddress ?? undefined,
    email: contact.email ?? undefined,
    phone: contact.phone ?? undefined,
  };
}

/**
 * Snapshot the account chosen for this document. An explicit choice wins,
 * then the active default, then the first active account. The returned object
 * is frozen into the document JSON, so later edits never change it.
 */
export async function bankSnapshot(
  bankAccountId?: string | null,
  preferredCurrency?: string,
): Promise<DocumentBank | null> {
  const accounts = await prisma.bankAccount.findMany({
    where: { isArchived: false },
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
  });
  if (accounts.length === 0) return null;

  const chosen =
    chooseBankAccount(accounts, bankAccountId) ??
    accounts.find((account) => account.currency === preferredCurrency) ??
    null;
  if (!chosen) return null;
  return {
    label: chosen.label,
    currency: chosen.currency,
    bankName: chosen.bankName,
    accountName: chosen.accountName,
    accountNumber: chosen.accountNumber,
    branch: chosen.branchName ?? undefined,
    swift: chosen.swiftCode ?? undefined,
    sortCode: chosen.sortCode ?? undefined,
    instructions: chosen.paymentInstructions ?? undefined,
  };
}

export function passengersForOption(option: QuotationOptionWithRelations): DocumentPassenger[] {
  const seen = new Set<string>();
  const passengers: DocumentPassenger[] = [];
  const groups = new Map<DocumentPassenger["type"], number>();
  for (const fare of option.fares) {
    if (!fare.passengerId) {
      const type = fare.passengerType as DocumentPassenger["type"];
      const expanded = groupTravellerPassengers(type, fare.quantity, fare.travellerNames);
      for (const passenger of expanded) {
        if (passenger.unnamed) {
          groups.set(type, (groups.get(type) ?? 0) + Math.max(1, passenger.quantity ?? 1));
        } else {
          passengers.push(passenger);
        }
      }
      continue;
    }
    if (seen.has(fare.passengerId) || !fare.passenger) continue;
    seen.add(fare.passengerId);
    passengers.push({
      title: fare.passenger.title ?? undefined,
      firstName: fare.passenger.firstName,
      lastName: fare.passenger.lastName,
      type: fare.passenger.type as DocumentPassenger["type"],
    });
  }
  for (const [type, quantity] of groups) {
    passengers.push({ firstName: "", lastName: "", type, unnamed: true, quantity });
  }
  return passengers;
}

export function uniquePassengers(quotation: QuotationWithRelations): DocumentPassenger[] {
  const seen = new Set<string>();
  const seenNames = new Set<string>();
  const passengers: DocumentPassenger[] = [];
  const groups = new Map<DocumentPassenger["type"], number>();
  for (const option of quotation.options) {
    for (const fare of option.fares) {
      if (!fare.passengerId) {
        const type = fare.passengerType as DocumentPassenger["type"];
        const expanded = groupTravellerPassengers(type, fare.quantity, fare.travellerNames);
        for (const passenger of expanded) {
          if (passenger.unnamed) {
            // Options are alternatives, so the highest group count wins rather
            // than adding the same travellers once per option.
            groups.set(type, Math.max(groups.get(type) ?? 0, Math.max(1, passenger.quantity ?? 1)));
          } else {
            const key = `${type}|${passenger.firstName}|${passenger.lastName}`.toUpperCase();
            if (seenNames.has(key)) continue;
            seenNames.add(key);
            passengers.push(passenger);
          }
        }
        continue;
      }
      if (seen.has(fare.passengerId) || !fare.passenger) continue;
      seen.add(fare.passengerId);
      passengers.push({
        title: fare.passenger.title ?? undefined,
        firstName: fare.passenger.firstName,
        lastName: fare.passenger.lastName,
        type: fare.passenger.type as DocumentPassenger["type"],
      });
    }
  }
  for (const [type, quantity] of groups) {
    passengers.push({ firstName: "", lastName: "", type, unnamed: true, quantity });
  }
  return passengers;
}

type AirportMap = Map<string, Airport>;

async function airportMap(codes: string[]): Promise<AirportMap> {
  const airports = await prisma.airport.findMany({ where: { iata: { in: [...new Set(codes)] } } });
  return new Map(airports.map((airport) => [airport.iata, airport]));
}

export async function flightsForSegments(
  segments: {
    airline: string;
    flightNo: string;
    fromIata: string;
    toIata: string;
    departLocal: string;
    arriveLocal: string;
    cabin?: string | null;
    operatingCarrier?: string | null;
  }[],
): Promise<DocumentFlight[]> {
  if (segments.length === 0) return [];

  const airports = await airportMap(segments.flatMap((segment) => [segment.fromIata, segment.toIata]));
  const airlines = await prisma.airline.findMany({
    where: { iata: { in: [...new Set(segments.map((segment) => segment.airline))] } },
  });
  const airlineNames = new Map(airlines.map((airline) => [airline.iata, airline.name]));
  const airlineLogos = new Map(
    airlines.map((airline) => [airline.iata, airline.logoPath ?? undefined]),
  );

  for (const segment of segments) {
    if (!airports.has(segment.fromIata)) {
      throw new DocumentError(`Airport ${segment.fromIata} is not in the airport list`);
    }
    if (!airports.has(segment.toIata)) {
      throw new DocumentError(`Airport ${segment.toIata} is not in the airport list`);
    }
  }

  let timing;
  try {
    timing = timeItinerary(
      segments.map((segment) => ({
        airline: segment.airline,
        flightNo: segment.flightNo,
        fromIata: segment.fromIata,
        toIata: segment.toIata,
        departLocal: segment.departLocal,
        arriveLocal: segment.arriveLocal,
        fromTz: airports.get(segment.fromIata)!.tz,
        toTz: airports.get(segment.toIata)!.tz,
      })),
    );
  } catch (error) {
    throw new DocumentError(error instanceof Error ? error.message : "Invalid flight times");
  }

  return segments.map((segment, index) => {
    const from = airports.get(segment.fromIata)!;
    const to = airports.get(segment.toIata)!;
    return {
      airline: segment.airline,
      airlineName: airlineNames.get(segment.airline) ?? segment.airline,
      airlineLogo: airlineLogos.get(segment.airline),
      flightNo: segment.flightNo,
      fromIata: segment.fromIata,
      toIata: segment.toIata,
      fromName: from.name,
      fromCity: from.city,
      toName: to.name,
      toCity: to.city,
      departLocal: segment.departLocal,
      arriveLocal: segment.arriveLocal,
      durationMinutes: timing.segments[index].durationMinutes,
      layoverAfterMinutes:
        index < timing.layoversMinutes.length ? timing.layoversMinutes[index] : undefined,
      cabin: segment.cabin ?? undefined,
      operatingCarrier: segment.operatingCarrier
        ? titleCaseCarrier(segment.operatingCarrier)
        : undefined,
    };
  });
}

function linesFromComputed(computed: ReturnType<typeof computeDbOption>): DocumentLine[] {
  return computed.lines.map((line) => ({
    description: line.description,
    amountMinor: line.priceMinor.toString(),
  }));
}

function linesFromFrozen(frozen: FrozenTotals): DocumentLine[] {
  return frozen.lines.map((line) => ({
    description: line.description,
    amountMinor: line.priceMinor,
  }));
}

function optionTotals(
  quotation: QuotationWithRelations,
  option: QuotationOptionWithRelations,
  settings: AppSettings,
): {
  lines: DocumentLine[];
  presentation: PricePresentation | null;
  totalMinor: bigint;
  vatMinor: bigint;
  vatEnabled: boolean;
  costMinor: bigint;
  markupMinor: bigint;
  taxesMinor: bigint;
  frozen: FrozenTotals | null;
} {
  const frozen = parseFrozenTotals(option.frozenTotals);
  if (frozen) {
    return {
      lines: linesFromFrozen(frozen),
      presentation: frozen.presentation ?? null,
      totalMinor: BigInt(frozen.totals.totalMinor),
      vatMinor: BigInt(frozen.totals.vatMinor),
      vatEnabled: frozen.vatEnabled,
      costMinor: BigInt(frozen.totals.costMinor),
      markupMinor: BigInt(frozen.totals.markupMinor),
      taxesMinor: BigInt(frozen.totals.taxesMinor),
      frozen,
    };
  }
  const editorOption = toEditorOption(option);
  const computed = computeDbOption(option, quotation, settings);
  return {
    lines: linesFromComputed(computed),
    presentation: presentationFor(
      computed,
      editorOption,
      presentationContextFor(quotation, settings),
    ),
    totalMinor: computed.totalMinor,
    vatMinor: computed.result.vatMinor,
    vatEnabled: quotation.vatOverride === null ? settings.vatEnabled : quotation.vatOverride,
    costMinor: computed.result.costTotalMinor,
    markupMinor: computed.result.markupMinor,
    taxesMinor: computed.result.taxesMinor,
    frozen: null,
  };
}

/** As optionTotals, but reports an unpriceable draft as a print error. */
function optionTotalsForPrint(
  quotation: QuotationWithRelations,
  option: QuotationOptionWithRelations,
  settings: AppSettings,
): ReturnType<typeof optionTotals> {
  try {
    return optionTotals(quotation, option, settings);
  } catch (error) {
    if (error?.constructor?.name === "PricingError") {
      throw new DocumentError(
        `${option.label} has no fare or service lines yet, so it has no price to print. Add at least one cost line first.`,
      );
    }
    throw error;
  }
}

/** Build the full quotation snapshot used for printing and for freezing. */
export async function buildQuotationSnapshot(
  quotation: QuotationWithRelations,
  settings: AppSettings,
): Promise<QuotationSnapshot> {
  const options = [];
  for (const option of quotation.options) {
    const totals = optionTotalsForPrint(quotation, option, settings);
    const flights = await flightsForSegments(option.segments);
    options.push({
      label: option.label,
      optionType: option.optionType,
      pnr: option.pnr ?? undefined,
      ticketingDeadline: option.ticketingDeadline?.toISOString(),
      flights,
      lines: totals.lines,
      presentation: totals.presentation ?? undefined,
      totalMinor: totals.totalMinor.toString(),
      vatEnabled: totals.vatEnabled,
      vatMinor: totals.vatMinor.toString(),
      costMinor: totals.costMinor.toString(),
      markupMinor: totals.markupMinor.toString(),
      taxesMinor: totals.taxesMinor.toString(),
    });
  }

  return {
    kind: "quotation",
    number: quotation.number,
    revision: quotation.revision,
    referenceNo: quotation.referenceNo ?? undefined,
    branch: quotation.branch,
    issueDate: toDateInput(quotation.issueDate),
    validUntil: toDateInput(quotation.validUntil),
    currency: quotation.currency,
    template: settings.quotationTemplate,
    company: companySnapshot(settings),
    contact: contactSnapshot(quotation.contact),
    passengers: uniquePassengers(quotation),
    flights: options.flatMap((option) => option.flights),
    options,
    totalMinor: options
      .reduce((sum, option) => sum + BigInt(option.totalMinor), 0n)
      .toString(),
    heading: quotation.heading?.trim() || "QUOTATION",
    notes: quotation.notes || settings.quotationNotes,
    validityStatement: settings.quotationValidityStatement || undefined,
    // Quotations never print payment details. The pro forma carries the bank
    // snapshot instead; the field remains for snapshot compatibility.
    bank: null,
    createdAt: new Date().toISOString(),
  };
}

export async function buildItinerarySnapshot(
  quotation: QuotationWithRelations,
  options: QuotationOptionWithRelations[],
  settings: AppSettings,
  number: string,
): Promise<ItinerarySnapshot> {
  const journeys = [];
  for (const option of options) {
    journeys.push({
      label: option.label,
      pnr: option.pnr ?? undefined,
      flights: await flightsForSegments(option.segments),
      lines: [],
      totalMinor: "0",
      vatMinor: "0",
    });
  }
  const first = options[0];
  return {
    kind: "itinerary",
    number,
    referenceNo: quotation.referenceNo ?? undefined,
    branch: quotation.branch,
    issueDate: toDateInput(new Date()),
    template: settings.itineraryTemplate,
    quotationNumber: quotation.number,
    company: companySnapshot(settings),
    contact: contactSnapshot(quotation.contact),
    passengers: uniquePassengers(quotation),
    optionLabel: options.length === 1 ? first?.label ?? "Journey" : "Journeys",
    showOptionLabel: true,
    pnr: options.length === 1 ? first?.pnr ?? undefined : undefined,
    flights: journeys.flatMap((journey) => journey.flights),
    journeys,
    notes: settings.itineraryNotes,
  };
}

/**
 * Freeze a standalone itinerary. It deliberately has no quotation number,
 * option or prices; the snapshot is the whole document from this point on.
 */
export function buildStandaloneItinerarySnapshot(input: {
  number: string;
  issueDate: Date;
  branch: string;
  referenceNo?: string;
  pnr?: string;
  notes: string;
  contact: Contact;
  passengers: DocumentPassenger[];
  flights: DocumentFlight[];
  settings: AppSettings;
}): ItinerarySnapshot {
  return {
    kind: "itinerary",
    number: input.number,
    referenceNo: input.referenceNo || undefined,
    branch: input.branch,
    issueDate: toDateInput(input.issueDate),
    template: input.settings.itineraryTemplate,
    standalone: true,
    company: companySnapshot(input.settings),
    contact: contactSnapshot(input.contact),
    passengers: input.passengers,
    optionLabel: "Itinerary",
    showOptionLabel: false,
    pnr: input.pnr || undefined,
    flights: input.flights,
    notes: input.notes || input.settings.itineraryNotes,
  };
}

export async function buildProformaSnapshot(
  quotation: QuotationWithRelations,
  options: QuotationOptionWithRelations[],
  settings: AppSettings,
  input: {
    number: string;
    issueDate: Date;
    dueDate?: Date;
    terms: string;
    showVat: boolean;
    bankAccountId?: string | null;
  },
): Promise<ProformaSnapshot> {
  const journeys = [];
  const allLines: DocumentLine[] = [];
  let totalMinor = 0n;
  let vatMinor = 0n;
  let vatRateBps = settings.vatRateBps.toString();
  for (const [index, option] of options.entries()) {
    const totals = optionTotalsForPrint(quotation, option, settings);
    if (index === 0 && totals.frozen?.vatRateBps) {
      vatRateBps = totals.frozen.vatRateBps;
    }
    const flights = settings.proformaShowFlights
      ? await flightsForSegments(option.segments)
      : [];
    allLines.push(...totals.lines);
    totalMinor += totals.totalMinor;
    vatMinor += totals.vatMinor;
    journeys.push({
      label: option.label,
      pnr: option.pnr ?? undefined,
      flights,
      lines: totals.lines,
      // The legacy "show VAT" switch keeps its explicit row; otherwise the
      // quotation's frozen presentation (including tax layout) is reused.
      presentation: input.showVat ? undefined : totals.presentation ?? undefined,
      totalMinor: totals.totalMinor.toString(),
      vatMinor: totals.vatMinor.toString(),
    });
  }

  return {
    kind: "proforma",
    number: input.number,
    referenceNo: quotation.referenceNo ?? undefined,
    branch: quotation.branch,
    issueDate: toDateInput(input.issueDate),
    template: settings.proformaTemplate,
    dueDate: input.dueDate ? toDateInput(input.dueDate) : undefined,
    terms: input.terms || settings.paymentTerms,
    currency: quotation.currency,
    company: companySnapshot(settings),
    contact: contactSnapshot(quotation.contact),
    passengers: uniquePassengers(quotation),
    optionLabel: options.length === 1 ? options[0]?.label ?? "Journey" : "Journeys",
    showOptionLabel: options.length > 1,
    flights: journeys.flatMap((journey) => journey.flights),
    journeys,
    showFlights: settings.proformaShowFlights,
    showVat: input.showVat,
    vatMinor: vatMinor.toString(),
    vatRateBps,
    vatRegistrationNumber: settings.vatRegistrationNumber || undefined,
    lines: allLines,
    presentation:
      journeys.length === 1 ? journeys[0]?.presentation : undefined,
    totalMinor: totalMinor.toString(),
    bank: await bankSnapshot(
      input.bankAccountId ?? quotation.bankAccountId,
      quotation.currency,
    ),
    quotationNumber: quotation.number,
  };
}

export function flightSummary(flights: DocumentFlight[]): string {
  if (flights.length === 0) return "";
  const first = flights[0];
  const last = flights[flights.length - 1];
  return `${first.fromCity} → ${last.toCity}`;
}

export function flightDateRange(flights: DocumentFlight[]): string {
  if (flights.length === 0) return "";
  const start = DateTime.fromISO(flights[0].departLocal, { zone: "utc" });
  const end = DateTime.fromISO(flights[flights.length - 1].arriveLocal, { zone: "utc" });
  if (!start.isValid || !end.isValid) return "";
  if (start.hasSame(end, "day")) return start.toFormat("dd LLL yyyy");
  return `${start.toFormat("dd LLL")} – ${end.toFormat("dd LLL yyyy")}`;
}

export function formatFlightDuration(minutes: number): string {
  return formatDuration(minutes);
}

export function formatAmount(minor: string | bigint, currency: string): string {
  return formatMoney(typeof minor === "string" ? BigInt(minor) : minor, currency);
}

/** Rebuild a snapshot when an old record is missing one (defensive). */
export function safeSnapshot<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export { jsonSafe };
