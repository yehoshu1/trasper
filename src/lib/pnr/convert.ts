import { DateTime } from "luxon";

import {
  pnrConvertInputSchema,
  pnrConvertResultSchema,
  type AiItineraryProposal,
  type PnrConvertResult,
} from "../schemas";
import { parsePnr, type ParsedPassenger, type ParsedPnr, type ParsedSegment } from "./index";

/**
 * Deterministic PNR normaliser.
 *
 * It accepts either booking-system output (Amadeus/Sabre/Galileo lines) or a
 * human itinerary, and returns one canonical PNR-shaped block. No model is
 * involved: every segment must come from the text, and the result is checked
 * with Zod and re-parsed before it is returned.
 */

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const MONTH_RE = "JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC";
const TITLES = new Set(["MR", "MRS", "MS", "MISS", "DR", "MSTR", "PROF"]);
const STOP_WORDS = new Set([
  "THE",
  "AND",
  "FROM",
  "TO",
  "DEP",
  "ARR",
  "DEPART",
  "DEPARTURE",
  "ARRIVE",
  "ARRIVAL",
  "FLIGHT",
  "DAY",
  "TIME",
  "PAX",
  "PASSENGER",
  "PASSENGERS",
  "TICKET",
  "TICKETING",
  "AIRLINE",
  "AIRPORT",
  "TERMINAL",
  "NEXT",
  "ECONOMY",
  "BUSINESS",
  "CABIN",
  "CLASS",
]);

// Two-digit minimum avoids treating a day marker ("SU 2") as a flight.
const FLIGHT_RE = /\b([A-Z]{2}|[A-Z]\d|\d[A-Z])\s*[- ]?\s*(\d{2,4}|X{3})\b/;
const MONTH_DATE_RE = new RegExp(`\\b(\\d{1,2})\\s*(${MONTH_RE})\\s*(\\d{4}|\\d{2})?\\b`, "i");
const MONTH_FIRST_RE = new RegExp(`\\b(${MONTH_RE})\\s+(\\d{1,2}),?\\s+(\\d{4})\\b`, "i");
const PNR_LINE_RE =
  /(?:^|\n)\s*\d{1,2}[.)]?\s+[A-Z0-9]{2}\s*[A-Z0-9]{1,4}\s+[A-Z]\s+\d{1,2}[A-Z]{3}/i;

interface DateMatch {
  date: string;
  raw: string;
}

function isRealDate(year: number, month: number, day: number): boolean {
  return DateTime.fromObject({ year, month, day }, { zone: "utc" }).isValid;
}

function readDate(text: string, referenceYear: number): DateMatch | null {
  const iso = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(text);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    if (isRealDate(year, month, day)) {
      return {
        date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
        raw: iso[0],
      };
    }
  }

  const numeric = /\b(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})\b/.exec(text);
  if (numeric) {
    const first = Number(numeric[1]);
    const second = Number(numeric[2]);
    const dayFirst = first > 12 || second <= 12;
    const day = dayFirst ? first : second;
    const month = dayFirst ? second : first;
    let year = Number(numeric[3]);
    if (year < 100) year += 2000;
    if (isRealDate(year, month, day)) {
      return {
        date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
        raw: numeric[0],
      };
    }
  }

  const monthDate = MONTH_DATE_RE.exec(text);
  if (monthDate) {
    const day = Number(monthDate[1]);
    const month = MONTHS.indexOf(monthDate[2].toUpperCase()) + 1;
    let year = monthDate[3] ? Number(monthDate[3]) : referenceYear;
    if (year < 100) year += 2000;
    if (isRealDate(year, month, day)) {
      return {
        date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
        raw: monthDate[0],
      };
    }
  }

  const monthFirst = MONTH_FIRST_RE.exec(text);
  if (monthFirst) {
    const month = MONTHS.indexOf(monthFirst[1].toUpperCase()) + 1;
    const day = Number(monthFirst[2]);
    const year = Number(monthFirst[3]);
    if (isRealDate(year, month, day)) {
      return {
        date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
        raw: monthFirst[0],
      };
    }
  }

  return null;
}

