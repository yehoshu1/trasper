"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { DateTime } from "luxon";

import { chooseBankAccount } from "@/lib/bank-accounts";
import { documentDateFromInput, appTimeZone, toDateInput } from "@/lib/dates";
import { parseLocalWallClock } from "@/lib/time";
import { validateQuotationDraft, type EditorOption } from "@/lib/quotation";
import {
  acceptOptionSchema,
  cancelQuotationSchema,
  declineSchema,
  pnrConvertInputSchema,
  quotationHeaderSchema,
  saveQuotationSchema,
  sendQuotationSchema,
  type SaveQuotationInput,
} from "@/lib/schemas";
import { parsePnr } from "@/lib/pnr";
import { convertToPnr } from "@/lib/pnr/convert";
import { audit } from "@/server/audit";
import { actionUser } from "@/server/guard";
import { prisma } from "@/server/db";
import { allocateNumber, revisionNumber } from "@/server/numbering";
import {
  archiveQuotationCore,
  cancelQuotationCore,
  copyOptions,
  duplicateQuotationCore,
  unarchiveQuotationCore,
} from "@/server/quotation-mutations";
import { getSettings } from "@/server/settings";
import {
  expireOverdueQuotations,
  freezeOptions,
  latestRate,
  loadQuotation,
  toEditorOption,
  type QuotationWithRelations,
} from "@/server/quotations";
import { buildQuotationSnapshot, DocumentError } from "@/server/documents";
import {
  actionError,
  actionOk,
  actionStale,
  errorMessage,
  type ActionResult,
} from "@/server/actions/types";
import { STALE_VERSION_MESSAGE } from "@/lib/locking";

