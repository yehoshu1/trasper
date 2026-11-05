"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { toDateInput } from "@/lib/dates";
import { parseSnapshot, type ItinerarySnapshot } from "@/lib/documents";
import { parsePnr } from "@/lib/pnr";
import { convertToPnr } from "@/lib/pnr/convert";
import { pnrConvertInputSchema, standaloneItinerarySchema } from "@/lib/schemas";
import { audit } from "@/server/audit";
import { actionUser } from "@/server/guard";
import { prisma } from "@/server/db";
import { allocateNumber } from "@/server/numbering";
import { getSettings } from "@/server/settings";
import { expireOverdueQuotations, loadQuotation } from "@/server/quotations";
import {
  buildItinerarySnapshot,
  buildStandaloneItinerarySnapshot,
  DocumentError,
  flightsForSegments,
} from "@/server/documents";
import { actionError, errorMessage, type ActionResult } from "@/server/actions/types";

class ItineraryInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ItineraryInputError";
  }
}

function requireInput(condition: unknown, message: string): asserts condition {
  if (!condition) throw new ItineraryInputError(message);
}

/** Form wrappers: the id arrives in a hidden field so the same action works
 * from any page that posts a form. */
function formId(formData: FormData, name: string): string {
  return (formData.get(name) ?? "").toString();
}

export async function createItineraryFormAction(formData: FormData): Promise<void> {
  const result = await createItineraryAction(formId(formData, "quotationId"));
  if (!result.ok && result.error) {
    redirect(`/quotations/${formId(formData, "quotationId")}?error=${encodeURIComponent(result.error)}`);
  }
}

export async function reissueItineraryFormAction(formData: FormData): Promise<void> {
  const id = formId(formData, "itineraryId");
  const result = await reissueItineraryAction(id);
  if (!result.ok && result.error) {
    redirect(`/itineraries/${id}?error=${encodeURIComponent(result.error)}`);
  }
}

export async function deleteItineraryFormAction(formData: FormData): Promise<void> {
  const id = formId(formData, "itineraryId");
  const user = await actionUser("manageDocuments");
  if (user.role !== "admin") {
    redirect(`/itineraries/${id}?error=${encodeURIComponent("Only an administrator can delete an itinerary")}`);
  }
  const parsed = z.string().min(1).max(64).safeParse(id);
  if (!parsed.success) redirect(`/itineraries?error=${encodeURIComponent("Invalid itinerary")}`);
  const itinerary = await prisma.itinerary.findUnique({ where: { id: parsed.data } });
  if (!itinerary) redirect(`/itineraries?error=${encodeURIComponent("Itinerary not found")}`);

  try {
    await prisma.$transaction(async (tx) => {
      await tx.itinerary.delete({ where: { id: itinerary.id } });
      await audit(tx, {
        userId: user.id,
        action: "deleteItinerary",
        entity: "Itinerary",
        entityId: itinerary.id,
        before: {
          number: itinerary.number,
          quotationId: itinerary.quotationId,
          contactId: itinerary.contactId,
          referenceNo: itinerary.referenceNo,
          issuedAt: itinerary.issuedAt.toISOString(),
          supersededAt: itinerary.supersededAt?.toISOString() ?? null,
          supersededBy: itinerary.supersededBy,
        },
        after: null,
      });
    });
  } catch (error) {
    redirect(
      `/itineraries/${itinerary.id}?error=${encodeURIComponent(errorMessage(error))}`,
    );
  }

  revalidatePath("/itineraries");
  if (itinerary.quotationId) revalidatePath(`/quotations/${itinerary.quotationId}`);
  if (itinerary.contactId) revalidatePath(`/customers/${itinerary.contactId}`);
  redirect("/itineraries?deleted=1");
}

