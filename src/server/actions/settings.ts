"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { documentDateFromInput, isValidTimeZone } from "@/lib/dates";
import { DOCUMENT_HEADER_MODES, DOCUMENT_TEMPLATE_IDS } from "@/lib/documents";
import { parseMoneyToMinor, parsePercentToBps, parseRateToMicro } from "@/lib/money";
import { PRICE_DISPLAY_MODES, TAX_DISPLAY_MODES } from "@/lib/pricing/presentation";
import { capabilitiesFor, CAPABILITIES, parseCapabilities } from "@/lib/permissions";
import {
  aiSettingsSchema,
  bankAccountSchema,
  branchSchema,
  createUserSchema,
  profileSchema,
  resetPasswordSchema,
  roleSchema,
  userRoleSchema,
} from "@/lib/schemas";
import { encryptSettingSecret } from "@/lib/setting-secrets";
import { audit } from "@/server/audit";
import { createUserWithPassword, requireUser, resetPasswordForUser } from "@/server/auth";
import { actionUser } from "@/server/guard";
import { prisma } from "@/server/db";
import { getSettings, saveSettings, type AppSettings } from "@/server/settings";

function fail(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

function done(path: string): never {
  revalidatePath(path);
  revalidatePath("/", "layout");
  redirect(`${path}?saved=1`);
}

const companySchema = z.object({
  companyName: z.string().trim().min(2).max(160),
  companyAddress: z.string().trim().max(500),
  companyEmail: z.string().trim().max(200),
  companyPhone: z.string().trim().max(60),
  companyWebsite: z.string().trim().max(200),
  companyTin: z.string().trim().max(60),
  companyHeaderMode: z.enum(DOCUMENT_HEADER_MODES),
  companyFooterText: z.string().trim().max(300),
  companyNotes: z.string().trim().max(2000),
  timeZone: z
    .string()
    .trim()
    .min(1, "Choose a time zone")
    .max(64)
    .refine(isValidTimeZone, "Enter a valid IANA time zone, e.g. Europe/London"),
});

export async function updateCompanyAction(formData: FormData): Promise<void> {
  const path = "/settings/company";
  const user = await actionUser("manageSettings");
  const parsed = companySchema.safeParse({
    companyName: formData.get("companyName"),
    companyAddress: formData.get("companyAddress"),
    companyEmail: formData.get("companyEmail"),
    companyPhone: formData.get("companyPhone"),
    companyWebsite: formData.get("companyWebsite"),
    companyTin: formData.get("companyTin"),
    companyHeaderMode: formData.get("companyHeaderMode"),
    companyFooterText: formData.get("companyFooterText"),
    companyNotes: formData.get("companyNotes"),
    timeZone: formData.get("timeZone"),
  });
  if (!parsed.success) fail(path, parsed.error.issues[0]?.message ?? "Check the form");
  const before = await getSettings();
  const values: Partial<AppSettings> = {
    companyName: parsed.data.companyName,
    companyAddress: parsed.data.companyAddress,
    companyEmail: parsed.data.companyEmail,
    companyPhone: parsed.data.companyPhone,
    companyWebsite: parsed.data.companyWebsite,
    companyTin: parsed.data.companyTin,
    companyHeaderMode: parsed.data.companyHeaderMode,
    companyFooterText: parsed.data.companyFooterText,
    companyNotes: parsed.data.companyNotes,
    timeZone: parsed.data.timeZone,
  };
  // Log only the fields this form changes. Spreading the full settings object
  // would put the encrypted AI key ciphertext into the audit log.
  const beforeValues = Object.fromEntries(
    Object.keys(values).map((key) => [key, before[key as keyof AppSettings]]),
  );
  await prisma.$transaction(async (tx) => {
    await saveSettings(tx, values);
    await audit(tx, {
      userId: user.id,
      action: "updateCompany",
      entity: "Setting",
      entityId: "company",
      before: beforeValues,
      after: values,
    });
  });
  done(path);
}

export async function updateAiAction(formData: FormData): Promise<void> {
  const path = "/settings/ai";
  const user = await actionUser("manageSettings");
  const parsed = aiSettingsSchema.safeParse({
    aiEnabled: formData.get("aiEnabled") === "on",
    aiBaseUrl: formData.get("aiBaseUrl"),
    aiModel: formData.get("aiModel"),
    aiApiKey: formData.get("aiApiKey") || undefined,
    clearAiKey: formData.get("clearAiKey") === "on",
  });
  if (!parsed.success) fail(path, parsed.error.issues[0]?.message ?? "Check the AI settings");

  const current = await getSettings();
  let cipher = current.aiApiKeyCipher;
  if (parsed.data.clearAiKey) {
    cipher = "";
  } else if (parsed.data.aiApiKey) {
    try {
      cipher = encryptSettingSecret(parsed.data.aiApiKey);
    } catch (error) {
      fail(path, error instanceof Error ? error.message : "Could not encrypt the API key");
    }
  }

  await prisma.$transaction(async (tx) => {
    await saveSettings(tx, {
      aiEnabled: parsed.data.aiEnabled,
      aiBaseUrl: parsed.data.aiBaseUrl.replace(/\/+$/, ""),
      aiModel: parsed.data.aiModel,
      aiApiKeyCipher: cipher,
    });
    await audit(tx, {
      userId: user.id,
      action: "updateAiSettings",
      entity: "Setting",
      entityId: "ai",
      after: {
        enabled: parsed.data.aiEnabled,
        baseUrl: parsed.data.aiBaseUrl,
        model: parsed.data.aiModel,
        apiKeyConfigured: Boolean(cipher),
      },
    });
  });
  done(path);
}

export async function updateBankAction(formData: FormData): Promise<void> {
  const path = "/settings/banks";
  const user = await actionUser("manageSettings");
  const parsed = bankAccountSchema.safeParse({
    id: formData.get("id") || undefined,
    label: formData.get("label"),
    bankName: formData.get("bankName"),
    branchName: formData.get("branchName") ?? "",
    accountName: formData.get("accountName"),
    accountNumber: formData.get("accountNumber"),
    swiftCode: formData.get("swiftCode") ?? "",
    sortCode: formData.get("sortCode") ?? "",
    currency: formData.get("currency"),
    paymentInstructions: formData.get("paymentInstructions") ?? "",
    isDefault: formData.get("isDefault") === "on",
    isArchived: formData.get("isArchived") === "on",
    sortOrder: formData.get("sortOrder") ?? 0,
  });
  if (!parsed.success) fail(path, parsed.error.issues[0]?.message ?? "Check the form");
  const data = parsed.data;
  if (data.isDefault && data.isArchived) fail(path, "A default account cannot be archived");
  if (data.id && data.isDefault === false) {
    const liveDefault = await prisma.bankAccount.findFirst({
      where: { isDefault: true, isArchived: false, id: { not: data.id } },
    });
    const current = await prisma.bankAccount.findUnique({ where: { id: data.id } });
    if (current?.isDefault && !liveDefault) fail(path, "Choose another default before clearing this one");
  }

  const before = data.id
    ? await prisma.bankAccount.findUnique({ where: { id: data.id } })
    : await prisma.bankAccount.findFirst({ where: { label: data.label, currency: data.currency } });
  if (data.id && !before) fail(path, "Bank account not found");

  const activeCount = await prisma.bankAccount.count({
    where: { isArchived: false, ...(before ? { id: { not: before.id } } : {}) },
  });
  const isDefault = data.isArchived ? false : data.isDefault || activeCount === 0;

  await prisma.$transaction(async (tx) => {
    if (isDefault) {
      await tx.bankAccount.updateMany({
        where: { isDefault: true, ...(before ? { id: { not: before.id } } : {}) },
        data: { isDefault: false },
      });
    }
    const payload = {
      label: data.label,
      bankName: data.bankName,
      branchName: data.branchName,
      accountName: data.accountName,
      accountNumber: data.accountNumber,
      swiftCode: data.swiftCode,
      sortCode: data.sortCode,
      currency: data.currency,
      paymentInstructions: data.paymentInstructions,
      isDefault,
      isArchived: data.isArchived,
      sortOrder: data.sortOrder,
    };
    const after = before
      ? await tx.bankAccount.update({ where: { id: before.id }, data: payload })
      : await tx.bankAccount.create({ data: payload });

    // Archiving the previous default leaves exactly one default whenever an
    // active account remains.
    if (!isDefault) {
      const defaults = await tx.bankAccount.count({ where: { isDefault: true, isArchived: false } });
      if (defaults === 0) {
        const replacement = await tx.bankAccount.findFirst({
          where: { isArchived: false },
          orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
        });
        if (replacement) {
          await tx.bankAccount.update({ where: { id: replacement.id }, data: { isDefault: true } });
        }
      }
    }

    await audit(tx, {
      userId: user.id,
      action: before ? "updateBank" : "createBank",
      entity: "BankAccount",
      entityId: after.id,
      before,
      after,
    });
  });
  done(path);
}

const rateSchema = z.object({
  fromCcy: z.string().trim().length(3).transform((v) => v.toUpperCase()),
  toCcy: z.string().trim().length(3).transform((v) => v.toUpperCase()),
  rate: z.string().trim().min(1).max(24, "Rate is too large"),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function saveExchangeRateAction(formData: FormData): Promise<void> {
  const path = "/settings/currencies";
  const user = await actionUser("manageSettings");
  const parsed = rateSchema.safeParse({
    fromCcy: formData.get("fromCcy"),
    toCcy: formData.get("toCcy"),
    rate: formData.get("rate"),
    effectiveFrom: formData.get("effectiveFrom"),
  });
  if (!parsed.success) fail(path, parsed.error.issues[0]?.message ?? "Check the form");
  if (parsed.data.fromCcy === parsed.data.toCcy) fail(path, "Choose two different currencies");

  let rateMicro: bigint;
  try {
    rateMicro = parseRateToMicro(parsed.data.rate);
  } catch (error) {
    fail(path, error instanceof Error ? error.message : "Invalid rate");
  }
  if (rateMicro <= 0n) fail(path, "Rate must be positive");

  await prisma.$transaction(async (tx) => {
    const rate = await tx.exchangeRate.create({
      data: {
        fromCcy: parsed.data.fromCcy,
        toCcy: parsed.data.toCcy,
        rateMicro,
        effectiveFrom: documentDateFromInput(parsed.data.effectiveFrom),
        createdById: user.id,
      },
    });
    await audit(tx, {
      userId: user.id,
      action: "saveExchangeRate",
      entity: "ExchangeRate",
      entityId: rate.id,
      after: {
        fromCcy: rate.fromCcy,
        toCcy: rate.toCcy,
        rateMicro: rate.rateMicro,
        effectiveFrom: rate.effectiveFrom,
      },
    });
  });
  done(path);
}

const taxSchema = z.object({
  vatEnabled: z.boolean(),
  vatRate: z.string().trim().min(1).max(16, "VAT rate is too large"),
  vatRegistrationNumber: z.string().trim().max(80),
  roundingUnit: z.coerce.number().int().min(1).max(100_000),
});

export async function updateTaxAction(formData: FormData): Promise<void> {
  const path = "/settings/tax";
  const user = await actionUser("manageSettings");
  const parsed = taxSchema.safeParse({
    vatEnabled: formData.get("vatEnabled") === "on",
    vatRate: formData.get("vatRate"),
    vatRegistrationNumber: formData.get("vatRegistrationNumber") ?? "",
    roundingUnit: formData.get("roundingUnit"),
  });
  if (!parsed.success) fail(path, parsed.error.issues[0]?.message ?? "Check the form");

  let vatRateBps: bigint;
  try {
    vatRateBps = parsePercentToBps(parsed.data.vatRate);
  } catch (error) {
    fail(path, error instanceof Error ? error.message : "Invalid VAT rate");
  }
  if (vatRateBps < 0n) fail(path, "VAT rate cannot be negative");

  const before = await getSettings();
  const values: Partial<AppSettings> = {
    vatEnabled: parsed.data.vatEnabled,
    vatRateBps,
    vatRegistrationNumber: parsed.data.vatRegistrationNumber,
    roundingUnit: BigInt(parsed.data.roundingUnit),
  };
  await prisma.$transaction(async (tx) => {
    await saveSettings(tx, values);
    await audit(tx, {
      userId: user.id,
      action: "updateTax",
      entity: "Setting",
      entityId: "vat",
      before: { vatEnabled: before.vatEnabled, vatRateBps: before.vatRateBps, roundingUnit: before.roundingUnit },
      after: { vatEnabled: values.vatEnabled, vatRateBps, roundingUnit: values.roundingUnit },
    });
  });
  done(path);
}

const numberingSchema = z.object({
  numberingQuotation: z.string().trim().min(3).max(60).regex(/^[A-Za-z0-9 {}:_-]+$/, "Use letters, digits, spaces, - _ : { }"),
  numberingItinerary: z.string().trim().min(3).max(60).regex(/^[A-Za-z0-9 {}:_-]+$/, "Use letters, digits, spaces, - _ : { }"),
  numberingProforma: z.string().trim().min(3).max(60).regex(/^[A-Za-z0-9 {}:_-]+$/, "Use letters, digits, spaces, - _ : { }"),
});

export async function updateNumberingAction(formData: FormData): Promise<void> {
  const path = "/settings/numbering";
  const user = await actionUser("manageSettings");
  const before = await getSettings();
  const readField = (name: string, fallback: string): string => {
    const value = formData.get(name);
    return typeof value === "string" && value.trim() !== "" ? value : fallback;
  };
  const parsed = numberingSchema.safeParse({
    numberingQuotation: readField("numberingQuotation", before.numberingQuotation),
    numberingItinerary: readField("numberingItinerary", before.numberingItinerary),
    numberingProforma: readField("numberingProforma", before.numberingProforma),
  });
  if (!parsed.success) fail(path, parsed.error.issues[0]?.message ?? "Check the form");
  for (const template of Object.values(parsed.data)) {
    if (!template.includes("{SEQ")) fail(path, "Every format needs a {SEQ} placeholder");
  }
  await prisma.$transaction(async (tx) => {
    await saveSettings(tx, parsed.data);
    await audit(tx, {
      userId: user.id,
      action: "updateNumbering",
      entity: "Setting",
      entityId: "numbering",
      before: {
        quotation: before.numberingQuotation,
        itinerary: before.numberingItinerary,
        proforma: before.numberingProforma,
      },
      after: parsed.data,
    });
  });
  done(path);
}

const defaultsSchema = z.object({
  defaultMargin: z.string().trim().min(1).max(16, "Margin is too large"),
  defaultValidityDays: z.coerce.number().int().min(1).max(365),
  rateMaxAgeDays: z.coerce.number().int().min(0).max(365),
  ticketingWarningHours: z.coerce.number().int().min(1).max(720),
  proformaShowFlights: z.boolean(),
  paymentTerms: z.string().trim().max(1000),
  quotationNotes: z.string().trim().max(4000),
  quotationValidityStatement: z.string().trim().max(2000),
  baseCurrency: z.string().trim().length(3).transform((v) => v.toUpperCase()),
});

export async function updateDefaultsAction(formData: FormData): Promise<void> {
  const path = "/settings/company";
  const user = await actionUser("manageSettings");
  const parsed = defaultsSchema.safeParse({
    defaultMargin: formData.get("defaultMargin"),
    defaultValidityDays: formData.get("defaultValidityDays"),
    rateMaxAgeDays: formData.get("rateMaxAgeDays"),
    ticketingWarningHours: formData.get("ticketingWarningHours"),
    proformaShowFlights: formData.get("proformaShowFlights") === "on",
    paymentTerms: formData.get("paymentTerms") ?? "",
    quotationNotes: formData.get("quotationNotes") ?? "",
    quotationValidityStatement: formData.get("quotationValidityStatement") ?? "",
    baseCurrency: formData.get("baseCurrency"),
  });
  if (!parsed.success) fail(path, parsed.error.issues[0]?.message ?? "Check the form");
  let defaultMarginBps: bigint;
  try {
    defaultMarginBps = parsePercentToBps(parsed.data.defaultMargin);
  } catch (error) {
    fail(path, error instanceof Error ? error.message : "Invalid margin");
  }
  if (defaultMarginBps < 0n) fail(path, "Default margin cannot be negative");

  const values: Partial<AppSettings> = {
    defaultMarginBps,
    defaultValidityDays: parsed.data.defaultValidityDays,
    rateMaxAgeDays: parsed.data.rateMaxAgeDays,
    ticketingWarningHours: parsed.data.ticketingWarningHours,
    proformaShowFlights: parsed.data.proformaShowFlights,
    paymentTerms: parsed.data.paymentTerms,
    quotationNotes: parsed.data.quotationNotes,
    quotationValidityStatement: parsed.data.quotationValidityStatement,
    baseCurrency: parsed.data.baseCurrency,
  };
  const before = await getSettings();
  await prisma.$transaction(async (tx) => {
    await saveSettings(tx, values);
    await audit(tx, {
      userId: user.id,
      action: "updateDefaults",
      entity: "Setting",
      entityId: "defaults",
      before: {
        defaultMarginBps: before.defaultMarginBps,
        defaultValidityDays: before.defaultValidityDays,
        rateMaxAgeDays: before.rateMaxAgeDays,
        ticketingWarningHours: before.ticketingWarningHours,
        proformaShowFlights: before.proformaShowFlights,
        quotationValidityStatement: before.quotationValidityStatement,
      },
      after: values,
    });
  });
  done(path);
}

const pricingPresentationSchema = z.object({
  pricingDisplay: z.enum(PRICE_DISPLAY_MODES),
  taxDisplay: z.enum(TAX_DISPLAY_MODES),
  serviceFeeLabel: z.string().trim().min(1).max(60),
  taxLabel: z.string().trim().min(1).max(60),
  vatLabel: z.string().trim().min(1).max(60),
  totalLabel: z.string().trim().min(1).max(60),
  perPersonLabel: z.string().trim().min(1).max(60),
  taxNote: z.string().trim().max(500),
});

export async function updatePricingPresentationAction(formData: FormData): Promise<void> {
  const path = "/settings/pricing";
  const user = await actionUser("manageSettings");
  const parsed = pricingPresentationSchema.safeParse({
    pricingDisplay: formData.get("pricingDisplay"),
    taxDisplay: formData.get("taxDisplay"),
    serviceFeeLabel: formData.get("serviceFeeLabel") ?? "",
    taxLabel: formData.get("taxLabel") ?? "",
    vatLabel: formData.get("vatLabel") ?? "",
    totalLabel: formData.get("totalLabel") ?? "",
    perPersonLabel: formData.get("perPersonLabel") ?? "",
    taxNote: formData.get("taxNote") ?? "",
  });
  if (!parsed.success) fail(path, parsed.error.issues[0]?.message ?? "Check the form");

  const before = await getSettings();
  const values: Partial<AppSettings> = { ...parsed.data };
  await prisma.$transaction(async (tx) => {
    await saveSettings(tx, values);
    await audit(tx, {
      userId: user.id,
      action: "updatePricingPresentation",
      entity: "Setting",
      entityId: "pricingPresentation",
      before: {
        pricingDisplay: before.pricingDisplay,
        taxDisplay: before.taxDisplay,
        serviceFeeLabel: before.serviceFeeLabel,
        taxLabel: before.taxLabel,
        vatLabel: before.vatLabel,
        totalLabel: before.totalLabel,
        perPersonLabel: before.perPersonLabel,
        taxNote: before.taxNote,
      },
      after: values,
    });
  });
  done(path);
}

const templatesSchema = z.object({
  quotationTemplate: z.enum(DOCUMENT_TEMPLATE_IDS),
  itineraryTemplate: z.enum(DOCUMENT_TEMPLATE_IDS),
  proformaTemplate: z.enum(DOCUMENT_TEMPLATE_IDS),
});

export async function updateTemplatesAction(formData: FormData): Promise<void> {
  const path = "/settings/templates";
  const user = await actionUser("manageSettings");
  const parsed = templatesSchema.safeParse({
    quotationTemplate: formData.get("quotationTemplate"),
    itineraryTemplate: formData.get("itineraryTemplate"),
    proformaTemplate: formData.get("proformaTemplate"),
  });
  if (!parsed.success) fail(path, "Choose a valid template for each document");

  const before = await getSettings();
  const values: Partial<AppSettings> = parsed.data;
  await prisma.$transaction(async (tx) => {
    await saveSettings(tx, values);
    await audit(tx, {
      userId: user.id,
      action: "updateDocumentTemplates",
      entity: "Setting",
      entityId: "templates",
      before: {
        quotationTemplate: before.quotationTemplate,
        itineraryTemplate: before.itineraryTemplate,
        proformaTemplate: before.proformaTemplate,
      },
      after: values,
    });
  });
  done(path);
}

export async function createUserAction(formData: FormData): Promise<void> {
  const path = "/settings/users";
  const user = await actionUser("manageUsers");
  const parsed = createUserSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    role: formData.get("role"),
    branch: formData.get("branch") ?? "01",
    password: formData.get("password"),
  });
  if (!parsed.success) fail(path, parsed.error.issues[0]?.message ?? "Check the form");

  const [roleRow, branchRow] = await Promise.all([
    prisma.role.findUnique({ where: { key: parsed.data.role } }),
    prisma.branch.findUnique({ where: { code: parsed.data.branch } }),
  ]);
  if (!roleRow || !roleRow.active) fail(path, "Choose an active role");
  if (!branchRow || !branchRow.active) fail(path, "Choose an active branch");
  if (user.role !== "admin") {
    const granted = parseCapabilities(roleRow.capabilities);
    if (granted.some((capability) => !user.capabilities.includes(capability))) {
      fail(path, "You cannot grant a role with capabilities you do not hold");
    }
  }

  const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (existing) fail(path, "That email address is already in use");

  await prisma.$transaction(async (tx) => {
    const created = await createUserWithPassword({ ...parsed.data }, tx);
    await audit(tx, {
      userId: user.id,
      action: "createUser",
      entity: "User",
      entityId: created.id,
      after: {
        name: created.name,
        email: created.email,
        role: created.role,
        branch: created.branch,
      },
    });
  });
  done(path);
}

export async function updateUserAction(formData: FormData): Promise<void> {
  const path = "/settings/users";
  const user = await actionUser("manageUsers");
  const parsed = userRoleSchema.safeParse({
    userId: formData.get("userId"),
    role: formData.get("role"),
    branch: formData.get("branch") ?? "01",
    active: formData.get("active") === "on",
  });
  if (!parsed.success) fail(path, parsed.error.issues[0]?.message ?? "Check the form");

  const target = await prisma.user.findUnique({ where: { id: parsed.data.userId } });
  if (!target) fail(path, "User not found");
  const [roleRow, branchRow] = await Promise.all([
    prisma.role.findUnique({ where: { key: parsed.data.role } }),
    prisma.branch.findUnique({ where: { code: parsed.data.branch } }),
  ]);
  if (!roleRow || !roleRow.active) fail(path, "Choose an active role");
  if (!branchRow || !branchRow.active) fail(path, "Choose an active branch");
  if (user.role !== "admin") {
    if (target.role === "admin") fail(path, "Only an admin can modify an admin account");
    const targetRole = await prisma.role.findUnique({ where: { key: target.role } });
    const targetCapabilities = targetRole
      ? parseCapabilities(targetRole.capabilities)
      : capabilitiesFor(target.role);
    if (targetCapabilities.some((capability) => !user.capabilities.includes(capability))) {
      fail(path, "You cannot modify a user with capabilities you do not hold");
    }
    const granted = parseCapabilities(roleRow.capabilities);
    if (granted.some((capability) => !user.capabilities.includes(capability))) {
      fail(path, "You cannot grant a role with capabilities you do not hold");
    }
  }
  if (target.role === "admin" && (parsed.data.role !== "admin" || !parsed.data.active)) {
    const admins = await prisma.user.count({ where: { role: "admin", active: true } });
    if (admins <= 1) fail(path, "Keep at least one active admin");
  }
  if (target.id === user.id && !parsed.data.active) fail(path, "You cannot deactivate yourself");

  await prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id: target.id },
      data: {
        role: parsed.data.role,
        branch: parsed.data.branch,
        active: parsed.data.active,
      },
    });
    await audit(tx, {
      userId: user.id,
      action: "updateUser",
      entity: "User",
      entityId: updated.id,
      before: { role: target.role, branch: target.branch, active: target.active },
      after: { role: updated.role, branch: updated.branch, active: updated.active },
    });
  });
  done(path);
}