function fail(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

function vatOverrideValue(value: "inherit" | "on" | "off"): boolean | null {
  if (value === "on") return true;
  if (value === "off") return false;
  return null;
}

function displayOverride<T extends string>(value: "inherit" | T): T | null {
  return value === "inherit" ? null : value;
}

function optionCreateData(option: EditorOption, position: number) {
  return {
    position,
    label: option.label,
    optionType: option.optionType ?? "flight",
    pnr: option.pnr || null,
    ticketingDeadline: option.ticketingDeadline
      ? parseLocalWallClock(option.ticketingDeadline, appTimeZone()).toUTC().toJSDate()
      : null,
    costCurrency: option.costCurrency,
    rateMicro: BigInt(option.rateMicro),
    marginKind: option.marginKind,
    marginValue: BigInt(option.marginValue),
    segments: {
      create: option.segments.map((segment, index) => ({
        position: index,
        airline: segment.airline,
        flightNo: segment.flightNo,
        fromIata: segment.fromIata,
        toIata: segment.toIata,
        departLocal: segment.departLocal,
        arriveLocal: segment.arriveLocal,
        cabin: segment.cabin || null,
        operatingCarrier: segment.operatingCarrier || null,
      })),
    },
    fares: {
      create: option.fares.map((fare) => ({
        passengerId: fare.passengerId || null,
        passengerType: fare.passengerType,
        quantity: fare.passengerId
          ? 1
          : Math.max(1, Number.parseInt(fare.quantity || "1", 10) || 1),
        costMinor: BigInt(fare.costMinor),
        travellerNames:
          !fare.passengerId && fare.travellerNames?.trim()
            ? fare.travellerNames.trim()
            : null,
      })),
    },
    services: {
      create: option.services.map((service) => ({
        category: service.category,
        description: service.description,
        costMinor: BigInt(service.costMinor),
        quantity: Math.max(1, Number.parseInt(service.quantity || "1", 10) || 1),
        unit: service.unit || "unit",
        unitCostMinor:
          service.unitCostMinor && service.unitCostMinor !== ""
            ? BigInt(service.unitCostMinor)
            : null,
        details: service.details || null,
      })),
    },
    taxes: {
      create: option.taxes.map((tax) => ({
        name: tax.name,
        kind: tax.kind,
        value: BigInt(tax.value),
        enabled: tax.enabled,
        base: tax.base ?? "cost",
      })),
    },
  };
}

export async function createQuotationAction(formData: FormData): Promise<void> {
  const user = await actionUser("manageQuotations");
  const parsed = quotationHeaderSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) fail("/quotations/new", parsed.error.issues[0]?.message ?? "Check the form");
  const data = parsed.data;

  if (data.validUntil < data.issueDate) {
    fail("/quotations/new", "Valid-until cannot be earlier than the issue date");
  }
  const contact = await prisma.contact.findUnique({ where: { id: data.contactId } });
  if (!contact) fail("/quotations/new", "Contact not found");
  if (contact.archivedAt) fail("/quotations/new", "That contact is archived");

  const settings = await getSettings();
  const issueDate = documentDateFromInput(data.issueDate);
  const validUntil = documentDateFromInput(data.validUntil);
  const bankOptions = await prisma.bankAccount.findMany({
    where: { isArchived: false },
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
  });
  const selectedBank = chooseBankAccount(bankOptions, data.bankAccountId);

  const created = await prisma.$transaction(async (tx) => {
    const number = await allocateNumber(tx, "quotation", issueDate, data.branch);
    const quotation = await tx.quotation.create({
      data: {
        number,
        contactId: data.contactId,
        branch: data.branch,
        referenceNo: data.referenceNo,
        status: "draft",
        currency: data.currency,
        issueDate,
        validUntil,
        vatOverride: vatOverrideValue(data.vatOverride),
        pricingDisplay: displayOverride(data.pricingDisplay),
        taxDisplay: displayOverride(data.taxDisplay),
        heading: data.heading,
        notes: data.notes,
        bankAccountId: selectedBank?.id ?? null,
        createdById: user.id,
        options: {
          create: [
            {
              position: 0,
              label: "Option A",
              optionType: "flight",
              costCurrency: data.currency,
              rateMicro: 1_000_000n,
              marginKind: "percent",
              marginValue: settings.defaultMarginBps,
            },
          ],
        },
      },
    });
    await audit(tx, {
      userId: user.id,
      action: "createQuotation",
      entity: "Quotation",
      entityId: quotation.id,
      after: {
        number: quotation.number,
        contactId: quotation.contactId,
        branch: quotation.branch,
        currency: quotation.currency,
        issueDate,
        validUntil,
      },
    });
    return quotation;
  });

  revalidatePath("/quotations");
  redirect(`/quotations/${created.id}`);
}