export async function createItineraryAction(quotationId: string): Promise<ActionResult> {
  let itineraryId: string;
  try {
    const user = await actionUser("manageDocuments");
    const id = z.string().min(1).max(64).safeParse(quotationId);
    if (!id.success) return actionError("Invalid quotation");
    await expireOverdueQuotations();
    const quotation = await loadQuotation(id.data);
    if (!quotation) return actionError("Quotation not found");
    if (quotation.status !== "accepted") {
      return actionError("Itineraries can only be created from an accepted quotation");
    }
    const option = quotation.options.find((entry) => entry.id === quotation.acceptedOptionId);
    if (!option) return actionError("The accepted option could not be found");

    const settings = await getSettings();
    const created = await prisma.$transaction(async (tx) => {
      const number = await allocateNumber(tx, "itinerary", new Date(), quotation.branch);
      const snapshot = await buildItinerarySnapshot(quotation, option, settings, number);
      const itinerary = await tx.itinerary.create({
        data: {
          number,
          quotationId: quotation.id,
          optionId: option.id,
          contactId: quotation.contactId,
          branch: quotation.branch,
          referenceNo: quotation.referenceNo,
          snapshot: JSON.stringify(snapshot),
          createdById: user.id,
        },
      });
      await tx.itinerary.updateMany({
        where: {
          quotationId: quotation.id,
          optionId: option.id,
          id: { not: itinerary.id },
          supersededAt: null,
        },
        data: { supersededAt: new Date(), supersededBy: itinerary.number },
      });
      await audit(tx, {
        userId: user.id,
        action: "createItinerary",
        entity: "Itinerary",
        entityId: itinerary.id,
        after: { number: itinerary.number, quotationId: quotation.id, optionId: option.id },
      });
      return itinerary;
    });
    itineraryId = created.id;
    revalidatePath(`/quotations/${quotation.id}`);
    revalidatePath("/itineraries");
  } catch (error) {
    if (error instanceof DocumentError) return actionError(error.message);
    return actionError(errorMessage(error));
  }
  redirect(`/itineraries/${itineraryId}`);
}

/**
 * Read a PNR or itinerary for the standalone form without creating anything.
 * The flights are applied to the client form, so the agent can review them
 * before submitting. Read-only: no quotation or itinerary is written here.
 */
