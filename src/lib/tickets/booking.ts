/**
 * Deterministic parser for an airline booking confirmation, such as the
 * "E-Ticket & Itinerary Details" document issued by Kenya Airways.
 *
 * The GDS ticket block only carries coupon data. Arrival times, terminals,
 * aircraft, meal service and baggage come from the booking confirmation. This
 * parser reads either the layout-preserved text or the raw text order, and
 * never guesses a value that is not present.
 */

export interface BookingPassenger {
  name: string;
  ticketNumbers: string[];
}

export interface BookingFlight {
  carrier: string;
  flightNo: string;
  fromIata: string;
  toIata: string;
  fromTerminal?: string;
  toTerminal?: string;
  travelDate?: string;
  departTime: string;
  arriveTime?: string;
  cabin?: string;
  bookingClass?: string;
  status?: string;
  aircraft?: string;
  stopInfo?: string;
  meal?: string;
  duration?: string;
  baggage?: string;
}

export interface BookingCheckInRef {
  carrier: string;
  reference: string;
}

export interface BookingDocument {
  reference?: string;
  checkInRefs: BookingCheckInRef[];
  passengers: BookingPassenger[];
  flights: BookingFlight[];
  rawText?: string;
}

export interface BookingParseResult extends BookingDocument {
  warnings: string[];
}

const MONTHS: Record<string, number> = {
  JAN: 0,
  FEB: 1,
  MAR: 2,
  APR: 3,
  MAY: 4,
  JUN: 5,
  JUL: 6,
  AUG: 7,
  SEP: 8,
  OCT: 9,
  NOV: 10,
  DEC: 11,
};

const LONG_DATE_RE =
  /\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s*(\d{2})\s+([A-Za-z]{3})\s+(\d{4}),\s*(\d{2}:\d{2})\b/g;

const AIRPORT_CODE_RE = /\(([A-Z]{3})\)/g;

/** True when the text looks like an airline booking confirmation. */
export function isBookingDocument(text: string): boolean {
  return /FLIGHT DETAILS/i.test(text) && /PASSENGER DETAILS/i.test(text);
}

