import { z } from "zod";

import { validateAiBaseUrl } from "./ai-url";
import { BRANCH_PATTERN } from "./branch";
import { isCapability } from "./permissions";
import { SERVICE_UNITS } from "./pricing/presentation";

/** Shared Zod schemas: one per input, used by forms and server actions. */

export const NAME_PATTERN = /^[A-Za-z][A-Za-z' -]*$/;
export const nameField = z
  .string()
  .trim()
  .min(1, "Name is required")
  .max(80)
  .regex(NAME_PATTERN, "Use letters, spaces, hyphens and apostrophes only");

export const optionalText = (max = 500) =>
  z.string().trim().max(max).optional().transform((v) => (v === "" ? undefined : v));

export const emailField = z
  .string()
  .trim()
  .max(200)
  .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Enter a valid email address");

export const contactSchema = z.object({
  name: z.string().trim().min(2, "Contact name is required").max(160),
  type: z.enum(["organisation", "individual"]),
  attention: optionalText(120),
  poBox: optionalText(120),
  city: optionalText(120),
  country: optionalText(120),
  physicalAddress: optionalText(300),
  email: z.union([emailField, z.literal("")]).optional(),
  phone: optionalText(60),
  notes: optionalText(2000),
});

export type ContactInput = z.infer<typeof contactSchema>;

export const contactUpdateSchema = contactSchema.extend({
  id: z.string().min(1).max(64),
  /** Optimistic-locking token: the value the editor loaded. */
  version: z.coerce.number().int().positive(),
});

export const passengerSchema = z.object({
  title: optionalText(20),
  firstName: nameField,
  lastName: nameField,
  type: z.enum(["adult", "child", "infant"]),
});

export const passengerUpdateSchema = passengerSchema.extend({
  id: z.string().min(1).max(64),
  version: z.coerce.number().int().positive(),
});

export type PassengerInput = z.infer<typeof passengerSchema>;

export const linkPassengerSchema = z.object({
  passengerId: z.string().min(1).max(64),
  contactId: z.string().min(1).max(64),
});

const branchField = z
  .string()
  .trim()
  .regex(BRANCH_PATTERN, "Use a two-digit branch code, e.g. 01")
  .default("01");

export const quotationHeaderSchema = z.object({
  contactId: z.string().min(1, "Choose a contact").max(64),
  branch: branchField,
  referenceNo: optionalText(80),
  currency: z.string().trim().min(3).max(3).transform((v) => v.toUpperCase()),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose an issue date"),
  validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid-until date"),
  vatOverride: z.enum(["inherit", "on", "off"]).default("inherit"),
  pricingDisplay: z
    .enum(["inherit", "lump_sum", "net_plus_fee", "itemised", "per_person", "total_only"])
    .default("inherit"),
  taxDisplay: z
    .enum(["inherit", "included", "note", "summary", "itemised"])
    .default("inherit"),
  heading: optionalText(120),
  notes: optionalText(4000),
  bankAccountId: optionalText(64),
});

export type QuotationHeaderInput = z.infer<typeof quotationHeaderSchema>;

/**
 * Minor-unit integers. The length cap is a denial-of-service guard: a
 * multi-megabyte digit string would otherwise reach BigInt parsing.
 */
const moneyString = z
  .string()
  .trim()
  .max(20, "Amount is too large")
  .regex(/^-?\d{1,18}$/, "Amount must be in minor units");

const nonNegativeMoneyString = z
  .string()
  .trim()
  .max(20, "Amount is too large")
  .regex(/^\d{1,18}$/, "Amount must be zero or a positive number of minor units");

const idString = z.string().min(1).max(64);

export const segmentInputSchema = z.object({
  id: z.string().optional(),
  airline: z.string().trim().min(2).max(3).transform((v) => v.toUpperCase()),
  flightNo: z.string().trim().min(1).max(6),
  fromIata: z.string().trim().length(3).transform((v) => v.toUpperCase()),
  toIata: z.string().trim().length(3).transform((v) => v.toUpperCase()),
  departLocal: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Use 2026-10-31T06:20"),
  arriveLocal: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Use 2026-10-31T09:10"),
  cabin: optionalText(20),
  operatingCarrier: optionalText(80),
});

export const fareInputSchema = z
  .object({
    id: z.string().optional(),
    /** Empty when the travellers are still to be named. */
    passengerId: z.string().trim().max(64).optional().default(""),
    passengerType: z.enum(["adult", "child", "infant"]).default("adult"),
    quantity: z
      .string()
      .trim()
      .regex(/^\d{1,3}$/, "Quantity must be a whole number")
      .optional(),
    costMinor: nonNegativeMoneyString,
  })
  .superRefine((fare, ctx) => {
    if (fare.passengerId) {
      if (fare.quantity !== undefined && fare.quantity !== "1") {
        ctx.addIssue({
          code: "custom",
          message: "A named passenger fare covers exactly one traveller",
          path: ["quantity"],
        });
      }
      return;
    }
    if (fare.quantity !== undefined && Number(fare.quantity) < 1) {
      ctx.addIssue({
        code: "custom",
        message: "A traveller group needs at least one traveller",
        path: ["quantity"],
      });
    }
  });

export const serviceInputSchema = z.object({
  id: z.string().optional(),
  category: z.enum([
    "hotel",
    "visa",
    "insurance",
    "transfer",
    "tour",
    "cruise",
    "car_hire",
    "rail",
    "activity",
    "other",
  ]),
  description: z.string().trim().min(2).max(200),
  costMinor: nonNegativeMoneyString,
  quantity: z
    .string()
    .trim()
    .regex(/^\d{1,6}$/, "Quantity must be a whole number")
    .refine((value) => Number(value) >= 1, "Quantity must be at least 1")
    .optional(),
  unit: z.enum(SERVICE_UNITS).optional(),
  unitCostMinor: nonNegativeMoneyString.optional(),
  details: optionalText(300),
});

export const taxInputSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2).max(80),
  kind: z.enum(["fixed", "percent"]),
  value: nonNegativeMoneyString,
  enabled: z.boolean(),
  base: z.enum(["cost", "markup", "subtotal"]).default("cost"),
});