export async function parseItineraryPnrAction(
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
    await actionUser("manageDocuments");
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
        // Keep the operating carrier from the source; canonical PNR text
        // omits the free-text OPERATED BY line.
        segments: converted.segments.map((segment) => ({
          airline: segment.airline,
          flightNo: segment.flightNo,
          fromIata: segment.fromIata,
          toIata: segment.toIata,
          departLocal: segment.departLocal,
          arriveLocal: segment.arriveLocal,
          ...(segment.cabin ? { cabin: segment.cabin } : {}),
          ...(segment.operatingCarrier
            ? { operatingCarrier: segment.operatingCarrier }
            : {}),
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

/** Create an itinerary that is not attached to a quotation and has no prices. */
export async function createStandaloneItineraryFormAction(formData: FormData): Promise<void> {
  let itineraryId: string;
  try {
    const user = await actionUser("manageDocuments");
    let manualSegments: unknown[] = [];
    const rawSegments = formData.get("segments");
    if (rawSegments) {
      try {
        const value = JSON.parse(rawSegments.toString());
        if (Array.isArray(value)) manualSegments = value;
      } catch {
        throw new ItineraryInputError("Could not read the flight rows. Check each field and try again.");
      }
    }
    const parsed = standaloneItinerarySchema.safeParse({
      contactId: formData.get("contactId"),
      branch: formData.get("branch") ?? "01",
      referenceNo: formData.get("referenceNo") ?? "",
      pnr: formData.get("pnr") ?? "",
      pnrText: formData.get("pnrText") ?? "",
      segments: manualSegments,
      notes: formData.get("notes") ?? "",
      passengerIds: formData
        .getAll("passengerIds")
        .map((value) => value.toString())
        .filter(Boolean),
    });
    if (!parsed.success) {
      throw new ItineraryInputError(parsed.error.issues[0]?.message ?? "Check the itinerary");
    }
    const input = parsed.data;

    const contact = await prisma.contact.findUnique({ where: { id: input.contactId } });
    requireInput(contact && !contact.archivedAt, "Choose an active customer");

    const passengerIds = [...new Set(input.passengerIds)];
    const passengers = passengerIds.length === 0
      ? []
      : await prisma.passenger.findMany({
          where: { id: { in: passengerIds }, archivedAt: null },
          orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        });
    requireInput(
      passengers.length === passengerIds.length,
      "One or more selected passengers are archived or no longer exist",
    );

    let segments: {
      airline: string;
      flightNo: string;
      fromIata: string;
      toIata: string;
      departLocal: string;
      arriveLocal: string;
      cabin?: string;
      operatingCarrier?: string;
    }[];

    if (input.segments.length > 0) {
      // Manual flights win over pasted text: the agent typed exactly what
      // should print, so nothing is merged or guessed.
      segments = input.segments.map((segment) => ({
        airline: segment.airline,
        flightNo: segment.flightNo,
        fromIata: segment.fromIata,
        toIata: segment.toIata,
        departLocal: segment.departLocal,
        arriveLocal: segment.arriveLocal,
        cabin: segment.cabin,
        operatingCarrier: segment.operatingCarrier,
      }));
    } else {
      const referenceYear = new Date().getUTCFullYear();
      let converted;
      let reparsed;
      try {
        converted = convertToPnr(input.pnrText, { referenceYear });
        reparsed = parsePnr(converted.pnrText, { referenceYear });
      } catch (error) {
        throw new ItineraryInputError(
          error instanceof Error ? error.message : "Could not read that PNR or itinerary",
        );
      }
      requireInput(
        reparsed.segments.length > 0,
        "Could not read any flight segments from that PNR or itinerary",
      );
      segments = converted.segments.map((segment) => ({
        airline: segment.airline,
        flightNo: segment.flightNo,
        fromIata: segment.fromIata,
        toIata: segment.toIata,
        departLocal: segment.departLocal,
        arriveLocal: segment.arriveLocal,
        cabin: segment.cabin,
        operatingCarrier: segment.operatingCarrier,
      }));
    }

    const flights = await flightsForSegments(segments);
    const settings = await getSettings();
    const issueDate = new Date();

    const created = await prisma.$transaction(async (tx) => {
      const number = await allocateNumber(tx, "itinerary", issueDate, input.branch);
      const snapshot = buildStandaloneItinerarySnapshot({
        number,
        issueDate,
        branch: input.branch,
        referenceNo: input.referenceNo,
        pnr: input.pnr,
        notes: input.notes ?? "",
        contact,
        passengers: passengers.map((passenger) => ({
          title: passenger.title ?? undefined,
          firstName: passenger.firstName,
          lastName: passenger.lastName,
          type: passenger.type as "adult" | "child" | "infant",
        })),
        flights,
        settings,
      });
      const itinerary = await tx.itinerary.create({
        data: {
          number,
          quotationId: null,
          optionId: null,
          contactId: contact.id,
          branch: input.branch,
          referenceNo: input.referenceNo,
          snapshot: JSON.stringify(snapshot),
          createdById: user.id,
        },
      });
      await audit(tx, {
        userId: user.id,
        action: "createStandaloneItinerary",
        entity: "Itinerary",
        entityId: itinerary.id,
        after: {
          number: itinerary.number,
          contactId: contact.id,
          branch: input.branch,
          standalone: true,
        },
      });
      return itinerary;
    });
    itineraryId = created.id;
    revalidatePath("/itineraries");
  } catch (error) {
    const message =
      error instanceof ItineraryInputError || error instanceof DocumentError
        ? error.message
        : errorMessage(error);
    redirect(`/itineraries/new?error=${encodeURIComponent(message)}`);
  }
  redirect(`/itineraries/${itineraryId}`);
}

export async function reissueItineraryAction(itineraryId: string): Promise<ActionResult> {
  let newId: string;
  try {
    const user = await actionUser("manageDocuments");
    const id = z.string().min(1).max(64).safeParse(itineraryId);
    if (!id.success) return actionError("Invalid itinerary");
    const existing = await prisma.itinerary.findUnique({ where: { id: id.data } });
    if (!existing) return actionError("Itinerary not found");

    const quotation = existing.quotationId ? await loadQuotation(existing.quotationId) : null;
    if (existing.quotationId) {
      if (!quotation) return actionError("Quotation not found");
      if (quotation.status !== "accepted") {
        return actionError("The quotation is no longer accepted");
      }
    }
    const option = quotation?.options.find((entry) => entry.id === existing.optionId);
    if (existing.quotationId && !option) return actionError("The option could not be found");

    const standaloneSnapshot = existing.quotationId
      ? null
      : parseSnapshot<ItinerarySnapshot>(existing.snapshot);
    if (!existing.quotationId && !standaloneSnapshot) {
      return actionError("This itinerary has no saved snapshot to re-issue");
    }

    const settings = await getSettings();
    const created = await prisma.$transaction(async (tx) => {
      const branch = existing.branch || quotation?.branch || "01";
      const number = await allocateNumber(tx, "itinerary", new Date(), branch);
      const snapshot = quotation && option
        ? await buildItinerarySnapshot(quotation, option, settings, number)
        : {
            ...standaloneSnapshot!,
            number,
            issueDate: toDateInput(new Date()),
          };
      const itinerary = await tx.itinerary.create({
        data: {
          number,
          quotationId: existing.quotationId,
          optionId: existing.optionId,
          contactId: existing.contactId ?? quotation?.contactId ?? null,
          branch,
          referenceNo: existing.referenceNo,
          snapshot: JSON.stringify(snapshot),
          createdById: user.id,
        },
      });
      await tx.itinerary.update({
        where: { id: existing.id },
        data: { supersededAt: new Date(), supersededBy: itinerary.number },
      });
      await audit(tx, {
        userId: user.id,
        action: "reissueItinerary",
        entity: "Itinerary",
        entityId: itinerary.id,
        before: { number: existing.number },
        after: { number: itinerary.number, supersedes: existing.number },
      });
      return itinerary;
    });
    newId = created.id;
    revalidatePath("/itineraries");
  } catch (error) {
    if (error instanceof DocumentError) return actionError(error.message);
    return actionError(errorMessage(error));
  }
  redirect(`/itineraries/${newId}`);
}