export async function resetUserPasswordAction(formData: FormData): Promise<void> {
  const path = "/settings/users";
  const user = await actionUser("manageUsers");
  const parsed = resetPasswordSchema.safeParse({
    userId: formData.get("userId"),
    password: formData.get("password"),
  });
  if (!parsed.success) fail(path, parsed.error.issues[0]?.message ?? "Check the form");

  const target = await prisma.user.findUnique({ where: { id: parsed.data.userId } });
  if (!target) fail(path, "User not found");
  if (user.role !== "admin") {
    if (target.role === "admin") fail(path, "Only an admin can reset an admin password");
    const targetRole = await prisma.role.findUnique({ where: { key: target.role } });
    const targetCapabilities = targetRole
      ? parseCapabilities(targetRole.capabilities)
      : capabilitiesFor(target.role);
    if (targetCapabilities.some((capability) => !user.capabilities.includes(capability))) {
      fail(path, "You cannot reset a user with capabilities you do not hold");
    }
  }
  await prisma.$transaction(async (tx) => {
    await resetPasswordForUser(target.id, parsed.data.password, tx);
    await audit(tx, {
      userId: user.id,
      action: "resetPassword",
      entity: "User",
      entityId: target.id,
      before: { password: "unchanged" },
      after: { password: "reset" },
    });
  });
  done(path);
}

