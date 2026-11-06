import {
  carrierForTicketNumber,
  type BookingDocument,
  type BookingFlight,
} from "./booking";
import {
  groupParsedTickets,
  type ParsedTicket,
  type ParsedTicketCoupon,
} from "./parse";

export interface MergedTicketGroup {
  primary: ParsedTicket;
  secondary?: ParsedTicket;
  coupons: ParsedTicketCoupon[];
  bookingRef?: string;
  checkInRef?: string;
  secondaryCheckInRef?: string;
  secondaryCarrier?: string;
  platingCarrier?: string;
}

export interface MergeTicketSourcesResult {
  groups: MergedTicketGroup[];
  warnings: string[];
}

function hasGivenName(name: string): boolean {
  const given = name.split("/")[1]?.trim();
  return Boolean(given);
}

function preferPassengerName(gdsName: string, bookingName: string): string {
  if (hasGivenName(gdsName) && !hasGivenName(bookingName)) return gdsName;
  if (hasGivenName(bookingName) && !hasGivenName(gdsName)) return bookingName;
  return bookingName.length > gdsName.length ? bookingName : gdsName;
}

function bookingCoupons(flights: BookingFlight[]): ParsedTicketCoupon[] {
  return flights.map((flight, index) => ({
    useType: "ARPT",
    carrier: flight.carrier,
    flightNo: flight.flightNo,
    bookingClass: flight.bookingClass ?? "",
    cabin: flight.cabin,
    travelDate: flight.travelDate,
    fromIata: flight.fromIata,
    toIata: flight.toIata,
    departTime: flight.departTime,
    arriveTime: flight.arriveTime,
    fromTerminal: flight.fromTerminal,
    toTerminal: flight.toTerminal,
    status: flight.status ?? "OK",
    baggage: flight.baggage,
    aircraft: flight.aircraft,
    stopInfo: flight.stopInfo,
    meal: flight.meal,
    coupon: String(index + 1),
    raw: [
      flight.carrier,
      flight.flightNo,
      flight.fromIata,
      flight.toIata,
      flight.travelDate,
      flight.departTime,
      flight.arriveTime,
    ]
      .filter(Boolean)
      .join(" "),
  }));
}

/** Pick the ticket stock that matches the first operating carrier first. */
function orderTicketNumbers(ticketNumbers: string[], carrier: string | undefined): string[] {
  if (!carrier) return ticketNumbers;
  return [...ticketNumbers].sort((left, right) => {
    const leftMatch = carrierForTicketNumber(left) === carrier ? 0 : 1;
    const rightMatch = carrierForTicketNumber(right) === carrier ? 0 : 1;
    return leftMatch - rightMatch;
  });
}

function referenceFor(checkInRefs: { carrier: string; reference: string }[], carrier?: string) {
  if (!carrier) return undefined;
  return checkInRefs.find((ref) => ref.carrier.toUpperCase() === carrier.toUpperCase())?.reference;
}

/**
 * Merge the ticket block/list with the airline booking confirmation.
 *
 * The ticket source decides names, issue details and which stock is primary;
 * the booking confirmation supplies the full itinerary, booking references and
 * any second ticket number that the ticket list did not carry.
 */