function isoDate(year: number, month: number, day: number): string | undefined {
  const date = new Date(Date.UTC(year, month, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month || date.getUTCDate() !== day) {
    return undefined;
  }
  return date.toISOString().slice(0, 10);
}

function parseLongDate(day: string, monthName: string, year: string, time: string): {
  date?: string;
  time: string;
} {
  const month = MONTHS[monthName.toUpperCase()];
  return {
    date: month === undefined ? undefined : isoDate(Number(year), month, Number(day)),
    time,
  };
}

function clean(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function section(text: string, start: RegExp, stops: RegExp[]): string {
  const match = start.exec(text);
  if (!match) return "";
  const from = match.index + match[0].length;
  const rest = text.slice(from);
  let end = rest.length;
  for (const stop of stops) {
    const found = stop.exec(rest);
    if (found && found.index < end) end = found.index;
  }
  return rest.slice(0, end);
}

interface AirportPair {
  start: number;
  fromIata: string;
  toIata: string;
}

/**
 * Airports are printed as a pair for each flight. In layout text both codes are
 * on one line; in raw text one code is on each of two consecutive lines.
 */
function airportPairs(flightSection: string): AirportPair[] {
  const pairs: AirportPair[] = [];
  let offset = 0;
  let pending: { code: string; start: number } | null = null;

  for (const line of flightSection.split("\n")) {
    const codes = [...line.matchAll(AIRPORT_CODE_RE)].map((match) => match[1]!);
    if (codes.length >= 2) {
      pairs.push({ start: offset + line.indexOf("("), fromIata: codes[0]!, toIata: codes[1]! });
      pending = null;
    } else if (codes.length === 1) {
      if (pending) {
        pairs.push({ start: pending.start, fromIata: pending.code, toIata: codes[0]! });
        pending = null;
      } else {
        pending = { code: codes[0]!, start: offset };
      }
    }
    offset += line.length + 1;
  }

  return pairs;
}

const PASSENGER_HEADER =
  /^(Passenger Type|Last Name\/First|Name|Loyalty Program|Disabilities|Electronic Ticket nbr)$/i;

function parsePassengers(text: string): BookingPassenger[] {
  const body = section(text, /PASSENGER DETAILS/i, [/BOOKING DETAILS/i]);
  if (!body) return [];

  const passengers: BookingPassenger[] = [];
  let nameLines: string[] = [];
  let numbers: string[] = [];

  const flush = () => {
    if (nameLines.length > 0 && numbers.length > 0) {
      // The first line holds the surname, the remainder the given names. The
      // airline list uses SURNAME/GIVEN, so keep that shape where we can.
      const name =
        nameLines.length === 1
          ? nameLines[0]!
          : `${nameLines[0]!}/${nameLines.slice(1).join(" ")}`;
      passengers.push({
        name: name.replace(/\s*\/\s*/g, "/").trim(),
        ticketNumbers: [...new Set(numbers)],
      });
    }
    nameLines = [];
    numbers = [];
  };

  for (const line of body.split("\n")) {
    const ticketNumbers = [...line.matchAll(/\b(\d{13})\b/g)].map((match) => match[1]!);
    const withoutNumbers = line
      .replace(/\b\d{13}\b/g, " ")
      .replace(/\s+/g, " ")
      .replace(/^[-–—\s]+|[-–—\s]+$/g, "")
      .trim();

    const isHeader =
      PASSENGER_HEADER.test(withoutNumbers) ||
      (/Passenger Type/i.test(withoutNumbers) && /Electronic Ticket nbr/i.test(withoutNumbers));
    if (isHeader) {
      if (numbers.length === 0) nameLines = [];
      continue;
    }

    if (withoutNumbers && !/^[-–—]+$/.test(withoutNumbers)) {
      nameLines.push(withoutNumbers);
    }
    numbers.push(...ticketNumbers);

    if (line.trim() === "" && numbers.length > 0) flush();
  }
  flush();

  return passengers;
}

function parseBookingReferences(text: string): {
  reference?: string;
  checkInRefs: BookingCheckInRef[];
} {
  const body = section(text, /BOOKING DETAILS/i, [/FLIGHT DETAILS/i]);
  const references = [...body.matchAll(/\b([A-Z]{2})\/([A-Z0-9]{4,10})\b/g)].map((match) => ({
    carrier: match[1]!,
    reference: match[2]!,
  }));

  // The agency reference is the six-character code after the agency number and
  // before the carrier check-in references (for example JMC9NY).
  const flat = clean(body);
  const anchored = /(?:^|\s)([A-Z0-9]{5,8})\s+[A-Z]{2}\/[A-Z0-9]{4,10}/.exec(flat);
  const reference = anchored?.[1] && /[A-Z]/.test(anchored[1]) ? anchored[1] : undefined;

  return {
    reference: reference && !/^\d+$/.test(reference) ? reference : undefined,
    checkInRefs: [...new Map(references.map((ref) => [ref.carrier, ref])).values()],
  };
}

function parseBaggage(text: string): Map<string, string> {
  const body = section(text, /BAGGAGE AND CARRY ON ALLOWANCE/i, [/REMARK INFORMATION/i]);
  if (!body) return new Map();

  const allowance = body.split(/Carry On Allowance/i)[0] ?? body;
  const entries = new Map<string, string>();
  const routeRe = /\b([A-Z]{3})\s*-\s*([A-Z]{3})\b/g;
  const positions = [...allowance.matchAll(routeRe)];

  positions.forEach((match, index) => {
    const from = match[1]!;
    const to = match[2]!;
    const start = match.index + match[0].length;
    const end = positions[index + 1]?.index ?? allowance.length;
    const detail = clean(allowance.slice(start, end));

    const pieces = (detail.match(/Checked Bag/gi) ?? []).length;
    const weight = /UPTO\d+LB\/(\d+)KG/i.exec(detail)?.[1];
    const note = /CHGS MAY APPLY/i.test(detail);

    let label: string | undefined;
    if (pieces >= 2 && weight && !note) label = `2 x ${weight}KG`;
    else if (pieces >= 2) label = "2 pcs";
    else if (pieces === 1 && weight) label = `1 x ${weight}KG`;
    else if (pieces === 1) label = "1 pc";

    if (label) entries.set(`${from}-${to}`, label);
  });

  return entries;
}

function terminalValues(window: string): [string | undefined, string | undefined] {
  const values: string[] = [];
  const re = /Terminal[ \t]*:[ \t]*([A-Z0-9]{0,4})(?=[ \t]{2,}|[ \t]*$)/gm;
  for (const match of window.matchAll(re)) {
    values.push(match[1] ?? "");
    if (values.length === 2) break;
  }
  return [values[0] || undefined, values[1] || undefined];
}

function bookingClass(window: string): string | undefined {
  const sameLine = /Booking Class[ \t]+([A-Z])(?=\s|$)/.exec(window);
  if (sameLine) return sameLine[1];
  // Raw text order can put "In Flight Service" between the label and value.
  const nextLines = /Booking Class[\s\S]{0,120}?\n[ \t]*([A-Z])[ \t]*\n/.exec(window);
  return nextLines?.[1];
}

function mealService(window: string): string | undefined {
  const index = window.search(/In Flight Service/i);
  if (index === -1) return undefined;
  const nearby = window.slice(index, index + 180);
  const meal = /\b(Meal|Snack|Breakfast|Lunch|Dinner|Refreshment)\b/i.exec(nearby);
  return meal ? meal[1]![0]!.toUpperCase() + meal[1]!.slice(1).toLowerCase() : undefined;
}

function stopInformation(window: string): string | undefined {
  const lines = window.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^\s*Stop\s*:\s*(.+)$/i.exec(lines[index]!);
    if (!match) continue;
    const value = clean(match[1]!.split(/\s{2,}/)[0] ?? "");
    if (/^\d+$/.test(value)) {
      const next = lines.slice(index + 1).map((line) => clean(line)).find(Boolean);
      if (next && !next.includes(":") && next.length < 40) return `${value} (${next})`;
    }
    return value;
  }
  return undefined;
}

function parseFlights(
  text: string,
  baggage: Map<string, string>,
): BookingDocument["flights"] {
  const flightSection = section(text, /FLIGHT DETAILS/i, [
    /PASSENGER'S OTHER DETAILS/i,
    /BAGGAGE AND CARRY ON ALLOWANCE/i,
    /REMARK INFORMATION/i,
  ]);
  if (!flightSection) return [];

  const pairs = airportPairs(flightSection);
  const flights: BookingFlight[] = [];

  for (let index = 0; index < pairs.length; index += 1) {
    const pair = pairs[index]!;
    const end = pairs[index + 1]?.start ?? flightSection.length;
    const window = flightSection.slice(pair.start, end);

    const designator = /^\s*([A-Z]{2})\s+(\d{1,4})\b/m.exec(window);
    if (!designator) continue;

    const dates = [...window.matchAll(LONG_DATE_RE)].map((match) =>
      parseLongDate(match[1]!, match[2]!, match[3]!, match[4]!),
    );
    const departure = dates[0];
    if (!departure) continue;

    const [fromTerminal, toTerminal] = terminalValues(window);
    const aircraft = /Aircraft\s*:\s*([^\n]+)/i
      .exec(window)?.[1]
      ?.split(/\s{2,}/)[0]
      ?.trim()
      ?.replace(/^DHC8\b/i, "DHC-8");

    flights.push({
      carrier: designator[1]!,
      flightNo: designator[2]!,
      fromIata: pair.fromIata,
      toIata: pair.toIata,
      fromTerminal,
      toTerminal,
      travelDate: departure.date,
      departTime: departure.time,
      arriveTime: dates[1]?.time,
      cabin: /Cabin\s+([A-Za-z]+)/i.exec(window)?.[1],
      bookingClass: bookingClass(window),
      status: /Status\s+([A-Za-z]+)/i.exec(window)?.[1],
      aircraft,
      stopInfo: stopInformation(window),
      meal: mealService(window),
      duration: /Duration\s*:\s*([0-9]{1,2}h\s*[0-9]{1,2}m)/i.exec(window)?.[1],
    });
  }

  assignBaggage(flights, baggage);
  return flights;
}

function minutesBetween(
  date: string | undefined,
  fromTime: string | undefined,
  toDate: string | undefined,
  toTime: string | undefined,
): number | null {
  if (!date || !fromTime || !toTime) return null;
  const from = new Date(`${date}T${fromTime}:00Z`);
  let target = toDate ?? date;
  if (target === date && toTime < fromTime) {
    const next = new Date(from.getTime() + 24 * 60 * 60 * 1000);
    target = next.toISOString().slice(0, 10);
  }
  const to = new Date(`${target}T${toTime}:00Z`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
  return (to.getTime() - from.getTime()) / 60000;
}

/**
 * Baggage is sold per ticket journey, not per coupon. Group each carrier's
 * flights into runs and match the run's origin and destination to the baggage
 * table (for example LLW-DAR and DAR-DOD).
 */
function assignBaggage(flights: BookingFlight[], baggage: Map<string, string>): void {
  if (baggage.size === 0) return;

  const runs: BookingFlight[][] = [];
  for (const flight of flights) {
    const previous = runs[runs.length - 1]?.[runs[runs.length - 1]!.length - 1];
    const sameCarrier = previous?.carrier === flight.carrier;
    const gap = previous
      ? minutesBetween(previous.travelDate, previous.arriveTime, flight.travelDate, flight.departTime)
      : null;
    if (!previous || !sameCarrier || gap === null || gap > 24 * 60) {
      runs.push([flight]);
    } else {
      runs[runs.length - 1]!.push(flight);
    }
  }

  for (const run of runs) {
    const from = run[0]!.fromIata;
    const to = run[run.length - 1]!.toIata;
    const allowance = baggage.get(`${from}-${to}`);
    if (!allowance) continue;
    for (const flight of run) flight.baggage = allowance;
  }
}

export function parseBookingDocument(text: string): BookingParseResult {
  const warnings: string[] = [];
  if (!isBookingDocument(text)) {
    warnings.push(
      "The booking confirmation was not recognised. Paste the airline E-Ticket & Itinerary Details text.",
    );
    return { checkInRefs: [], passengers: [], flights: [], warnings };
  }

  const passengers = parsePassengers(text);
  if (passengers.length === 0) {
    warnings.push("No passenger or ticket numbers were found in the booking confirmation.");
  }

  const { reference, checkInRefs } = parseBookingReferences(text);
  const baggage = parseBaggage(text);
  const flights = parseFlights(text, baggage);

  if (flights.length === 0) {
    warnings.push("No flights were found in the booking confirmation.");
  }

  return { reference, checkInRefs, passengers, flights, rawText: text.trim(), warnings };
}

/**
 * Best-effort map from an airline accounting prefix to its IATA code. Only used
 * to decide which of two ticket numbers belongs in the primary column when the
 * import has no GDS coupon block to say which stock was plated first.
 */
const TICKET_PREFIX_CARRIERS: Record<string, string> = {
  "071": "ET",
  "157": "QR",
  "176": "EK",
  "197": "TC",
  "459": "WB",
  "706": "KQ",
};

export function carrierForTicketNumber(number: string): string | undefined {
  return TICKET_PREFIX_CARRIERS[number.replace(/\D/g, "").slice(0, 3)];
}