export async function removeBankAction(formData: FormData): Promise<void> {
  const path = "/settings/banks";
  const user = await actionUser("manageSettings");
  const id = z.string().min(1).max(64).safeParse(formData.get("id"));
  if (!id.success) fail(path, "Invalid bank account");
  const before = await prisma.bankAccount.findUnique({
    where: { id: id.data },
    include: { _count: { select: { quotations: true, proformas: true } } },
  });
  if (!before) fail(path, "Bank account not found");

  // An account referenced by any issued document is archived, never deleted,
  // so the frozen snapshot and the live reference stay resolvable.
  const referenced = before._count.quotations > 0 || before._count.proformas > 0;
  await prisma.$transaction(async (tx) => {
    if (referenced) {
      await tx.bankAccount.update({
        where: { id: before.id },
        data: { isArchived: true, isDefault: false },
      });
    } else {
      await tx.bankAccount.delete({ where: { id: before.id } });
    }
    await audit(tx, {
      userId: user.id,
      action: referenced ? "archiveBank" : "removeBank",
      entity: "BankAccount",
      entityId: before.id,
      before,
      after: referenced ? { isArchived: true, isDefault: false } : null,
    });
    const activeDefaults = await tx.bankAccount.count({
      where: { isDefault: true, isArchived: false },
    });
    if (activeDefaults === 0) {
      const replacement = await tx.bankAccount.findFirst({
        where: { isArchived: false },
        orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
      });
      if (replacement) {
        await tx.bankAccount.update({ where: { id: replacement.id }, data: { isDefault: true } });
      }
    }
  });
  done(path);
}

const taxPresetSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2).max(80),
  kind: z.enum(["fixed", "percent"]),
  value: z.string().trim().min(1).max(24, "Value is too large"),
  enabled: z.boolean(),
  base: z.enum(["cost", "markup", "subtotal"]).default("cost"),
});

export async function saveTaxPresetAction(formData: FormData): Promise<void> {
  const path = "/settings/tax";
  const user = await actionUser("manageSettings");
  const parsed = taxPresetSchema.safeParse({
    id: formData.get("id") || undefined,
    name: formData.get("name"),
    kind: formData.get("kind"),
    value: formData.get("value"),
    enabled: formData.get("enabled") === "on",
    base: formData.get("base") ?? "cost",
  });
  if (!parsed.success) fail(path, parsed.error.issues[0]?.message ?? "Check the preset");
  const settings = await getSettings();

  let value: bigint;
  try {
    value =
      parsed.data.kind === "percent"
        ? parsePercentToBps(parsed.data.value)
        : parseMoneyToMinor(parsed.data.value, settings.baseCurrency);
  } catch (error) {
    fail(path, error instanceof Error ? error.message : "Invalid value");
  }
  if (value < 0n) fail(path, "A tax cannot be negative");

  await prisma.$transaction(async (tx) => {
    const preset = parsed.data.id
      ? await tx.taxPreset.update({
          where: { id: parsed.data.id },
          data: {
            name: parsed.data.name,
            kind: parsed.data.kind,
            value,
            enabled: parsed.data.enabled,
            base: parsed.data.base,
          },
        })
      : await tx.taxPreset.create({
          data: {
            name: parsed.data.name,
            kind: parsed.data.kind,
            value,
            enabled: parsed.data.enabled,
            base: parsed.data.base,
          },
        });
    await audit(tx, {
      userId: user.id,
      action: parsed.data.id ? "updateTaxPreset" : "createTaxPreset",
      entity: "TaxPreset",
      entityId: preset.id,
      after: { name: preset.name, kind: preset.kind, value: preset.value, enabled: preset.enabled, base: preset.base },
    });
  });
  done(path);
}