function readTimes(text: string, dateRaw: string, flightRaw: string): [string, string] | null {
  const clock = [...text.matchAll(/\b([01]?\d|2[0-3]):([0-5]\d)\b/g)].map(
    (match) => `${match[1].padStart(2, "0")}:${match[2]}`,
  );
  if (clock.length >= 2) return [clock[0], clock[1]];

  const remaining = text.replace(dateRaw, " ").replace(flightRaw, " ");
  const compact = [...remaining.matchAll(/\b([01]\d|2[0-3])([0-5]\d)\b/g)].map(
    (match) => `${match[1]}:${match[2]}`,
  );
  if (compact.length >= 2) return [compact[0], compact[1]];
  return null;
}

function addDays(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function dayDifference(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000,
  );
}

function readAirports(
  text: string,
  flight: { airline: string; number: string },
  warnings: string[],
): [string, string] | null {
  const excluded = new Set([
    flight.airline,
    ...MONTHS,
    ...STOP_WORDS,
  ]);

  const parenthesised = [...text.matchAll(/\(([A-Z]{3})\)/g)].map((match) => match[1]);
  if (parenthesised.length >= 2) {
    return [parenthesised[0], parenthesised[1]];
  }

  const route = /\b([A-Z]{3})\s*-\s*([A-Z]{3})\b/.exec(text);
  if (route) return [route[1], route[2]];

  // LLWLUN is a pair of IATA codes; VIENNA is a city name inside parentheses.
  const joined = /(?<![A-Z(-])([A-Z]{6})(?![A-Z)-])/.exec(text);
  if (joined) {
    const candidate = [joined[1].slice(0, 3), joined[1].slice(3)];
    if (candidate.every((code) => !excluded.has(code))) {
      return [candidate[0], candidate[1]];
    }
  }

  const tokens = [...text.matchAll(/\b([A-Z]{3})\b/g)]
    .map((match) => match[1])
    .filter((code) => !excluded.has(code));
  const unique = [...new Set(tokens)];
  if (unique.length >= 2) {
    if (unique.length > 2) {
      warnings.push(
        `Found ${unique.length} airport codes (${unique.join(", ")}); using ${unique[0]} and ${unique[1]}`,
      );
    }
    return [unique[0], unique[1]];
  }
  return null;
}

function parseItinerarySegment(
  block: string,
  referenceYear: number,
  warnings: string[],
): ParsedSegment | null {
  const text = block
    .replace(/[\u2192\u21d2\u2794]/g, "-")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();

  const flight = FLIGHT_RE.exec(text);
  const airlineOnly = flight
    ? null
    : new RegExp(`\\b([A-Z]{2})\\s+(?=\\d{1,2}(?:${MONTH_RE})\\b)`).exec(text);
  if (!flight && !airlineOnly) return null;
  const airline = flight?.[1] ?? airlineOnly?.[1];
  if (!airline) return null;
  const flightNo = flight?.[2] ?? "XXX";
  const flightRaw = flight?.[0] ?? airlineOnly?.[0] ?? airline;
  if (!flight) {
    warnings.push(
      `No flight number in the itinerary for ${airline}; using XXX as the PNR placeholder`,
    );
  }

  const date = readDate(text, referenceYear);
  if (!date) return null;
  const times = readTimes(text, date.raw, flightRaw);
  if (!times) return null;

  const airports = readAirports(text, { airline, number: flightNo }, warnings);
  if (!airports) return null;
  const [fromIata, toIata] = airports;
  if (fromIata === toIata) return null;

  const cabinMatch = new RegExp(
    `${flightRaw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+([YJCFWSP])\\b`,
  ).exec(text);
  const cabin = cabinMatch?.[1];
  const operatedBy = /\bOPERATED BY\s+([A-Z][A-Z ]+?)(?=\s{2,}|\s+\d|$)/.exec(text);

  const [depTime, arrTime] = times;
  const explicitNextDay = /(?:\+\s*(\d)|NEXT\s+DAY|OVERNIGHT)/.exec(text);
  let dayOffset = explicitNextDay?.[1] ? Number(explicitNextDay[1]) : 0;
  if (dayOffset === 0 && arrTime < depTime) {
    dayOffset = 1;
    warnings.push(
      `Arrival ${fromIata}-${toIata} is before departure; assumed the next day`,
    );
  }

  return {
    airline,
    flightNo,
    fromIata,
    toIata,
    departLocal: `${date.date}T${depTime}`,
    arriveLocal: `${addDays(date.date, dayOffset)}T${arrTime}`,
    ...(cabin ? { cabin } : {}),
    ...(operatedBy ? { operatingCarrier: operatedBy[1].trim() } : {}),
    raw: block,
  };
}