export const optionInputSchema = z.object({
  id: z.string().optional(),
  label: z.string().trim().min(1).max(40),
  optionType: z
    .enum(["flight", "accommodation", "package", "tour", "cruise", "other"])
    .default("flight"),
  pnr: optionalText(80),
  ticketingDeadline: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v === "" ? undefined : v)),
  costCurrency: z.string().trim().min(3).max(3).transform((v) => v.toUpperCase()),
  rateMicro: moneyString.refine((v) => BigInt(v) > 0n, "Exchange rate must be positive"),
  marginKind: z.enum(["percent", "lump"]),
  marginValue: moneyString,
  segments: z.array(segmentInputSchema).max(30),
  fares: z.array(fareInputSchema).max(60),
  services: z.array(serviceInputSchema).max(60),
  taxes: z.array(taxInputSchema).max(20),
});

export const saveQuotationSchema = quotationHeaderSchema.extend({
  quotationId: z.string().min(1).max(64),
  version: z.coerce.number().int().positive(),
  options: z.array(optionInputSchema).max(10),
});

export type SaveQuotationInput = z.infer<typeof saveQuotationSchema>;

export const standaloneItinerarySchema = z
  .object({
    contactId: idString,
    branch: branchField,
    referenceNo: optionalText(80),
    pnr: optionalText(80),
    pnrText: z
      .string()
      .trim()
      .max(30000, "That text is too long")
      .optional()
      .default(""),
    segments: z.array(segmentInputSchema).max(30).optional().default([]),
    notes: optionalText(4000),
    passengerIds: z.array(idString).max(60).default([]),
  })
  .superRefine((input, ctx) => {
    if (input.segments.length === 0 && input.pnrText.length < 5) {
      ctx.addIssue({
        code: "custom",
        path: ["pnrText"],
        message: "Paste a PNR or itinerary, or add at least one flight",
      });
    }
  });

export type StandaloneItineraryInput = z.infer<typeof standaloneItinerarySchema>;

export const acceptOptionSchema = z.object({
  quotationId: z.string().min(1).max(64),
  optionId: z.string().min(1).max(64),
});

export const declineSchema = z.object({
  quotationId: z.string().min(1).max(64),
  reason: optionalText(500),
});

