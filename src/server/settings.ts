import { cache } from "react";

import { normaliseTimeZone, setAppTimeZone } from "@/lib/dates";
import {
  isDocumentHeaderMode,
  isDocumentTemplate,
  type DocumentHeaderMode,
  type DocumentTemplate,
} from "@/lib/documents";
import {
  isPriceDisplayMode,
  isTaxDisplayMode,
  type PriceDisplayMode,
  type TaxDisplayMode,
} from "@/lib/pricing/presentation";
import { prisma } from "@/server/db";

/**
 * Typed access to the key/value Setting table. Defaults are used until an
 * admin saves a setting, so a fresh database is usable immediately.
 *
 * Deployment identity belongs here, not in code: a new installation starts
 * with neutral placeholders and the first admin completes the profile under
 * Settings → Company. Environment variables may seed the initial values, but
 * the database is the source of truth afterwards.
 */

const seed = (key: string): string => process.env[key]?.trim() ?? "";

export interface AppSettings {
  companyName: string;
  companyAddress: string;
  companyEmail: string;
  companyPhone: string;
  companyWebsite: string;
  companyTin: string;
  companyHeaderImage: string;
  companyLetterheadImage: string;
  /** Whether documents print the letterhead image or the typed company details. */
  companyHeaderMode: DocumentHeaderMode;
  companyFooterText: string;
  companyNotes: string;
  timeZone: string;
  baseCurrency: string;
  roundingUnit: bigint;
  defaultMarginBps: bigint;
  defaultValidityDays: number;
  rateMaxAgeDays: number;
  vatEnabled: boolean;
  vatRateBps: bigint;
  vatRegistrationNumber: string;
  /** Customer-facing label for VAT/GST/sales tax. */
  vatLabel: string;
  /** Default customer price layout for new quotations. */
  pricingDisplay: PriceDisplayMode;
  /** Default way taxes appear on new quotations. */
  taxDisplay: TaxDisplayMode;
  serviceFeeLabel: string;
  taxLabel: string;
  totalLabel: string;
  perPersonLabel: string;
  /** Optional sentence printed when taxes are included or itemised. */
  taxNote: string;
  numberingQuotation: string;
  numberingItinerary: string;
  numberingProforma: string;
  paymentTerms: string;
  quotationNotes: string;
  /** Frozen customer-facing statement printed under the quotation. */
  quotationValidityStatement: string;
  itineraryNotes: string;
  proformaNotes: string;
  proformaShowFlights: boolean;
  ticketingWarningHours: number;
  quotationTemplate: DocumentTemplate;
  itineraryTemplate: DocumentTemplate;
  proformaTemplate: DocumentTemplate;
  /** Roles that should enrol in TOTP; empty = optional for everyone. */
  requireTwoFactorRoles: string[];
  aiEnabled: boolean;
  aiBaseUrl: string;
  aiModel: string;
  /** AES-256-GCM ciphertext from src/lib/setting-secrets.ts; never plaintext. */
  aiApiKeyCipher: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  companyName: seed("SEED_COMPANY_NAME") || "Your Travel Agency",
  companyAddress: seed("SEED_COMPANY_ADDRESS"),
  companyEmail: seed("SEED_COMPANY_EMAIL") || "hello@example.com",
  companyPhone: seed("SEED_COMPANY_PHONE"),
  companyWebsite: seed("SEED_COMPANY_WEBSITE"),
  companyTin: seed("SEED_COMPANY_TIN"),
  companyHeaderImage: "",
  companyLetterheadImage: "",
  // Existing installations with a letterhead keep the current look; a fresh
  // installation falls back to details automatically when no image is set.
  companyHeaderMode: "letterhead",
  companyFooterText:
    seed("SEED_COMPANY_FOOTER") || "Travel quotations, itineraries and pro forma invoices.",
  companyNotes:
    "Prices are subject to availability at the time of booking. Please check all names against passports.",
  timeZone: normaliseTimeZone(seed("APP_TIMEZONE")) ?? "UTC",
  baseCurrency: (seed("BASE_CURRENCY") || "USD").toUpperCase(),
  roundingUnit: 1n,
  defaultMarginBps: 1_000n,
  defaultValidityDays: 1,
  rateMaxAgeDays: 7,
  vatEnabled: seed("VAT_ENABLED").toLowerCase() === "true",
  vatRateBps: 0n,
  vatRegistrationNumber: "",
  vatLabel: "VAT",
  pricingDisplay: "lump_sum",
  taxDisplay: "included",
  serviceFeeLabel: "Service fee",
  taxLabel: "Taxes",
  totalLabel: "Total",
  perPersonLabel: "Price per person",
  taxNote: "",
  numberingQuotation: "QT-{BRANCH}-{SEQ:4}",
  numberingItinerary: "IT-{YYYY}-{SEQ:4}",
  numberingProforma: "PF-{YYYY}-{SEQ:4}",
  paymentTerms: "A deposit is required on confirmation; the balance is due before ticketing.",
  quotationNotes:
    "Prices are per person unless stated otherwise and are subject to availability. Valid until the date shown. Ticketing deadlines are set by the airline.",
  quotationValidityStatement:
    "This quotation is valid for 24 hours from the date and time of issuance. All fares and seat availability are subject to change without prior notice until the ticket is issued. Final pricing will be confirmed at the time of booking and ticket issuance.",
  itineraryNotes:
    "Please check your travel documents and arrive at the airport at least two hours before departure.",
  proformaNotes:
    "Please quote the pro forma number as the payment reference. Ticketing is subject to payment by the due date.",
  proformaShowFlights: true,
  ticketingWarningHours: 48,
  quotationTemplate: "classic",
  itineraryTemplate: "classic",
  proformaTemplate: "classic",
  requireTwoFactorRoles: [],
  aiEnabled: false,
  aiBaseUrl: "https://api.openai.com/v1",
  aiModel: "gpt-4o-mini",
  aiApiKeyCipher: "",
};