export async function removeTaxPresetAction(formData: FormData): Promise<void> {
  const path = "/settings/tax";
  const user = await actionUser("manageSettings");
  const id = z.string().min(1).max(64).safeParse(formData.get("id"));
  if (!id.success) fail(path, "Invalid preset");
  const before = await prisma.taxPreset.findUnique({ where: { id: id.data } });
  if (!before) fail(path, "Preset not found");
  await prisma.$transaction(async (tx) => {
    await tx.taxPreset.delete({ where: { id: before.id } });
    await audit(tx, {
      userId: user.id,
      action: "removeTaxPreset",
      entity: "TaxPreset",
      entityId: before.id,
      before,
    });
  });
  done(path);
}

const airlineSchema = z.object({
  iata: z.string().trim().min(2).max(3).transform((v) => v.toUpperCase()),
  name: z.string().trim().min(2).max(120),
});

export async function upsertAirlineAction(formData: FormData): Promise<void> {
  const path = "/settings/airlines";
  const user = await actionUser("manageSettings");
  const parsed = airlineSchema.safeParse({
    iata: formData.get("iata"),
    name: formData.get("name"),
  });
  if (!parsed.success) fail(path, parsed.error.issues[0]?.message ?? "Check the airline");

  const before = await prisma.airline.findUnique({ where: { iata: parsed.data.iata } });
  await prisma.$transaction(async (tx) => {
    const airline = await tx.airline.upsert({
      where: { iata: parsed.data.iata },
      create: { iata: parsed.data.iata, name: parsed.data.name },
      update: { name: parsed.data.name },
    });
    await audit(tx, {
      userId: user.id,
      action: before ? "updateAirline" : "createAirline",
      entity: "Airline",
      entityId: airline.iata,
      before: before ? { name: before.name } : null,
      after: { name: airline.name },
    });
  });
  done(path);
}

