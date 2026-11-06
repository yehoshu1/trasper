"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { parseTickets } from "@/lib/tickets/parse";
import { isBookingDocument, parseBookingDocument } from "@/lib/tickets/booking";
import { mergeTicketSources } from "@/lib/tickets/merge";
import { audit } from "@/server/audit";
import { prisma } from "@/server/db";
import { actionUser } from "@/server/guard";

const importSchema = z
  .object({
    text: z.string().trim().max(200_000).optional().default(""),
    bookingText: z.string().trim().max(300_000).optional().default(""),
    contactId: z.string().trim().max(64).optional().default(""),
    quotationId: z.string().trim().max(64).optional().default(""),
    bookingRef: z.string().trim().max(80).optional().default(""),
    checkInRef: z.string().trim().max(80).optional().default(""),
    secondaryCheckInRef: z.string().trim().max(80).optional().default(""),
    secondaryCarrier: z.string().trim().max(10).optional().default(""),
    applyItineraryToAll: z.boolean().default(true),
  })
  .refine((data) => data.text.length >= 5 || data.bookingText.length >= 5, {
    message: "Paste the e-ticket output or the airline booking confirmation",
    path: ["text"],
  });

export async function createTicketsAction(formData: FormData): Promise<void> {
  const user = await actionUser("manageDocuments");
  const parsed = importSchema.safeParse({
    text: formData.get("text") ?? "",
    bookingText: formData.get("bookingText") ?? "",
    contactId: formData.get("contactId") ?? "",
    quotationId: formData.get("quotationId") ?? "",
    bookingRef: formData.get("bookingRef") ?? "",
    checkInRef: formData.get("checkInRef") ?? "",
    secondaryCheckInRef: formData.get("secondaryCheckInRef") ?? "",
    secondaryCarrier: formData.get("secondaryCarrier") ?? "",
    applyItineraryToAll: formData.get("applyItineraryToAll") === "on",
  });
  if (!parsed.success) {
    redirect(`/tickets/new?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Check the ticket text")}`);
  }

  const ticketText = parsed.data.text;
  const bookingText =
    parsed.data.bookingText || (isBookingDocument(parsed.data.text) ? parsed.data.text : "");

  const result = parseTickets(ticketText);
  const booking = bookingText ? parseBookingDocument(bookingText) : null;
  if (
    booking &&
    booking.flights.length === 0 &&
    booking.passengers.length === 0
  ) {
    redirect(
      `/tickets/new?error=${encodeURIComponent(
        booking.warnings[0] ?? "The booking confirmation could not be read",
      )}`,
    );
  }
  if (!booking && result.tickets.length === 0) {
    redirect(`/tickets/new?error=${encodeURIComponent(result.warnings[0] ?? "No ticket numbers were found")}`);
  }

  const merged = mergeTicketSources(
    result.tickets,
    booking,
    parsed.data.applyItineraryToAll,
  );
  const groups = merged.groups;
  if (groups.length === 0) {
    redirect(
      `/tickets/new?error=${encodeURIComponent(
        [...result.warnings, ...(booking?.warnings ?? [])][0] ?? "No ticket numbers were found",
      )}`,
    );
  }

  let contactId = parsed.data.contactId || null;
  const quotationId = parsed.data.quotationId || null;
  if (quotationId) {
    const quotation = await prisma.quotation.findUnique({
      where: { id: quotationId },
      select: { id: true, contactId: true },
    });
    if (!quotation) redirect("/tickets/new?error=Quotation%20not%20found");
    contactId = contactId ?? quotation.contactId;
  }
  if (contactId) {
    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
      select: { id: true, archivedAt: true },
    });
    if (!contact) redirect("/tickets/new?error=Customer%20not%20found");
    if (contact.archivedAt) redirect("/tickets/new?error=That%20customer%20is%20archived");
  }

  const allNumbers = groups.flatMap((group) =>
    [group.primary.number, group.secondary?.number].filter(
      (number): number is string => Boolean(number),
    ),
  );
  const existing = await prisma.ticket.findMany({
    where: {
      OR: [
        { number: { in: allNumbers } },
        { secondaryNumber: { in: allNumbers } },
      ],
    },
    select: { number: true, secondaryNumber: true },
  });
  const existingNumbers = new Set(
    existing.flatMap((ticket) =>
      [ticket.number, ticket.secondaryNumber].filter(
        (number): number is string => Boolean(number),
      ),
    ),
  );
  const fresh = groups.filter(
    (group) =>
      !existingNumbers.has(group.primary.number) &&
      !(group.secondary && existingNumbers.has(group.secondary.number)),
  );

  await prisma.$transaction(async (tx) => {
    for (const group of fresh) {
      const ticket = group.primary;
      await tx.ticket.create({
        data: {
          number: ticket.number,
          secondaryNumber: group.secondary?.number ?? null,
          passengerName: ticket.passengerName,
          bookingRef: parsed.data.bookingRef || group.bookingRef || null,
          checkInRef: parsed.data.checkInRef || group.checkInRef || null,
          secondaryCheckInRef:
            parsed.data.secondaryCheckInRef || group.secondaryCheckInRef || null,
          secondaryCarrier: parsed.data.secondaryCarrier || group.secondaryCarrier || null,
          contactId,
          quotationId,
          issueDate: ticket.issueDate
            ? new Date(`${ticket.issueDate}T00:00:00.000Z`)
            : null,
          formOfPayment: ticket.formOfPayment || null,
          pseudo: ticket.pseudo || null,
          platingCarrier: group.platingCarrier || ticket.platingCarrier || null,
          iso: ticket.iso || null,
          iata: ticket.iata || null,
          rawText: ticket.rawText,
          createdById: user.id,
          coupons: {
            create: group.coupons.map((coupon, position) => ({
              position,
              useType: coupon.useType,
              carrier: coupon.carrier,
              flightNo: coupon.flightNo,
              bookingClass: coupon.bookingClass,
              cabin: coupon.cabin ?? null,
              travelDate: coupon.travelDate ?? null,
              fromIata: coupon.fromIata,
              toIata: coupon.toIata,
              departTime: coupon.departTime,
              arriveTime: coupon.arriveTime ?? null,
              fromTerminal: coupon.fromTerminal ?? null,
              toTerminal: coupon.toTerminal ?? null,
              aircraft: coupon.aircraft ?? null,
              stopInfo: coupon.stopInfo ?? null,
              meal: coupon.meal ?? null,
              status: coupon.status,
              fareBasis: coupon.fareBasis ?? null,
              coupon: coupon.coupon ?? null,
              notValidBefore: coupon.notValidBefore ?? null,
              notValidAfter: coupon.notValidAfter ?? null,
              baggage: coupon.baggage ?? null,
              raw: coupon.raw,
            })),
          },
        },
      });
    }
    if (fresh.length > 0) {
      await audit(tx, {
        userId: user.id,
        action: "createTickets",
        entity: "Ticket",
        entityId: fresh.map((group) => group.primary.number).join(","),
        after: {
          count: fresh.length,
          numbers: fresh.map((group) => group.primary.number),
          secondaryNumbers: fresh.map((group) => group.secondary?.number).filter(Boolean),
          contactId,
          quotationId,
          bookingRef: parsed.data.bookingRef || groups[0]?.bookingRef,
          flights: groups[0]?.coupons.length ?? 0,
          applyItineraryToAll: parsed.data.applyItineraryToAll,
        },
      });
    }
  });

  revalidatePath("/tickets");
  redirect(`/tickets?saved=${fresh.length}&skipped=${groups.length - fresh.length}`);
}
