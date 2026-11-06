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

export async function buildTicketSnapshot(
  ticket: TicketWithRelations,
  settings: AppSettings,
): Promise<TicketSnapshot> {
  const airportCodes = [
    ...new Set(ticket.coupons.flatMap((coupon) => [coupon.fromIata, coupon.toIata])),
  ];
  const carrierCodes = [
    ...new Set(
      [
        ticket.platingCarrier,
        ticket.secondaryCarrier,
        ...ticket.coupons.map((coupon) => coupon.carrier),
      ].filter((code): code is string => Boolean(code)),
    ),
  ];
  const [airports, airlines] = await Promise.all([
    prisma.airport.findMany({ where: { iata: { in: airportCodes } } }),
    prisma.airline.findMany({ where: { iata: { in: carrierCodes } } }),
  ]);
  const airportMap = new Map(airports.map((airport) => [airport.iata, airport]));
  const airlineMap = new Map(airlines.map((airline) => [airline.iata, airline]));

  return {
    kind: "ticket",
    number: ticket.number,
    secondaryNumber: ticket.secondaryNumber ?? undefined,
    passengerName: ticket.passengerName,
    issueDate: toDateInput(ticket.issueDate ?? ticket.createdAt),
    template: settings.quotationTemplate,
    company: companySnapshot(settings),
    contact: ticket.contact ? contactSnapshot(ticket.contact) : undefined,
    formOfPayment: ticket.formOfPayment ?? undefined,
    pseudo: ticket.pseudo ?? undefined,
    platingCarrier: ticket.platingCarrier ?? undefined,
    platingCarrierName: ticket.platingCarrier
      ? airlineMap.get(ticket.platingCarrier)?.name
      : undefined,
    secondaryCarrier: ticket.secondaryCarrier ?? undefined,
    secondaryCarrierName: ticket.secondaryCarrier
      ? airlineMap.get(ticket.secondaryCarrier)?.name
      : undefined,
    bookingRef: ticket.bookingRef ?? undefined,
    checkInRef: ticket.checkInRef ?? undefined,
    secondaryCheckInRef: ticket.secondaryCheckInRef ?? undefined,
    iso: ticket.iso ?? undefined,
    iata: ticket.iata ?? undefined,
    coupons: ticket.coupons.map((coupon) => {
      const from = airportMap.get(coupon.fromIata);
      const to = airportMap.get(coupon.toIata);
      return {
        position: coupon.position,
        useType: coupon.useType,
        carrier: coupon.carrier,
        carrierName: airlineMap.get(coupon.carrier)?.name,
        flightNo: coupon.flightNo,
        bookingClass: coupon.bookingClass,
        cabin: coupon.cabin ?? undefined,
        travelDate: coupon.travelDate ?? undefined,
        fromIata: coupon.fromIata,
        fromName: from?.name,
        fromCity: from?.city,
        fromTerminal: coupon.fromTerminal ?? undefined,
        toIata: coupon.toIata,
        toName: to?.name,
        toCity: to?.city,
        toTerminal: coupon.toTerminal ?? undefined,
        departTime: coupon.departTime,
        arriveTime: coupon.arriveTime ?? undefined,
        status: coupon.status,
        fareBasis: coupon.fareBasis ?? undefined,
        coupon: coupon.coupon ?? undefined,
        notValidBefore: coupon.notValidBefore ?? undefined,
        notValidAfter: coupon.notValidAfter ?? undefined,
        baggage: coupon.baggage ?? undefined,
        aircraft: coupon.aircraft ?? undefined,
        stopInfo: coupon.stopInfo ?? undefined,
        meal: coupon.meal ?? undefined,
      };
    }),
    createdAt: ticket.createdAt.toISOString(),
  };
}