const profileUpdateSchema = profileSchema;

export async function updateProfileAction(formData: FormData): Promise<void> {
  const path = "/settings/profile";
  const user = await requireUser();
  const parsed = profileUpdateSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) fail(path, parsed.error.issues[0]?.message ?? "Check your name");
  const before = await prisma.user.findUnique({ where: { id: user.id }, select: { name: true } });
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { name: parsed.data.name } });
    await audit(tx, {
      userId: user.id,
      action: "updateProfile",
      entity: "User",
      entityId: user.id,
      before,
      after: { name: parsed.data.name },
    });
  });
  done(path);
}

const branchInputSchema = branchSchema;

export async function saveBranchAction(formData: FormData): Promise<void> {
  const path = "/settings/branches";
  const user = await actionUser("manageSettings");
  const parsed = branchInputSchema.safeParse({
    code: formData.get("code"),
    name: formData.get("name"),
    active: formData.get("active") === "on",
  });
  if (!parsed.success) fail(path, parsed.error.issues[0]?.message ?? "Check the branch");
  if (!parsed.data.active) {
    const activeBranches = await prisma.branch.count({ where: { active: true } });
    const current = await prisma.branch.findUnique({ where: { code: parsed.data.code } });
    if (current?.active && activeBranches <= 1) fail(path, "Keep at least one active branch");
  }
  const before = await prisma.branch.findUnique({ where: { code: parsed.data.code } });
  await prisma.$transaction(async (tx) => {
    const branch = await tx.branch.upsert({
      where: { code: parsed.data.code },
      create: parsed.data,
      update: { name: parsed.data.name, active: parsed.data.active },
    });
    await audit(tx, {
      userId: user.id,
      action: before ? "updateBranch" : "createBranch",
      entity: "Branch",
      entityId: branch.code,
      before,
      after: branch,
    });
  });
  done(path);
}