export function mergeTicketSources(
  parsedTickets: ParsedTicket[],
  booking: BookingDocument | null,
  applyItineraryToAll = true,
): MergeTicketSourcesResult {
  const warnings: string[] = [];
  const grouped = groupParsedTickets(parsedTickets);
  warnings.push(...grouped.warnings);

  const groups: MergedTicketGroup[] = grouped.groups.map((group) => ({
    primary: group.primary,
    secondary: group.secondary,
    coupons: group.primary.coupons,
    platingCarrier:
      group.primary.platingCarrier ?? carrierForTicketNumber(group.primary.number),
    secondaryCarrier: carrierForTicketNumber(group.secondary?.number ?? ""),
  }));

  if (!booking) {
    const itinerarySource = groups.find((group) => group.coupons.length > 0);
    if (applyItineraryToAll && itinerarySource) {
      for (const group of groups) group.coupons = itinerarySource.coupons;
    }
    return { groups, warnings };
  }

  const flights = booking.flights;
  const coupons = bookingCoupons(flights);
  const hasItinerary = coupons.length > 0;
  const firstCarrier = flights[0]?.carrier;

  // A booking confirmation can be the only source: it carries both ticket
  // numbers for every passenger.
  if (groups.length === 0) {
    for (const passenger of booking.passengers) {
      const [primaryNumber, secondaryNumber] = orderTicketNumbers(
        passenger.ticketNumbers,
        firstCarrier,
      );
      if (!primaryNumber) continue;
      groups.push({
        primary: {
          number: primaryNumber,
          passengerName: passenger.name,
          coupons: applyItineraryToAll && hasItinerary ? coupons : [],
          rawText: booking.rawText ?? passenger.name,
        },
        secondary: secondaryNumber
          ? {
              number: secondaryNumber,
              passengerName: passenger.name,
              coupons: [],
              rawText: passenger.name,
            }
          : undefined,
        coupons: applyItineraryToAll ? coupons : [],
        platingCarrier: carrierForTicketNumber(primaryNumber) ?? firstCarrier,
        secondaryCarrier: secondaryNumber
          ? carrierForTicketNumber(secondaryNumber)
          : undefined,
      });
    }
  } else {
    const usedPassengers = new Set<number>();

    for (const group of groups) {
      const numbers = [group.primary.number, group.secondary?.number].filter(
        (number): number is string => Boolean(number),
      );
      const passengerIndex = booking.passengers.findIndex((passenger) =>
        passenger.ticketNumbers.some((number) => numbers.includes(number)),
      );
      const passenger = booking.passengers[passengerIndex];

      if (passenger && passengerIndex >= 0) {
        usedPassengers.add(passengerIndex);
        const name = preferPassengerName(group.primary.passengerName, passenger.name);
        group.primary = { ...group.primary, passengerName: name };
        if (group.secondary) group.secondary = { ...group.secondary, passengerName: name };
        if (!group.secondary) {
          const secondaryNumber = passenger.ticketNumbers.find(
            (number) => number !== group.primary.number,
          );
          if (secondaryNumber) {
            group.secondary = {
              number: secondaryNumber,
              passengerName: name,
              coupons: [],
              rawText: name,
            };
          }
        }
      }
    }

    // Booking passengers that were not in the ticket text still become tickets.
    booking.passengers.forEach((passenger, index) => {
      if (usedPassengers.has(index)) return;
      const [primaryNumber, secondaryNumber] = orderTicketNumbers(
        passenger.ticketNumbers,
        firstCarrier,
      );
      if (!primaryNumber) return;
      groups.push({
        primary: {
          number: primaryNumber,
          passengerName: passenger.name,
          coupons: applyItineraryToAll && hasItinerary ? coupons : [],
          rawText: booking.rawText ?? passenger.name,
        },
        secondary: secondaryNumber
          ? {
              number: secondaryNumber,
              passengerName: passenger.name,
              coupons: [],
              rawText: passenger.name,
            }
          : undefined,
        coupons: applyItineraryToAll ? coupons : [],
        platingCarrier: carrierForTicketNumber(primaryNumber) ?? firstCarrier,
        secondaryCarrier: secondaryNumber
          ? carrierForTicketNumber(secondaryNumber)
          : undefined,
      });
    });
  }

  // Apply the booking itinerary. The confirmation describes one group
  // itinerary, so "apply to all" is the normal case.
  if (hasItinerary) {
    if (applyItineraryToAll) {
      for (const group of groups) group.coupons = coupons;
    } else if (groups[0]) {
      groups[0].coupons = coupons;
    }
  }

  for (const group of groups) {
    const primaryCarrier =
      group.platingCarrier ??
      carrierForTicketNumber(group.primary.number) ??
      firstCarrier;
    const secondaryCarrier =
      group.secondaryCarrier ??
      (group.secondary ? carrierForTicketNumber(group.secondary.number) : undefined);

    group.platingCarrier = primaryCarrier;
    group.secondaryCarrier = secondaryCarrier;
    group.bookingRef = booking.reference;
    group.checkInRef = referenceFor(booking.checkInRefs, primaryCarrier);
    group.secondaryCheckInRef = referenceFor(booking.checkInRefs, secondaryCarrier);
  }

  return { groups, warnings };
}