function passengerFromText(
  value: string,
  raw: string,
): ParsedPassenger | null {
  const cleaned = value.replace(/\s+/g, " ").trim();
  const typeMatch = /\b(CHD|INF|CNN)\b/i.exec(cleaned);
  const type = typeMatch
    ? /CHD|CNN/i.test(typeMatch[1])
      ? "child"
      : "infant"
    : "adult";
  const name = cleaned.replace(/\b(CHD|INF|CNN)\b/gi, "").trim();

  let title: string | undefined;
  const slash = name.indexOf("/");
  let firstName: string;
  let lastName: string;
  if (slash >= 0) {
    lastName = name.slice(0, slash).trim();
    let rest = name.slice(slash + 1).trim();
    const words = rest.split(" ");
    const suffix = words.at(-1)?.toUpperCase();
    if (suffix && TITLES.has(suffix)) {
      title = suffix;
      rest = words.slice(0, -1).join(" ");
    }
    firstName = rest;
  } else {
    const words = name.split(" ").filter(Boolean);
    const suffix = words.at(-1)?.toUpperCase();
    if (suffix && TITLES.has(suffix)) {
      title = suffix;
      words.pop();
    }
    if (words.length < 2) return null;
    lastName = words.pop() ?? "";
    firstName = words.join(" ");
  }

  if (!/^[A-Za-z][A-Za-z' -]*$/.test(firstName) || !/^[A-Za-z][A-Za-z' -]*$/.test(lastName)) {
    return null;
  }
  return {
    title,
    firstName,
    lastName,
    type,
    raw,
  };
}

function parsePassengers(lines: string[]): { passengers: ParsedPassenger[]; used: Set<number> } {
  const passengers: ParsedPassenger[] = [];
  const used = new Set<number>();
  const seen = new Set<string>();
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const label = /^\s*(?:PAX|PASSENGERS?|TRAVELLERS?|NM\d*)\s*[:\-]\s*(.+)$/i.exec(line);
    if (!label) continue;
    for (const item of label[1].split(/[,;]/)) {
      const parsed = passengerFromText(item, line);
      if (!parsed) continue;
      const key = `${parsed.lastName}/${parsed.firstName}/${parsed.type}`;
      if (seen.has(key)) continue;
      seen.add(key);
      passengers.push(parsed);
    }
    used.add(i);
  }
  return { passengers, used };
}

function parseDeadlineLine(
  text: string,
  referenceYear: number,
): { deadline: string; raw: string } | null {
  const match =
    /(?:TICKETING(?:\s+TIME\s+LIMIT)?|TICKET\s+DEADLINE|TK\s*TL|TKTG?|TL)\s*[:\-]?\s*(\d{1,2})\s*([A-Z]{3})\s*(\d{2,4})?\s*[\/ ]\s*(\d{1,2})[:.]?(\d{2})/i.exec(
      text,
    );
  if (!match) return null;
  const day = Number(match[1]);
  const month = MONTHS.indexOf(match[2].toUpperCase()) + 1;
  let year = match[3] ? Number(match[3]) : referenceYear;
  if (year < 100) year += 2000;
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const dt = DateTime.fromObject({ year, month, day, hour, minute });
  if (!dt.isValid) return null;
  return {
    deadline: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    raw: match[0],
  };
}

interface ItineraryParse {
  segments: ParsedSegment[];
  passengers: ParsedPassenger[];
  ticketingDeadline: string | null;
  unparsed: string[];
  warnings: string[];
}