export async function saveQuotationAction(input: SaveQuotationInput): Promise<ActionResult> {
  try {
    const user = await actionUser("manageQuotations");
    const parsed = saveQuotationSchema.safeParse(input);
    if (!parsed.success) return actionError(parsed.error.issues[0]?.message ?? "Check the form");
    const data = parsed.data;
    if (data.validUntil < data.issueDate) {
      return actionError("Valid-until cannot be earlier than the issue date");
    }

    const quotation = await loadQuotation(data.quotationId);
    if (!quotation) return actionError("Quotation not found");
    if (quotation.status !== "draft") {
      return actionError("This quotation has been sent and is locked. Use Revise to change it.");
    }
    if (quotation.contact.archivedAt) return actionError("The contact is archived");

    const before = {
      number: quotation.number,
      referenceNo: quotation.referenceNo,
      branch: quotation.branch,
      currency: quotation.currency,
      issueDate: quotation.issueDate,
      validUntil: quotation.validUntil,
      vatOverride: quotation.vatOverride,
      pricingDisplay: quotation.pricingDisplay,
      taxDisplay: quotation.taxDisplay,
      heading: quotation.heading,
      notes: quotation.notes,
      bankAccountId: quotation.bankAccountId,
      version: quotation.version,
      options: quotation.options.map((option) => ({
        label: option.label,
        pnr: option.pnr,
        rateMicro: option.rateMicro,
        marginValue: option.marginValue,
      })),
    };

    const branchChanged = data.branch !== quotation.branch;
    const issueDate = documentDateFromInput(data.issueDate);
    let stale = false;

    await prisma.$transaction(async (tx) => {
      // Claim the version first. updateMany is a single statement, so two
      // concurrent saves cannot both read the old version and both succeed.
      const claimed = await tx.quotation.updateMany({
        where: { id: quotation.id, version: data.version },
        data: { version: { increment: 1 } },
      });
      if (claimed.count === 0) {
        stale = true;
        return;
      }
      await tx.quoteOption.deleteMany({ where: { quotationId: quotation.id } });
      // A draft's number follows its branch: correcting the branch before the
      // quotation is sent issues a new number (the old one is never reused).
      let number = quotation.number;
      if (branchChanged) {
        const allocated = await allocateNumber(tx, "quotation", issueDate, data.branch);
        number =
          quotation.revision > 1
            ? revisionNumber(allocated, quotation.revision)
            : allocated;
      }
      await tx.quotation.update({
        where: { id: quotation.id },
        data: {
          number,
          referenceNo: data.referenceNo,
          branch: data.branch,
          currency: data.currency,
          issueDate,
          validUntil: documentDateFromInput(data.validUntil),
          vatOverride: vatOverrideValue(data.vatOverride),
          pricingDisplay: displayOverride(data.pricingDisplay),
          taxDisplay: displayOverride(data.taxDisplay),
          heading: data.heading,
          notes: data.notes,
          bankAccountId: data.bankAccountId || null,
          options: {
            create: data.options.map((option, index) => optionCreateData(option as EditorOption, index)),
          },
        },
      });
      await audit(tx, {
        userId: user.id,
        action: "saveQuotation",
        entity: "Quotation",
        entityId: quotation.id,
        before,
        after: {
          number,
          referenceNo: data.referenceNo,
          branch: data.branch,
          currency: data.currency,
          issueDate: data.issueDate,
          validUntil: data.validUntil,
          vatOverride: data.vatOverride,
          pricingDisplay: data.pricingDisplay,
          taxDisplay: data.taxDisplay,
          heading: data.heading,
          notes: data.notes,
          bankAccountId: data.bankAccountId || null,
          version: data.version + 1,
          options: data.options.map((option) => ({
            label: option.label,
            pnr: option.pnr,
            rateMicro: option.rateMicro,
            marginValue: option.marginValue,
          })),
        },
      });
    });

    if (stale) return actionStale(STALE_VERSION_MESSAGE);

    revalidatePath(`/quotations/${quotation.id}`);
    revalidatePath("/quotations");
    return actionOk("Draft saved");
  } catch (error) {
    return actionError(errorMessage(error));
  }
}

interface SendConfirmation {
  confirmZeroFare?: boolean;
  negativeMarginReason?: string;
}

async function collectWarnings(
  quotation: QuotationWithRelations,
  settings: Awaited<ReturnType<typeof getSettings>>,
): Promise<string[]> {
  const warnings: string[] = [];
  const pnrs = quotation.options.map((option) => option.pnr).filter((pnr): pnr is string => Boolean(pnr));
  if (pnrs.length > 0) {
    const otherOptions = await prisma.quoteOption.findMany({
      where: {
        pnr: { in: pnrs },
        quotationId: { not: quotation.id },
        quotation: { status: { in: ["draft", "sent"] } },
      },
      include: { quotation: { select: { number: true, status: true } } },
    });
    for (const other of otherOptions) {
      warnings.push(`PNR ${other.pnr} also appears on open quotation ${other.quotation.number}`);
    }
  }

  for (const option of quotation.options) {
    if (option.ticketingDeadline) {
      const validUntil = DateTime.fromJSDate(quotation.validUntil, { zone: "utc" }).endOf("day");
      if (DateTime.fromJSDate(option.ticketingDeadline) > validUntil) {
        warnings.push(
          `${option.label}: valid-until is later than the airline ticketing deadline (${DateTime.fromJSDate(option.ticketingDeadline).setZone(appTimeZone()).toFormat("dd LLL yyyy, HH:mm")})`,
        );
      }
    }
    const rate = await latestRate(option.costCurrency, quotation.currency);
    if (rate && option.costCurrency !== quotation.currency) {
      const ageDays = DateTime.now().diff(DateTime.fromJSDate(rate.effectiveFrom), "days").days;
      if (ageDays > settings.rateMaxAgeDays) {
        warnings.push(
          `${option.label}: the saved ${option.costCurrency}→${quotation.currency} rate is ${Math.floor(ageDays)} days old`,
        );
      }
    }
  }
  return warnings;
}