const roleInputSchema = roleSchema;

export async function saveRoleAction(formData: FormData): Promise<void> {
  const path = "/settings/roles";
  const user = await actionUser("manageUsers");
  if (user.role !== "admin") {
    fail(path, "Only an admin can change roles and capabilities");
  }
  const parsed = roleInputSchema.safeParse({
    key: formData.get("key"),
    name: formData.get("name"),
    capabilities: formData.getAll("capabilities").map(String),
    active: formData.get("active") === "on",
  });
  if (!parsed.success) fail(path, parsed.error.issues[0]?.message ?? "Check the role");

  const isAdminRole = parsed.data.key === "admin";
  const capabilities = isAdminRole ? [...CAPABILITIES] : parsed.data.capabilities;
  const active = isAdminRole ? true : parsed.data.active;

  const before = await prisma.role.findUnique({ where: { key: parsed.data.key } });
  await prisma.$transaction(async (tx) => {
    const role = await tx.role.upsert({
      where: { key: parsed.data.key },
      create: {
        key: parsed.data.key,
        name: parsed.data.name,
        capabilities: JSON.stringify(capabilities),
        system: false,
        active,
      },
      update: {
        name: parsed.data.name,
        capabilities: JSON.stringify(capabilities),
        active,
      },
    });
    await audit(tx, {
      userId: user.id,
      action: before ? "updateRole" : "createRole",
      entity: "Role",
      entityId: role.key,
      before,
      after: role,
    });
  });
  done(path);
}

export async function sendStaffInviteAction(formData: FormData): Promise<void> {
  const path = "/settings/users";
  const user = await actionUser("manageUsers");
  const id = z.string().min(1).max(64).safeParse(formData.get("userId"));
  if (!id.success) fail(path, "Invalid user");
  const target = await prisma.user.findUnique({ where: { id: id.data } });
  if (!target) fail(path, "User not found");
  const { sendStaffInvite } = await import("@/server/system-email");
  const { resolveAppUrl } = await import("@/lib/security-env");
  const appUrl = resolveAppUrl();
  const result = await sendStaffInvite(target.email, `${appUrl}/login`, user.name);
  if (!result.ok) {
    fail(path, result.skipped ? "System email is not configured (RESEND_API_KEY)" : result.error ?? "Could not send the invite");
  }
  await prisma.$transaction(async (tx) => {
    await audit(tx, {
      userId: user.id,
      action: "sendStaffInvite",
      entity: "User",
      entityId: target.id,
      after: { email: target.email, systemMailId: result.id ?? null },
    });
  });
  done(path);
}
