"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { parseTickets } from "@/lib/tickets/parse";
import { audit } from "@/server/audit";
import { prisma } from "@/server/db";
import { actionUser } from "@/server/guard";

const importSchema = z.object({
  text: z.string().trim().min(5, "Paste the e-ticket output first").max(200_000),
  contactId: z.string().trim().max(64).optional().default(""),
  quotationId: z.string().trim().max(64).optional().default(""),
});

export async function createTicketsAction(formData: FormData): Promise<void> {
  const user = await actionUser("manageDocuments");
  const parsed = importSchema.safeParse({
    text: formData.get("text") ?? "",
    contactId: formData.get("contactId") ?? "",
    quotationId: formData.get("quotationId") ?? "",
  });
  if (!parsed.success) {
    redirect(`/tickets/new?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Check the ticket text")}`);
  }

  const result = parseTickets(parsed.data.text);
  if (result.tickets.length === 0) {
    redirect(`/tickets/new?error=${encodeURIComponent(result.warnings[0] ?? "No ticket numbers were found")}`);
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

  const existing = await prisma.ticket.findMany({
    where: { number: { in: result.tickets.map((ticket) => ticket.number) } },
    select: { number: true },
  });
  const existingNumbers = new Set(existing.map((ticket) => ticket.number));
  const fresh = result.tickets.filter((ticket) => !existingNumbers.has(ticket.number));

  await prisma.$transaction(async (tx) => {
    for (const ticket of fresh) {
      await tx.ticket.create({
        data: {
          number: ticket.number,
          passengerName: ticket.passengerName,
          contactId,
          quotationId,
          issueDate: ticket.issueDate
            ? new Date(`${ticket.issueDate}T00:00:00.000Z`)
            : null,
          formOfPayment: ticket.formOfPayment || null,
          pseudo: ticket.pseudo || null,
          platingCarrier: ticket.platingCarrier || null,
          iso: ticket.iso || null,
          iata: ticket.iata || null,
          rawText: ticket.rawText,
          createdById: user.id,
          coupons: {
            create: ticket.coupons.map((coupon, position) => ({
              position,
              useType: coupon.useType,
              carrier: coupon.carrier,
              flightNo: coupon.flightNo,
              bookingClass: coupon.bookingClass,
              travelDate: coupon.travelDate ?? null,
              fromIata: coupon.fromIata,
              toIata: coupon.toIata,
              departTime: coupon.departTime,
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
        entityId: fresh.map((ticket) => ticket.number).join(","),
        after: {
          count: fresh.length,
          numbers: fresh.map((ticket) => ticket.number),
          contactId,
          quotationId,
        },
      });
    }
  });

  revalidatePath("/tickets");
  redirect(`/tickets?saved=${fresh.length}&skipped=${existingNumbers.size}`);
}