export const sendQuotationSchema = z.object({
  quotationId: z.string().min(1).max(64),
  confirmZeroFare: z.boolean().optional().default(false),
  negativeMarginReason: optionalText(500),
  expectedVersion: z.number().int().positive().optional(),
});

export const cancelQuotationSchema = z.object({
  quotationId: z.string().min(1).max(64),
  reason: z.string().trim().min(3, "Give a reason").max(500),
});

export const paymentSchema = z.object({
  proformaId: z.string().min(1).max(64),
  paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a payment date"),
  amount: z.string().trim().min(1).max(24, "Amount is too large"),
  method: z.enum(["cash", "bank_transfer", "mobile_money", "cheque", "card"]),
  reference: optionalText(120),
});

export const reversePaymentSchema = z.object({
  paymentId: z.string().min(1).max(64),
  reason: z.string().trim().min(3, "Give a reason").max(300),
});

export const cancelProformaSchema = z.object({
  proformaId: z.string().min(1).max(64),
  reason: z.string().trim().min(3, "Give a reason").max(500),
});

export const createProformaSchema = z.object({
  quotationId: z.string().min(1).max(64),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v === "" ? undefined : v)),
  terms: optionalText(1000),
  showVat: z.boolean().default(false),
  bankAccountId: optionalText(64),
});

export const paymentTermOptions = [
  ["cash", "Cash"],
  ["bank_transfer", "Bank transfer"],
  ["mobile_money", "Mobile money"],
  ["cheque", "Cheque"],
  ["card", "Card"],
] as const;

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, "Enter your password").max(200),
});

export const passwordSchema = z
  .string()
  .min(10, "Use at least 10 characters")
  .max(200)
  .regex(/[A-Za-z]/, "Include a letter")
  .regex(/[0-9]/, "Include a number");

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: passwordSchema,
});

export const createUserSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: emailField.transform((v) => v.toLowerCase()),
  role: z.string().trim().min(1, "Choose a role").max(60),
  branch: branchField,
  password: passwordSchema,
});

export const resetPasswordSchema = z.object({
  userId: z.string().min(1).max(64),
  password: passwordSchema,
});

export const userRoleSchema = z.object({
  userId: z.string().min(1).max(64),
  role: z.string().trim().min(1, "Choose a role").max(60),
  branch: branchField,
  active: z.boolean(),
});

export const profileSchema = z.object({
  name: z.string().trim().min(2, "Name is required").max(120),
});

export const branchSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(BRANCH_PATTERN, "Use a two-digit branch code, e.g. 01"),
  name: z.string().trim().min(2, "Branch name is required").max(120),
  active: z.boolean(),
});

export const roleSchema = z.object({
  key: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z][a-z0-9_-]{1,39}$/, "Use lowercase letters, digits, - or _"),
  name: z.string().trim().min(2, "Role name is required").max(120),
  capabilities: z
    .array(z.string().max(40))
    .max(100)
    .transform((values) => values.filter(isCapability)),
  active: z.boolean(),
});

// ---------- Post-launch features ----------

export const ACTIVITY_TYPES = ["called", "emailed", "whatsapp", "note", "meeting"] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const activitySchema = z.object({
  quotationId: optionalText(64),
  contactId: optionalText(64),
  type: z.enum(ACTIVITY_TYPES),
  body: z.string().trim().min(2, "Write what happened").max(4000),
  occurredAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Choose when it happened"),
  nextFollowUpAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v === "" ? undefined : v)),
});

export const bankAccountSchema = z.object({
  id: z.string().min(1).max(64).optional(),
  label: z.string().trim().min(2, "Give the account a label").max(120),
  bankName: z.string().trim().min(2, "Bank name is required").max(160),
  branchName: optionalText(120),
  accountName: z.string().trim().min(2, "Account name is required").max(160),
  accountNumber: z.string().trim().min(2, "Account number is required").max(80),
  swiftCode: optionalText(40),
  sortCode: optionalText(40),
  currency: z.string().trim().min(3).max(3).transform((v) => v.toUpperCase()),
  paymentInstructions: optionalText(1000),
  isDefault: z.boolean().default(false),
  isArchived: z.boolean().default(false),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
});