function looksLikeHeader(line: string): boolean {
  return /^(itinerary|flight itinerary|travel itinerary|outbound|inbound|return|one way|round trip|booking|pnr|notes?|remarks?)\s*:?\s*$/i.test(
    line.trim(),
  );
}

function parseItinerary(text: string, referenceYear: number): ItineraryParse {
  // Some itinerary exports put every numbered segment on one line. Split
  // before "1 . ET", "2 . ET" and similar markers, but not before times.
  const grouped = text.replace(
    /\s+(?=\d{1,2}\s*[.)]\s+(?:[A-Z]{2}|[A-Z]\d|\d[A-Z])\b)/g,
    "\n",
  );
  const lines = grouped
    .split(/\r?\n|;/)
    .map((line) => line.trim())
    .filter(Boolean);
  const warnings: string[] = [];
  const segments: ParsedSegment[] = [];
  const used = new Set<number>();
  const { passengers, used: passengerLines } = parsePassengers(lines);
  for (const index of passengerLines) used.add(index);

  let deadline: string | null = null;
  for (let i = 0; i < lines.length; i += 1) {
    const parsed = parseDeadlineLine(lines[i], referenceYear);
    if (!parsed) continue;
    deadline = parsed.deadline;
    used.add(i);
    break;
  }

  for (let i = 0; i < lines.length; i += 1) {
    if (used.has(i)) continue;
    let matched = false;
    for (let width = 1; width <= 3 && i + width <= lines.length; width += 1) {
      const block = lines.slice(i, i + width).join(" ");
      const segment = parseItinerarySegment(block, referenceYear, warnings);
      if (!segment) continue;
      segments.push(segment);
      for (let offset = 0; offset < width; offset += 1) used.add(i + offset);
      i += width - 1;
      matched = true;
      break;
    }
    if (!matched && looksLikeHeader(lines[i])) used.add(i);
  }

  const unparsed = lines.filter((_, index) => !used.has(index));
  if (segments.length === 0) warnings.push("No itinerary segments recognised");
  if (passengers.length === 0) warnings.push("No passenger names recognised");
  return { segments, passengers, ticketingDeadline: deadline, unparsed, warnings };
}

function segmentInputs(segments: ParsedSegment[]) {
  return segments.map((segment) => ({
    airline: segment.airline,
    flightNo: segment.flightNo,
    fromIata: segment.fromIata,
    toIata: segment.toIata,
    departLocal: segment.departLocal,
    arriveLocal: segment.arriveLocal,
    ...(segment.cabin ? { cabin: segment.cabin } : {}),
    ...(segment.operatingCarrier ? { operatingCarrier: segment.operatingCarrier } : {}),
  }));
}

function passengerInputs(passengers: ParsedPassenger[]) {
  return passengers.map((passenger) => ({
    ...(passenger.title ? { title: passenger.title } : {}),
    firstName: passenger.firstName,
    lastName: passenger.lastName,
    type: passenger.type,
  }));
}

function pnrDate(value: string): { day: string; month: string; time: string } {
  const [date, time] = value.split("T");
  const [, month, day] = date.split("-");
  return {
    day,
    month: MONTHS[Number(month) - 1],
    time: time.replace(":", ""),
  };
}

