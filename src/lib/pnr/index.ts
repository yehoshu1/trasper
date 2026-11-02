import { DateTime } from "luxon";

import { appTimeZone } from "../dates";

/**
 * PNR parser. It reads what it recognises and reports everything else in
 * `unparsed`; it never guesses a segment or a name. New real-world failures
 * become fixtures in ./fixtures.
 *
 * Supported line shapes: Amadeus, Sabre and Galileo segment lines (including
 * placeholders such as `ET XXX` and next-day arrivals like `0630+1`), carrier
 * continuation lines (`OPERATED BY ...`), passenger name lines in
 * "SURNAME/FIRSTNAME TITLE" form, and ticketing time limits in the common
 * TK/TKT formats.
 */

export type PassengerType = "adult" | "child" | "infant";

export interface ParsedSegment {
  airline: string;
  flightNo: string;
  fromIata: string;
  toIata: string;
  departLocal: string;
  arriveLocal: string;
  cabin?: string;
  /** Set when the line above the segment names a different operating carrier. */
  operatingCarrier?: string;
  raw: string;
}

export interface ParsedPassenger {
  title?: string;
  firstName: string;
  lastName: string;
  type: PassengerType;
  raw: string;
}

export interface ParsedPnr {
  segments: ParsedSegment[];
  passengers: ParsedPassenger[];
  ticketingDeadline: string | null;
  unparsed: string[];
  warnings: string[];
}

export interface ParsePnrOptions {
  /** Year used when the PNR omits one. Usually the quotation issue year. */
  referenceYear?: number;
  /** Agency time zone for the ticketing deadline; defaults to the configured zone. */
  agencyTz?: string;
}

const MONTHS: Record<string, number> = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
  JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
};

/**
 * Month alternatives as named groups for the segment patterns. The deadline
 * parser matches months inline with its own expression.
 */
const MONTH_NAMED = "(?<month>JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)";
const ARR_MONTH_NAMED = "(?<arrMonth>JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)";

/**
 * Amadeus / Sabre style, with a day-of-week digit and an optional arrival
 * date and next-day marker:
 * 1  ET 873  Y 31OCT 6 LLWLUN HK1  0620 0910  31OCT  E0/332
 * 5  ET XXX  Y 01NOV DARADD HK3  1845 2125
 * 7  ET XXX  Y 07NOV VIEADD HK3  2230 0630+1
 *
 * The flight number is alphanumeric because a freshly filed group booking
 * shows `XXX` until the airline assigns the real number.
 */
const SEGMENT_WITH_DOW = new RegExp(
  String.raw`^\s*(?<line>\d{1,2})[.)]?\s+(?<airline>[A-Z0-9]{2})\s*(?<flight>[A-Z0-9]{1,4})\s+` +
    String.raw`(?<cabin>[A-Z])\s+(?<day>\d{1,2})` +
    MONTH_NAMED +
    String.raw`\s+(?<dow>\d)\s+(?<from>[A-Z]{3})(?<to>[A-Z]{3})\s+(?<status>[A-Z]{2}\d?)\s*` +
    String.raw`(?<dep>\d{4})\s+(?<arr>\d{4})(?:\+(?<nextDay>\d))?` +
    String.raw`(?:\s+(?<arrDay>\d{1,2})` +
    ARR_MONTH_NAMED +
    String.raw`)?`,
);

/** Galileo style: no day of week, no arrival date.
 * 1 ET 873 Y 31OCT LLWLUN HK1 0620 0910 */
const SEGMENT_PLAIN = new RegExp(
  String.raw`^\s*(?<line>\d{1,2})[.)]?\s+(?<airline>[A-Z0-9]{2})\s*(?<flight>[A-Z0-9]{1,4})\s+` +
    String.raw`(?<cabin>[A-Z])\s+(?<day>\d{1,2})` +
    MONTH_NAMED +
    String.raw`\s+(?<from>[A-Z]{3})(?<to>[A-Z]{3})\s+(?<status>[A-Z]{2}\d?)\s*` +
    String.raw`(?<dep>\d{4})\s+(?<arr>\d{4})(?:\+(?<nextDay>\d))?\s*$`,
);

/** Continuation line naming the real operator, e.g. the operating carrier. */
const OPERATED_BY = /^\s*OPERATED BY\s+(.+?)\s*$/;