export async function sendQuotationAction(
  quotationId: string,
  confirmation: SendConfirmation = {},
  expectedVersion?: number,
): Promise<ActionResult> {
  try {
    const user = await actionUser("manageQuotations");
    const parsed = sendQuotationSchema.safeParse({
      quotationId,
      confirmZeroFare: confirmation.confirmZeroFare,
      negativeMarginReason: confirmation.negativeMarginReason,
      expectedVersion,
    });
    if (!parsed.success) {
      return actionError(parsed.error.issues[0]?.message ?? "Check the quotation");
    }
    const data = parsed.data;
    const quotation = await loadQuotation(data.quotationId);
    if (!quotation) return actionError("Quotation not found");
    if (quotation.status !== "draft") return actionError("Only a draft can be sent");
    if (quotation.contact.archivedAt) return actionError("The contact is archived");
    if (data.expectedVersion !== undefined && quotation.version !== data.expectedVersion) {
      return actionStale(STALE_VERSION_MESSAGE);
    }

    const draftOptions = quotation.options.map(toEditorOption);
    const validation = validateQuotationDraft(draftOptions);
    if (!validation.valid) {
      return actionError(validation.errors.map((issue) => `${issue.optionLabel}: ${issue.message}`).join("; "));
    }
    if (validation.requiresZeroFareConfirmation && !data.confirmZeroFare) {
      return actionError("One or more fares are zero. Confirm the zero fare before sending.");
    }
    if (validation.hasNegativeMargin) {
      if (user.role !== "admin") return actionError("Only an admin can send a quotation with a negative margin");
      if (!data.negativeMarginReason?.trim()) {
        return actionError("Give a reason for the negative margin");
      }
    }

    const settings = await getSettings();
    for (const option of quotation.options) {
      if (option.costCurrency === quotation.currency) continue;
      const rate = await latestRate(option.costCurrency, quotation.currency);
      if (!rate) {
        return actionError(
          `No saved exchange rate for ${option.costCurrency} → ${quotation.currency}. Add one in Settings first.`,
        );
      }
    }

    const warnings = await collectWarnings(quotation, settings);
    const bankAccounts = await prisma.bankAccount.findMany({ where: { isArchived: false } });
    const bank = chooseBankAccount(bankAccounts, quotation.bankAccountId);
    let snapshot: string;
    try {
      const built = await buildQuotationSnapshot(quotation, settings);
      snapshot = JSON.stringify(built);
    } catch (error) {
      if (error instanceof DocumentError) return actionError(error.message);
      throw error;
    }

    let stale = false;
    await prisma.$transaction(async (tx) => {
      // Claim the same version the validation read. A concurrent save cannot
      // change the fares between the checks above and the freeze below.
      const claimed = await tx.quotation.updateMany({
        where: { id: quotation.id, status: "draft", version: quotation.version },
        data: { version: { increment: 1 } },
      });
      if (claimed.count === 0) {
        stale = true;
        return;
      }
      await freezeOptions(tx, quotation, settings);
      await tx.quotation.update({
        where: { id: quotation.id },
        data: {
          status: "sent",
          sentAt: new Date(),
          lockedAt: new Date(),
          bankAccountId: bank?.id ?? quotation.bankAccountId,
          snapshot,
        },
      });
      await audit(tx, {
        userId: user.id,
        action: "sendQuotation",
        entity: "Quotation",
        entityId: quotation.id,
        before: { status: "draft" },
        after: {
          status: "sent",
          negativeMarginReason: data.negativeMarginReason ?? null,
          zeroFareConfirmed: Boolean(data.confirmZeroFare),
        },
      });
    });

    if (stale) return actionStale(STALE_VERSION_MESSAGE);
    revalidatePath(`/quotations/${quotation.id}`);
    revalidatePath("/quotations");
    revalidatePath("/dashboard");
    return {
      ...actionOk("Quotation marked as sent and locked"),
      warning: warnings.length > 0 ? warnings.join(" · ") : undefined,
    };
  } catch (error) {
    return actionError(errorMessage(error));
  }
}