function buildPnrText(parsed: ParsedPnr): string {
  const lines: string[] = [];
  parsed.segments.forEach((segment, index) => {
    const depart = pnrDate(segment.departLocal);
    const arrive = pnrDate(segment.arriveLocal);
    const offset = dayDifference(segment.departLocal.slice(0, 10), segment.arriveLocal.slice(0, 10));
    const cabin = segment.cabin?.charAt(0).toUpperCase() || "Y";
    const nextDay = offset > 0 && offset <= 9 ? `+${offset}` : "";
    lines.push(
      `${index + 1}  ${segment.airline} ${segment.flightNo}  ${cabin} ${depart.day}${depart.month} ${segment.fromIata}${segment.toIata} HK1  ${depart.time} ${arrive.time}${nextDay}`,
    );
    // The quotation editor does not store an operating carrier, and some
    // downstream PNR readers stop at a free-text OPERATED BY line. Keep the
    // canonical block to segment/name/deadline records only.
  });

  parsed.passengers.forEach((passenger, index) => {
    // The PNR name line can carry a title or a CHD/INF suffix, not both.
    const suffix =
      passenger.type === "child"
        ? " CHD"
        : passenger.type === "infant"
          ? " INF"
          : passenger.title
            ? ` ${passenger.title}`
            : "";
    lines.push(
      `${index + 1} ${passenger.lastName.toUpperCase()}/${passenger.firstName.toUpperCase()}${suffix}`,
    );
  });

  if (parsed.ticketingDeadline) {
    const deadline = pnrDate(parsed.ticketingDeadline);
    lines.push(`TK TL${deadline.day}${deadline.month}/${deadline.time}`);
  }
  return lines.join("\n");
}

export function parsedFromAiProposal(proposal: AiItineraryProposal): ParsedPnr {
  return {
    segments: proposal.segments.map((segment) => ({
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
    passengers: proposal.passengers.map((passenger) => ({
      ...(passenger.title ? { title: passenger.title } : {}),
      firstName: passenger.firstName,
      lastName: passenger.lastName,
      type: passenger.type,
      raw: "",
    })),
    ticketingDeadline: proposal.ticketingDeadline ?? null,
    unparsed: [],
    warnings: proposal.warnings,
  };
}

export function pnrResultFromParsed(
  parsed: ParsedPnr,
  format: "pnr" | "itinerary",
  prefixWarnings: string[] = [],
): PnrConvertResult {
  if (parsed.segments.length === 0) {
    throw new Error(
      "No flight segments were recognised. Include airline, flight number, date, airports and two times per segment.",
    );
  }

  const pnrText = buildPnrText(parsed);
  const reparsed = parsePnr(pnrText);
  if (reparsed.segments.length !== parsed.segments.length) {
    throw new Error("The converted PNR did not re-parse cleanly. Check the dates and flight numbers.");
  }

  const warnings = [...new Set([...prefixWarnings, ...parsed.warnings])];
  if (parsed.unparsed.length > 0) {
    warnings.push(`${parsed.unparsed.length} line${parsed.unparsed.length === 1 ? "" : "s"} were left unparsed.`);
  }

  return pnrConvertResultSchema.parse({
    format,
    pnrText,
    segments: segmentInputs(parsed.segments),
    passengers: passengerInputs(parsed.passengers),
    ticketingDeadline: parsed.ticketingDeadline,
    warnings,
    unparsed: parsed.unparsed,
  });
}

export function convertToPnr(text: string, options: { referenceYear?: number } = {}): PnrConvertResult {
  const input = pnrConvertInputSchema.safeParse({
    text,
    referenceYear: options.referenceYear,
  });
  if (!input.success) {
    throw new Error(input.error.issues[0]?.message ?? "Paste a PNR or itinerary");
  }

  const referenceYear = input.data.referenceYear ?? new Date().getUTCFullYear();
  const pnrParsed = parsePnr(input.data.text, { referenceYear });
  const looksLikePnr = PNR_LINE_RE.test(input.data.text) && pnrParsed.segments.length > 0;
  const itinerary = looksLikePnr ? null : parseItinerary(input.data.text, referenceYear);
  const useItinerary = !looksLikePnr && (itinerary?.segments.length ?? 0) > 0;
  const parsed: ParsedPnr = useItinerary && itinerary
    ? {
        segments: itinerary.segments,
        passengers: itinerary.passengers,
        ticketingDeadline: itinerary.ticketingDeadline,
        unparsed: itinerary.unparsed,
        warnings: itinerary.warnings,
      }
    : pnrParsed;

  if (parsed.segments.length === 0) {
    throw new Error(
      "No flight segments were recognised. Include airline, flight number, date, airports and two times per segment.",
    );
  }

  return pnrResultFromParsed(
    parsed,
    useItinerary ? "itinerary" : "pnr",
    useItinerary ? ["Converted from itinerary format."] : [],
  );
}
