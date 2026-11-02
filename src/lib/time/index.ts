import { DateTime } from "luxon";

/**
 * Flight times are local wall-clock strings at each airport, with the local
 * date, e.g. "2026-10-31T06:20". They are never converted for display.
 * Durations and layovers use the airports' IANA zones, so daylight saving is
 * handled by Luxon rather than hand-written rules.
 */

export interface SegmentTimingInput {
  airline: string;
  flightNo: string;
  fromIata: string;
  toIata: string;
  departLocal: string;
  arriveLocal: string;
  fromTz: string;
  toTz: string;
}

export interface TimedSegment extends SegmentTimingInput {
  departUtc: Date;
  arriveUtc: Date;
  durationMinutes: number;
}

export interface ItineraryTiming {
  segments: TimedSegment[];
  layoversMinutes: number[];
}

export class TimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TimeError";
  }
}

const LOCAL_FORMAT = "yyyy-LL-dd'T'HH:mm";

export function parseLocalWallClock(value: string, zone: string): DateTime {
  const dt = DateTime.fromFormat(value, LOCAL_FORMAT, { zone });
  if (!dt.isValid) {
    throw new TimeError(`Invalid local time "${value}" for ${zone}`);
  }
  // Reject times that do not exist because of a daylight-saving jump.
  if (dt.toFormat(LOCAL_FORMAT) !== value) {
    throw new TimeError(`Local time "${value}" does not exist in ${zone}`);
  }
  return dt;
}

export function timeSegment(input: SegmentTimingInput): TimedSegment {
  const depart = parseLocalWallClock(input.departLocal, input.fromTz);
  const arrive = parseLocalWallClock(input.arriveLocal, input.toTz);
  const durationMinutes = Math.round(arrive.toUTC().diff(depart.toUTC(), "minutes").minutes);
  if (durationMinutes <= 0) {
    throw new TimeError(
      `Arrival must be after departure (${input.fromIata} ${input.departLocal} -> ${input.toIata} ${input.arriveLocal})`,
    );
  }
  return {
    ...input,
    departUtc: depart.toUTC().toJSDate(),
    arriveUtc: arrive.toUTC().toJSDate(),
    durationMinutes,
  };
}

export function timeItinerary(segments: SegmentTimingInput[]): ItineraryTiming {
  const timed = segments.map(timeSegment);
  const layoversMinutes: number[] = [];
  for (let i = 1; i < timed.length; i += 1) {
    const minutes = Math.round(
      DateTime.fromJSDate(timed[i].departUtc)
        .diff(DateTime.fromJSDate(timed[i - 1].arriveUtc), "minutes")
        .minutes,
    );
    if (minutes < 0) {
      throw new TimeError(
        `Segment ${i + 1} departs before segment ${i} arrives (${timed[i].fromIata})`,
      );
    }
    layoversMinutes.push(minutes);
  }
  return { segments: timed, layoversMinutes };
}

export function formatDuration(minutes: number): string {
  if (minutes < 0) throw new TimeError("Duration cannot be negative");
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

/** Display a local wall-clock value without converting it. */
export function formatWallClock(value: string): string {
  const dt = DateTime.fromFormat(value, LOCAL_FORMAT, { zone: "utc" });
  if (!dt.isValid) return value;
  return dt.toFormat("dd LLL yyyy, HH:mm");
}

export function formatWallClockDate(value: string): string {
  const dt = DateTime.fromFormat(value, LOCAL_FORMAT, { zone: "utc" });
  if (!dt.isValid) return value;
  return dt.toFormat("dd LLL yyyy");
}

export function formatWallClockTime(value: string): string {
  const dt = DateTime.fromFormat(value, LOCAL_FORMAT, { zone: "utc" });
  if (!dt.isValid) return value;
  return dt.toFormat("HH:mm");
}

/** Whole days between two calendar dates, inclusive, for "travel dates". */
export function travelDateRange(departLocal: string, arriveLocal: string): string {
  const start = DateTime.fromISO(departLocal, { zone: "utc" });
  const end = DateTime.fromISO(arriveLocal, { zone: "utc" });
  if (!start.isValid || !end.isValid) return "";
  if (start.hasSame(end, "day")) return start.toFormat("dd LLL yyyy");
  return `${start.toFormat("dd LLL")} – ${end.toFormat("dd LLL yyyy")}`;
}