export async function acceptOptionAction(
  quotationId: string,
  optionId: string,
): Promise<ActionResult> {
  try {
    const user = await actionUser("manageQuotations");
    const parsed = acceptOptionSchema.safeParse({ quotationId, optionId });
    if (!parsed.success) return actionError("Check the quotation option");
    await expireOverdueQuotations();
    const quotation = await loadQuotation(parsed.data.quotationId);
    if (!quotation) return actionError("Quotation not found");
    if (quotation.status !== "sent") {
      return actionError("Only a sent quotation can be accepted");
    }
    const option = quotation.options.find((entry) => entry.id === parsed.data.optionId);
    if (!option) return actionError("Choose an option from this quotation");

    const rejection: { message: string | null } = { message: null };
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.quotation.updateMany({
        where: { id: quotation.id, status: "sent" },
        data: { status: "accepted", acceptedOptionId: option.id },
      });
      if (claimed.count === 0) {
        rejection.message = "This quotation is no longer awaiting acceptance";
        throw new Error("ACCEPT_REJECTED");
      }
      await audit(tx, {
        userId: user.id,
        action: "acceptOption",
        entity: "Quotation",
        entityId: quotation.id,
        before: { status: "sent", acceptedOptionId: null },
        after: { status: "accepted", acceptedOptionId: option.id, optionLabel: option.label },
      });
    }).catch((error) => {
      if (rejection.message) return;
      throw error;
    });
    if (rejection.message) return actionError(rejection.message);
    revalidatePath(`/quotations/${quotation.id}`);
    revalidatePath("/quotations");
    return actionOk(`Accepted ${option.label}`);
  } catch (error) {
    return actionError(errorMessage(error));
  }
}

export async function declineQuotationAction(
  quotationId: string,
  reason: string,
): Promise<ActionResult> {
  try {
    const user = await actionUser("manageQuotations");
    const parsed = declineSchema.safeParse({ quotationId, reason });
    if (!parsed.success) return actionError(parsed.error.issues[0]?.message ?? "Check the reason");
    await expireOverdueQuotations();
    const quotation = await loadQuotation(parsed.data.quotationId);
    if (!quotation) return actionError("Quotation not found");
    if (quotation.status !== "sent") return actionError("Only a sent quotation can be declined");

    const rejection: { message: string | null } = { message: null };
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.quotation.updateMany({
        where: { id: quotation.id, status: "sent" },
        data: { status: "declined" },
      });
      if (claimed.count === 0) {
        rejection.message = "This quotation is no longer awaiting a reply";
        throw new Error("DECLINE_REJECTED");
      }
      await audit(tx, {
        userId: user.id,
        action: "declineQuotation",
        entity: "Quotation",
        entityId: quotation.id,
        before: { status: "sent" },
        after: { status: "declined", reason: parsed.data.reason ?? null },
      });
    }).catch((error) => {
      if (rejection.message) return;
      throw error;
    });
    if (rejection.message) return actionError(rejection.message);
    revalidatePath(`/quotations/${quotation.id}`);
    return actionOk("Quotation declined");
  } catch (error) {
    return actionError(errorMessage(error));
  }
}

