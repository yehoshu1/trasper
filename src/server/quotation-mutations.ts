import type { Prisma } from "@/generated/prisma/client";
import { documentDateFromInput, toDateInput } from "@/lib/dates";
import { actionError, actionOk, type ActionResult } from "@/server/actions/types";
import { audit } from "@/server/audit";
import { prisma } from "@/server/db";
import { allocateNumber } from "@/server/numbering";
import {
  loadQuotation,
  type QuotationWithRelations,
} from "@/server/quotations";
import { getSettings } from "@/server/settings";

/**
 * Shared quotation mutations.
 *
 * This module deliberately does NOT have a "use server" directive. Helpers in
 * a "use server" file become publicly callable Server Actions; these take a
 * userId argument and must only be reached after the calling action has
 * authenticated and authorised the staff member.
 */

export async function copyOptions(
  tx: Prisma.TransactionClient,
  quotation: QuotationWithRelations,
  targetQuotationId: string,
): Promise<void> {
  for (const option of quotation.options) {
    await tx.quoteOption.create({
      data: {
        quotationId: targetQuotationId,
        position: option.position,
        label: option.label,
        optionType: option.optionType,
        pnr: option.pnr,
        ticketingDeadline: option.ticketingDeadline,
        costCurrency: option.costCurrency,
        rateMicro: option.rateMicro,
        marginKind: option.marginKind,
        marginValue: option.marginValue,
        segments: {
          create: option.segments.map((segment) => ({
            position: segment.position,
            airline: segment.airline,
            flightNo: segment.flightNo,
            fromIata: segment.fromIata,
            toIata: segment.toIata,
            departLocal: segment.departLocal,
            arriveLocal: segment.arriveLocal,
            cabin: segment.cabin,
            operatingCarrier: segment.operatingCarrier,
          })),
        },
        fares: {
          create: option.fares.map((fare) => ({
            passengerId: fare.passengerId,
            passengerType: fare.passengerType,
            quantity: fare.quantity,
            costMinor: fare.costMinor,
          })),
        },
        services: {
          create: option.services.map((service) => ({
            category: service.category,
            description: service.description,
            costMinor: service.costMinor,
            quantity: service.quantity,
            unit: service.unit,
            unitCostMinor: service.unitCostMinor,
            details: service.details,
          })),
        },
        taxes: {
          create: option.taxes.map((tax) => ({
            name: tax.name,
            kind: tax.kind,
            value: tax.value,
            enabled: tax.enabled,
            base: tax.base,
          })),
        },
      },
    });
  }
}

/** Duplicate a quotation as a fresh draft. Caller must authorise first. */
export async function duplicateQuotationCore(
  quotationId: string,
  userId: string,
): Promise<{ id: string; number: string }> {
  const quotation = await loadQuotation(quotationId);
  if (!quotation) throw new Error("Quotation not found");
  const settings = await getSettings();
  const issueDate = documentDateFromInput(toDateInput(new Date()));
  const validUntil = new Date(issueDate);
  validUntil.setUTCDate(validUntil.getUTCDate() + settings.defaultValidityDays);

  const created = await prisma.$transaction(async (tx) => {
    const number = await allocateNumber(tx, "quotation", issueDate, quotation.branch);
    const copy = await tx.quotation.create({
      data: {
        number,
        revision: 1,
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
        bankAccountId: quotation.bankAccountId,
        createdById: userId,
      },
    });
    await copyOptions(tx, quotation, copy.id);
    await audit(tx, {
      userId,
      action: "duplicateQuotation",
      entity: "Quotation",
      entityId: copy.id,
      before: { sourceId: quotation.id, sourceNumber: quotation.number },
      after: { number: copy.number },
    });
    return copy;
  });
  return { id: created.id, number: created.number };
}

/** Cancel a draft, sent or (for an admin) accepted quotation. */
export async function cancelQuotationCore(
  quotationId: string,
  userId: string,
  reason: string,
  options: { allowAccepted?: boolean } = {},
): Promise<ActionResult> {
  const quotation = await prisma.quotation.findUnique({ where: { id: quotationId } });
  if (!quotation) return actionError("Quotation not found");
  const allowed =
    quotation.status === "draft" ||
    quotation.status === "sent" ||
    (options.allowAccepted === true && quotation.status === "accepted");
  if (!allowed) {
    return actionError(
      quotation.status === "accepted"
        ? "Only an administrator can cancel an accepted quotation"
        : "Only a draft, sent or accepted quotation can be cancelled",
    );
  }
  await prisma.$transaction(async (tx) => {
    await tx.quotation.update({
      where: { id: quotation.id },
      data: {
        status: "cancelled",
        cancelledAt: new Date(),
        cancelledReason: reason,
        version: { increment: 1 },
      },
    });
    await audit(tx, {
      userId,
      action: "cancelQuotation",
      entity: "Quotation",
      entityId: quotation.id,
      before: { status: quotation.status, acceptedOptionId: quotation.acceptedOptionId },
      after: { status: "cancelled", reason },
    });
  });
  return actionOk(`Cancelled ${quotation.number}`);
}
