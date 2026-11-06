import type { Prisma } from "@/generated/prisma/client";
import { toDateInput } from "@/lib/dates";
import type { TicketSnapshot } from "@/lib/documents";
import { prisma } from "@/server/db";
import { companySnapshot, contactSnapshot } from "@/server/documents";
import type { AppSettings } from "@/server/settings";

export const ticketInclude = {
  coupons: { orderBy: { position: "asc" } },
  contact: true,
  quotation: { select: { id: true, number: true } },
} satisfies Prisma.TicketInclude;

export type TicketWithRelations = Prisma.TicketGetPayload<{
  include: typeof ticketInclude;
}>;

export async function loadTicket(id: string): Promise<TicketWithRelations | null> {
  return prisma.ticket.findUnique({ where: { id }, include: ticketInclude });
}

export function buildTicketSnapshot(
  ticket: TicketWithRelations,
  settings: AppSettings,
): TicketSnapshot {
  return {
    kind: "ticket",
    number: ticket.number,
    passengerName: ticket.passengerName,
    issueDate: toDateInput(ticket.issueDate ?? ticket.createdAt),
    template: settings.quotationTemplate,
    company: companySnapshot(settings),
    contact: ticket.contact ? contactSnapshot(ticket.contact) : undefined,
    formOfPayment: ticket.formOfPayment ?? undefined,
    pseudo: ticket.pseudo ?? undefined,
    platingCarrier: ticket.platingCarrier ?? undefined,
    iso: ticket.iso ?? undefined,
    iata: ticket.iata ?? undefined,
    coupons: ticket.coupons.map((coupon) => ({
      position: coupon.position,
      useType: coupon.useType,
      carrier: coupon.carrier,
      flightNo: coupon.flightNo,
      bookingClass: coupon.bookingClass,
      travelDate: coupon.travelDate ?? undefined,
      fromIata: coupon.fromIata,
      toIata: coupon.toIata,
      departTime: coupon.departTime,
      status: coupon.status,
      fareBasis: coupon.fareBasis ?? undefined,
      coupon: coupon.coupon ?? undefined,
      notValidBefore: coupon.notValidBefore ?? undefined,
      notValidAfter: coupon.notValidAfter ?? undefined,
      baggage: coupon.baggage ?? undefined,
    })),
    createdAt: ticket.createdAt.toISOString(),
  };
}