const NAME_LINE =
  /^\s*(\d{1,2})[.)\s]\s*([A-Z][A-Z' -]*)\/([A-Z][A-Z' -]*?)(?:\s+(MR|MRS|MS|MISS|DR|MSTR|PROF|CHD|INF|CNN))?\s*$/;

const TITLES = new Set(["MR", "MRS", "MS", "MISS", "DR", "MSTR", "PROF"]);

function monthNumber(token: string): number {
  const month = MONTHS[token.toUpperCase()];
  if (!month) throw new Error(`Unknown month ${token}`);
  return month;
}

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}

function parseDeadline(
  text: string,
  options: ParsePnrOptions,
  referenceDate?: Date,
): string | null {
  const cleaned = text.replace(/\s+/g, " ").trim();
  // TK TL31OCT/1200, TK TL 31OCT/1200, TKT/TIME LIMIT - 31OCT/1200,
  // TKTG 31OCT/1200 and the same with a two-digit year.
  const match =
    /(?:TK\s*TL|TKT\/TIME LIMIT\s*[-–]?|TKTG)\s*:?\s*(\d{1,2})([A-Z]{3})(\d{2})?\/\s*(\d{2})(\d{2})/.exec(
      cleaned,
    );
  if (!match) return null;
  const day = Number(match[1]);
  const month = monthNumber(match[2]);
  const referenceYear = options.referenceYear ?? new Date().getUTCFullYear();
  let year = match[3] ? 2000 + Number(match[3]) : referenceYear;
  if (!match[3] && referenceDate) {
    const ref = DateTime.fromJSDate(referenceDate, { zone: "utc" });
    // A month far behind the issue date belongs to next year (December PNR
    // with a January ticketing deadline, for example).
    if (month < ref.month - 1) year = ref.year + 1;
  }
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const dt = DateTime.fromObject(
    { year, month, day, hour, minute },
    { zone: options.agencyTz ?? appTimeZone() },
  );
  if (!dt.isValid) return null;
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}`;
}

interface SegmentMatch {
  airline: string;
  flight: string;
  cabin: string;
  day: number;
  month: number;
  fromIata: string;
  toIata: string;
  depTime: string;
  arrTime: string;
  /** Explicit `+1` style marker: arrival is this many days after departure. */
  nextDay?: number;
  arrivalDay?: number;
  arrivalMonth?: number;
}

function readSegment(line: string): SegmentMatch | null {
  for (const pattern of [SEGMENT_WITH_DOW, SEGMENT_PLAIN]) {
    const groups = pattern.exec(line)?.groups;
    if (!groups) continue;
    return {
      airline: groups.airline,
      flight: groups.flight,
      cabin: groups.cabin,
      day: Number(groups.day),
      month: monthNumber(groups.month),
      fromIata: groups.from,
      toIata: groups.to,
      depTime: groups.dep,
      arrTime: groups.arr,
      nextDay: groups.nextDay ? Number(groups.nextDay) : undefined,
      arrivalDay: groups.arrDay ? Number(groups.arrDay) : undefined,
      arrivalMonth: groups.arrMonth ? monthNumber(groups.arrMonth) : undefined,
    };
  }
  return null;
}

function parseSegments(
  lines: string[],
  options: ParsePnrOptions,
  warnings: string[],
): { segments: ParsedSegment[]; used: Set<number> } {
  const segments: ParsedSegment[] = [];
  const used = new Set<number>();
  const referenceYear = options.referenceYear ?? new Date().getUTCFullYear();

  for (let i = 0; i < lines.length; i += 1) {
    const match = readSegment(lines[i]);
    if (!match) continue;
    if (match.fromIata === match.toIata) {
      warnings.push(`Ignored a segment from ${match.fromIata} to itself`);
      continue;
    }

    const departLocal = `${referenceYear}-${pad(match.month)}-${pad(match.day)}T${match.depTime.slice(0, 2)}:${match.depTime.slice(2)}`;
    let arriveDate = departLocal.slice(0, 10);

    if (match.arrivalMonth && match.arrivalDay) {
      // Amadeus gives the arrival date explicitly, sometimes next year.
      const arrivalYear =
        match.arrivalMonth < match.month ||
        (match.arrivalMonth === match.month && match.arrivalDay < match.day)
          ? referenceYear + 1
          : referenceYear;
      arriveDate = `${arrivalYear}-${pad(match.arrivalMonth)}-${pad(match.arrivalDay)}`;
    } else if (match.nextDay !== undefined) {
      // `0630+1`: the airline's own next-day marker, so trust it over a guess.
      arriveDate = DateTime.fromISO(arriveLocalDate(departLocal))
        .plus({ days: match.nextDay })
        .toISODate() as string;
    } else if (match.arrTime <= match.depTime) {
      // Overnight flight without a marker: flag it, keep the same day so the
      // staff member decides rather than the parser inventing a date.
      warnings.push(
        `Arrival time on segment ${match.fromIata}-${match.toIata} is not after departure; check whether the flight arrives the next day`,
      );
    }

    if (/^X+$/i.test(match.flight)) {
      warnings.push(
        `Flight number ${match.airline} ${match.flight} on ${match.fromIata}-${match.toIata} is a placeholder; replace it when the airline assigns the real number`,
      );
    }

    // A carrier continuation line belongs to the segment above it.
    let operatingCarrier: string | undefined;
    const operatedBy = lines[i + 1] ? OPERATED_BY.exec(lines[i + 1]) : null;
    if (operatedBy) {
      operatingCarrier = operatedBy[1];
      used.add(i + 1);
    }

    segments.push({
      airline: match.airline,
      flightNo: match.flight,
      fromIata: match.fromIata,
      toIata: match.toIata,
      departLocal,
      arriveLocal: `${arriveDate}T${match.arrTime.slice(0, 2)}:${match.arrTime.slice(2)}`,
      cabin: match.cabin,
      // Only present when a continuation line named the real operator, so a
      // plain segment stays exactly the shape callers expect.
      ...(operatingCarrier ? { operatingCarrier } : {}),
      raw: lines[i],
    });
    used.add(i);
  }
  return { segments, used };
}

/** Just the date part of the local depart string, for date arithmetic. */
function arriveLocalDate(departLocal: string): string {
  return departLocal.slice(0, 10);
}

function parsePassengers(lines: string[], used: Set<number>): ParsedPassenger[] {
  const passengers: ParsedPassenger[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (used.has(i)) continue;
    const match = NAME_LINE.exec(lines[i]);
    if (!match) continue;
    const suffix = match[4]?.toUpperCase();
    let type: PassengerType = "adult";
    let title: string | undefined;
    if (suffix === "CHD" || suffix === "CNN") type = "child";
    else if (suffix === "INF") type = "infant";
    else if (suffix && TITLES.has(suffix)) title = suffix;

    const firstName = match[3].replace(/\s+/g, " ").trim();
    const lastName = match[2].replace(/\s+/g, " ").trim();
    if (!firstName || !lastName) continue;
    passengers.push({ title, firstName, lastName, type, raw: lines[i] });
    used.add(i);
  }
  return passengers;
}

export function parsePnr(text: string, options: ParsePnrOptions = {}): ParsedPnr {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+$/, ""))
    .filter((line) => line.trim().length > 0);

  const warnings: string[] = [];
  const { segments, used } = parseSegments(lines, options, warnings);

  // Ticketing deadline: look at unused lines only, so a segment is never
  // mistaken for a deadline.
  let ticketingDeadline: string | null = null;
  for (let i = 0; i < lines.length; i += 1) {
    if (used.has(i)) continue;
    const parsed = parseDeadline(lines[i], options);
    if (parsed) {
      ticketingDeadline = parsed;
      used.add(i);
      break;
    }
  }

  const passengers = parsePassengers(lines, used);

  if (segments.length === 0) warnings.push("No flight segments recognised");
  if (passengers.length === 0) warnings.push("No passenger names recognised");

  const rawNumbers = segments.map(
    (s) => SEGMENT_WITH_DOW.exec(s.raw)?.groups?.line ?? SEGMENT_PLAIN.exec(s.raw)?.groups?.line,
  );
  if (new Set(rawNumbers).size !== rawNumbers.length) {
    warnings.push("Duplicate segment numbers; check that only one PNR was pasted");
  }

  for (let i = 1; i < segments.length; i += 1) {
    if (segments[i - 1].toIata !== segments[i].fromIata) {
      warnings.push(
        `Segment ${i + 1} starts at ${segments[i].fromIata} but the previous segment arrives at ${segments[i - 1].toIata}`,
      );
    }
  }

  const unparsed = lines.filter((_, index) => !used.has(index));

  return { segments, passengers, ticketingDeadline, unparsed, warnings };
}