export async function deleteQuotationAction(formData: FormData): Promise<void> {
  const user = await actionUser("manageQuotations");
  const parsed = z
    .object({ quotationId: z.string().min(1) })
    .safeParse({ quotationId: formData.get("quotationId") });
  if (!parsed.success) fail("/quotations", "Invalid quotation");

  const quotation = await prisma.quotation.findUnique({
    where: { id: parsed.data.quotationId },
    include: { _count: { select: { itineraries: true, proformas: true } } },
  });
  if (!quotation) fail("/quotations", "Quotation not found");
  if (quotation.status !== "draft" || quotation.sentAt || quotation.lockedAt) {
    fail(`/quotations/${quotation.id}`, "Only quotations that have not been sent can be deleted");
  }
  if (quotation._count.itineraries > 0 || quotation._count.proformas > 0) {
    fail(`/quotations/${quotation.id}`, "This quotation has issued documents and cannot be deleted");
  }

  await prisma.$transaction(async (tx) => {
    await tx.quotation.delete({ where: { id: quotation.id } });
    await audit(tx, {
      userId: user.id,
      action: "deleteQuotation",
      entity: "Quotation",
      entityId: quotation.id,
      before: {
        number: quotation.number,
        status: quotation.status,
        contactId: quotation.contactId,
        branch: quotation.branch,
        issueDate: quotation.issueDate.toISOString(),
        validUntil: quotation.validUntil.toISOString(),
      },
    });
  });

  revalidatePath("/quotations");
  revalidatePath("/dashboard");
  redirect("/quotations");
}