const KEYS: Record<keyof AppSettings, string> = {
  companyName: "company.name",
  companyAddress: "company.address",
  companyEmail: "company.email",
  companyPhone: "company.phone",
  companyWebsite: "company.website",
  companyTin: "company.tin",
  companyHeaderImage: "company.headerImage",
  companyLetterheadImage: "company.letterheadImage",
  companyHeaderMode: "company.headerMode",
  companyFooterText: "company.footerText",
  companyNotes: "company.notes",
  timeZone: "company.timeZone",
  baseCurrency: "currency.base",
  roundingUnit: "pricing.roundingUnit",
  defaultMarginBps: "pricing.defaultMarginBps",
  defaultValidityDays: "pricing.defaultValidityDays",
  rateMaxAgeDays: "pricing.rateMaxAgeDays",
  vatEnabled: "vat.enabled",
  vatRateBps: "vat.rateBps",
  vatRegistrationNumber: "vat.registrationNumber",
  vatLabel: "vat.label",
  pricingDisplay: "pricing.display",
  taxDisplay: "pricing.taxDisplay",
  serviceFeeLabel: "documents.serviceFeeLabel",
  taxLabel: "documents.taxLabel",
  totalLabel: "documents.totalLabel",
  perPersonLabel: "documents.perPersonLabel",
  taxNote: "documents.taxNote",
  numberingQuotation: "numbering.quotation",
  numberingItinerary: "numbering.itinerary",
  numberingProforma: "numbering.proforma",
  paymentTerms: "documents.paymentTerms",
  quotationNotes: "documents.quotationNotes",
  quotationValidityStatement: "documents.quotationValidityStatement",
  itineraryNotes: "documents.itineraryNotes",
  proformaNotes: "documents.proformaNotes",
  proformaShowFlights: "documents.proformaShowFlights",
  ticketingWarningHours: "flights.ticketingWarningHours",
  quotationTemplate: "documents.quotationTemplate",
  itineraryTemplate: "documents.itineraryTemplate",
  proformaTemplate: "documents.proformaTemplate",
  requireTwoFactorRoles: "security.requireTwoFactorRoles",
  aiEnabled: "ai.enabled",
  aiBaseUrl: "ai.baseUrl",
  aiModel: "ai.model",
  aiApiKeyCipher: "ai.apiKeyCipher",
};

function decode<K extends keyof AppSettings>(key: K, raw: string): AppSettings[K] {
  const fallback = DEFAULT_SETTINGS[key];
  if (key === "requireTwoFactorRoles") {
    try {
      const parsed: unknown = JSON.parse(raw);
      return (Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : []) as unknown as AppSettings[K];
    } catch {
      return [] as unknown as AppSettings[K];
    }
  }
  if (key === "pricingDisplay") {
    return (isPriceDisplayMode(raw) ? raw : fallback) as AppSettings[K];
  }
  if (key === "taxDisplay") {
    return (isTaxDisplayMode(raw) ? raw : fallback) as AppSettings[K];
  }
  if (key === "quotationTemplate" || key === "itineraryTemplate" || key === "proformaTemplate") {
    return (isDocumentTemplate(raw) ? raw : fallback) as AppSettings[K];
  }
  if (key === "companyHeaderMode") {
    return (isDocumentHeaderMode(raw) ? raw : fallback) as AppSettings[K];
  }
  if (typeof fallback === "boolean") return (raw === "true") as AppSettings[K];
  if (typeof fallback === "number") {
    const parsed = Number(raw);
    return (Number.isFinite(parsed) ? parsed : fallback) as AppSettings[K];
  }
  if (typeof fallback === "bigint") {
    try {
      return BigInt(raw) as AppSettings[K];
    } catch {
      return fallback;
    }
  }
  return raw as AppSettings[K];
}

export const getSettings = cache(async (): Promise<AppSettings> => {
  const rows = await prisma.setting.findMany();
  const values = { ...DEFAULT_SETTINGS };
  for (const row of rows) {
    const entry = (Object.keys(KEYS) as (keyof AppSettings)[]).find(
      (key) => KEYS[key] === row.key,
    );
    if (entry) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (values as any)[entry] = decode(entry, row.value);
    }
  }
  values.timeZone = normaliseTimeZone(values.timeZone) ?? "UTC";
  setAppTimeZone(values.timeZone);
  return values;
});

export function settingKey<K extends keyof AppSettings>(key: K): string {
  return KEYS[key];
}

export async function getSettingValue(key: string): Promise<string | null> {
  const row = await prisma.setting.findUnique({ where: { key } });
  return row?.value ?? null;
}

/** Encode a typed setting for storage. Booleans are "true"/"false". */
export function encodeSetting(value: string | number | bigint | boolean | string[]): string {
  return Array.isArray(value) ? JSON.stringify(value) : value.toString();
}

export async function saveSettings(
  tx: {
    setting: {
      upsert: (args: {
        where: { key: string };
        create: { key: string; value: string };
        update: { value: string };
      }) => Promise<unknown>;
    };
  },
  values: Partial<AppSettings>,
): Promise<void> {
  for (const [key, value] of Object.entries(values) as [keyof AppSettings, AppSettings[keyof AppSettings]][]) {
    if (value === undefined) continue;
    const encoded = encodeSetting(value as string | number | bigint | boolean | string[]);
    await tx.setting.upsert({
      where: { key: KEYS[key] },
      create: { key: KEYS[key], value: encoded },
      update: { value: encoded },
    });
  }
}