export const savedTableViewSchema = z.object({
  listKey: z.enum(["quotations", "customers", "proformas", "payments", "itineraries"]),
  globalFilter: z.string().max(500).default(""),
  sorting: z.array(z.object({ id: z.string().max(80), desc: z.boolean() })).max(10),
  filters: z.array(z.object({ id: z.string().max(80), value: z.string().max(200) })).max(20),
  visibility: z
    .record(z.string().max(80), z.boolean())
    .refine((value) => Object.keys(value).length <= 200, "Too many columns"),
});

export type SavedTableViewInput = z.infer<typeof savedTableViewSchema>;

export const mergeContactSchema = z.object({
  survivorId: z.string().min(1).max(64),
  loserId: z.string().min(1).max(64),
});

export const mergePassengerSchema = z.object({
  survivorId: z.string().min(1).max(64),
  loserId: z.string().min(1).max(64),
});

export const instalmentSchema = z.object({
  proformaId: z.string().min(1).max(64),
  label: z.string().trim().min(2, "Give the instalment a label").max(80),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a due date"),
  amount: z.string().trim().min(1, "Enter an amount").max(24, "Amount is too large"),
});

export const pnrConvertInputSchema = z.object({
  text: z
    .string()
    .trim()
    .min(1, "Paste a PNR or itinerary")
    .max(20_000, "Keep the pasted text under 20,000 characters"),
  referenceYear: z.coerce.number().int().min(2000).max(2100).optional(),
});

export const pnrConvertResultSchema = z.object({
  format: z.enum(["pnr", "itinerary"]),
  pnrText: z.string().min(1).max(30_000),
  segments: z.array(segmentInputSchema).max(30),
  passengers: z.array(passengerSchema).max(60),
  ticketingDeadline: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
    .nullable(),
  warnings: z.array(z.string().max(300)).max(100),
  unparsed: z.array(z.string().max(500)).max(100),
});

export type PnrConvertInput = z.infer<typeof pnrConvertInputSchema>;
export type PnrConvertResult = z.infer<typeof pnrConvertResultSchema>;

export const aiSettingsSchema = z.object({
  aiEnabled: z.boolean().default(false),
  aiBaseUrl: z
    .string()
    .trim()
    .min(8, "Enter the provider base URL")
    .max(300)
    .superRefine((value, ctx) => {
      const result = validateAiBaseUrl(value);
      if (!result.ok) {
        ctx.addIssue({ code: "custom", message: result.error ?? "Invalid provider URL" });
      }
    })
    .transform((value) => validateAiBaseUrl(value).url ?? value),
  aiModel: z.string().trim().min(1, "Enter a model name").max(160),
  aiApiKey: z.string().trim().max(1000).optional(),
  clearAiKey: z.boolean().default(false),
});

export type AiSettingsInput = z.infer<typeof aiSettingsSchema>;

export const aiItinerarySegmentSchema = z.object({
  airline: z.string().trim().length(2).transform((value) => value.toUpperCase()),
  flightNo: z.string().trim().min(1).max(6).transform((value) => value.toUpperCase()),
  fromIata: z.string().trim().length(3).transform((value) => value.toUpperCase()),
  toIata: z.string().trim().length(3).transform((value) => value.toUpperCase()),
  departLocal: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
  arriveLocal: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
  cabin: optionalText(20),
  operatingCarrier: optionalText(80),
});

export const aiItineraryProposalSchema = z.object({
  segments: z.array(aiItinerarySegmentSchema).min(1).max(30),
  passengers: z
    .array(
      z.object({
        title: optionalText(20),
        firstName: nameField,
        lastName: nameField,
        type: z.enum(["adult", "child", "infant"]).default("adult"),
      }),
    )
    .max(60)
    .default([]),
  ticketingDeadline: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
    .nullable()
    .optional(),
  warnings: z.array(z.string().max(300)).max(30).default([]),
  confidence: z.number().min(0).max(1).default(0),
});

export type AiItineraryProposal = z.infer<typeof aiItineraryProposalSchema>;

export const aiDocumentDraftSchema = z.object({
  services: z.array(serviceInputSchema).max(60).default([]),
  segments: z.array(segmentInputSchema).max(30).default([]),
  notes: z.array(z.string().max(300)).max(20).default([]),
  confidence: z.number().min(0).max(1).default(0),
});

export type AiDocumentDraft = z.infer<typeof aiDocumentDraftSchema>;