export async function cancelQuotationAction(formData: FormData): Promise<void> {
  const user = await actionUser("manageQuotations");
  const parsed = cancelQuotationSchema.safeParse({
    quotationId: formData.get("quotationId"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) fail("/quotations", parsed.error.issues[0]?.message ?? "Check the form");

  const result = await cancelQuotationCore(parsed.data.quotationId, user.id, parsed.data.reason, {
    allowAccepted: user.role === "admin",
  });
  if (!result.ok) fail(`/quotations/${parsed.data.quotationId}`, result.error ?? "Could not cancel");
  revalidatePath(`/quotations/${parsed.data.quotationId}`);
  revalidatePath("/quotations");
  redirect(`/quotations/${parsed.data.quotationId}?saved=1`);
}

export async function archiveQuotationAction(formData: FormData): Promise<void> {
  const user = await actionUser("manageQuotations");
  const parsed = z
    .object({ quotationId: z.string().min(1).max(64) })
    .safeParse({ quotationId: formData.get("quotationId") });
  if (!parsed.success) fail("/quotations", "Invalid quotation");

  const result = await archiveQuotationCore(parsed.data.quotationId, user.id);
  if (!result.ok) fail(`/quotations/${parsed.data.quotationId}`, result.error ?? "Could not archive");
  revalidatePath(`/quotations/${parsed.data.quotationId}`);
  revalidatePath("/quotations");
  revalidatePath("/dashboard");
  redirect(`/quotations/${parsed.data.quotationId}?saved=1`);
}

export async function unarchiveQuotationAction(formData: FormData): Promise<void> {
  const user = await actionUser("manageQuotations");
  const parsed = z
    .object({ quotationId: z.string().min(1).max(64) })
    .safeParse({ quotationId: formData.get("quotationId") });
  if (!parsed.success) fail("/quotations", "Invalid quotation");

  const result = await unarchiveQuotationCore(parsed.data.quotationId, user.id);
  if (!result.ok) fail(`/quotations/${parsed.data.quotationId}`, result.error ?? "Could not restore");
  revalidatePath(`/quotations/${parsed.data.quotationId}`);
  revalidatePath("/quotations");
  revalidatePath("/dashboard");
  redirect(`/quotations/${parsed.data.quotationId}?saved=1`);
}

export async function reviseQuotationAction(quotationId: string): Promise<ActionResult> {
  let createdId: string;
  try {
    const user = await actionUser("manageQuotations");
    const id = z.string().min(1).max(64).safeParse(quotationId);
    if (!id.success) return actionError("Invalid quotation");
    const quotation = await loadQuotation(id.data);
    if (!quotation) return actionError("Quotation not found");
    if (quotation.status === "draft") return actionError("This quotation is still a draft; edit it instead");

    const settings = await getSettings();
    const revision = quotation.revision + 1;
    const number = revisionNumber(quotation.number, revision);
    const issueDate = documentDateFromInput(toDateInput(new Date()));
    const validUntil = new Date(issueDate);
    validUntil.setUTCDate(validUntil.getUTCDate() + settings.defaultValidityDays);

    const created = await prisma.$transaction(async (tx) => {
      const copy = await tx.quotation.create({
        data: {
          number,
          revision,
          supersedesId: quotation.id,
          contactId: quotation.contactId,
          referenceNo: quotation.referenceNo,
          status: "draft",
          branch: quotation.branch,
          currency: quotation.currency,
          issueDate,
          validUntil,
          vatOverride: quotation.vatOverride,
          pricingDisplay: quotation.pricingDisplay,
          taxDisplay: quotation.taxDisplay,
          heading: quotation.heading,
          notes: quotation.notes,
          createdById: user.id,
        },
      });
      await copyOptions(tx, quotation, copy.id);
      await tx.quotation.update({
        where: { id: quotation.id },
        data: { status: "superseded" },
      });
      await audit(tx, {
        userId: user.id,
        action: "reviseQuotation",
        entity: "Quotation",
        entityId: copy.id,
        before: { id: quotation.id, number: quotation.number, status: quotation.status },
        after: { number: copy.number, revision, supersedesId: quotation.id },
      });
      return copy;
    });
    createdId = created.id;
    revalidatePath("/quotations");
  } catch (error) {
    return actionError(errorMessage(error));
  }
  redirect(`/quotations/${createdId}`);
}

export async function duplicateQuotationAction(quotationId: string): Promise<ActionResult> {
  let createdId: string;
  try {
    const user = await actionUser("manageQuotations");
    const id = z.string().min(1).max(64).safeParse(quotationId);
    if (!id.success) return actionError("Invalid quotation");
    const created = await duplicateQuotationCore(id.data, user.id);
    createdId = created.id;
    revalidatePath("/quotations");
  } catch (error) {
    return actionError(errorMessage(error));
  }
  redirect(`/quotations/${createdId}`);
}

export async function parsePnrAction(
  text: string,
  referenceYear?: number,
): Promise<{
  ok: boolean;
  error?: string;
  result?: ReturnType<typeof parsePnr>;
  pnrText?: string;
  format?: "pnr" | "itinerary";
}> {
  try {
    await actionUser("manageQuotations");
    const parsed = pnrConvertInputSchema.safeParse({ text, referenceYear });
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Paste a PNR or itinerary" };
    }
    const converted = convertToPnr(parsed.data.text, {
      referenceYear: parsed.data.referenceYear,
    });
    const reparsed = parsePnr(converted.pnrText, {
      referenceYear: parsed.data.referenceYear,
    });
    return {
      ok: true,
      result: {
        ...reparsed,
        // Keep the operating carrier from the source; the canonical PNR text
        // omits the free-text OPERATED BY line, so a reparse would lose it.
        segments: converted.segments.map((segment) => ({
          airline: segment.airline,
          flightNo: segment.flightNo,
          fromIata: segment.fromIata,
          toIata: segment.toIata,
          departLocal: segment.departLocal,
          arriveLocal: segment.arriveLocal,
          ...(segment.cabin ? { cabin: segment.cabin } : {}),
          ...(segment.operatingCarrier ? { operatingCarrier: segment.operatingCarrier } : {}),
          raw: "",
        })),
        warnings: [...new Set([...converted.warnings, ...reparsed.warnings])],
      },
      pnrText: converted.pnrText,
      format: converted.format,
    };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}
