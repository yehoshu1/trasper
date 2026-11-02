import { DateTime } from "luxon";

/**
 * The agency's time zone. It is deployment configuration: the seed stores
 * `APP_TIMEZONE` in the database and admins can change it under
 * Settings → Company. Pure helpers fall back to the environment value so they
 * remain usable in tests and scripts without a database.
 */
const FALLBACK_TIME_ZONE = "UTC";

let activeTimeZone = normaliseTimeZone(process.env.APP_TIMEZONE) ?? FALLBACK_TIME_ZONE;

export function isValidTimeZone(value: string): boolean {
  const zone = value.trim();
  if (!zone || zone.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: zone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function normaliseTimeZone(value: string | null | undefined): string | null {
  const zone = value?.trim();
  return zone && isValidTimeZone(zone) ? zone : null;
}

export function appTimeZone(): string {
  return activeTimeZone;
}

/** Called after settings load; invalid values keep the current zone. */
export function setAppTimeZone(value: string | null | undefined): void {
  const zone = normaliseTimeZone(value);
  if (zone) activeTimeZone = zone;
}

/** A human-readable name for the configured zone, e.g. "Central Africa Time". */
export function timeZoneLabel(zone = activeTimeZone): string {
  try {
    const part = new Intl.DateTimeFormat("en-GB", {
      timeZone: zone,
      timeZoneName: "long",
    })
      .formatToParts(new Date())
      .find((entry) => entry.type === "timeZoneName");
    return part?.value ?? zone;
  } catch {
    return zone;
  }
}

/** Format an instant as a UK-style date in the agency time zone: 31 Oct 2026. */
export function formatDate(value: Date | DateTime | string, zone = activeTimeZone): string {
  const dt =
    value instanceof DateTime
      ? value.setZone(zone)
      : typeof value === "string"
        ? DateTime.fromISO(value, { zone }).setZone(zone)
        : DateTime.fromJSDate(value, { zone }).setZone(zone);
  return dt.toFormat("dd LLL yyyy");
}

/** Format an instant as a 24-hour date and time in the agency time zone. */
export function formatDateTime(value: Date | DateTime | string, zone = activeTimeZone): string {
  const dt =
    value instanceof DateTime
      ? value.setZone(zone)
      : typeof value === "string"
        ? DateTime.fromISO(value, { zone }).setZone(zone)
        : DateTime.fromJSDate(value, { zone }).setZone(zone);
  return dt.toFormat("dd LLL yyyy, HH:mm");
}

/** ISO date (yyyy-LL-dd) in the agency time zone, for <input type="date">. */
export function toDateInput(value: Date | DateTime): string {
  const dt = value instanceof DateTime ? value : DateTime.fromJSDate(value);
  return dt.setZone(activeTimeZone).toISODate() ?? "";
}

/**
 * A document date is a calendar date. It is stored at UTC midnight so the
 * same calendar day is shown in the agency time zone, and formatted as a
 * date only.
 */
export function documentDateFromInput(input: string): Date {
  const dt = DateTime.fromFormat(input, "yyyy-LL-dd", { zone: "utc" });
  if (!dt.isValid) throw new Error("Invalid date");
  return dt.startOf("day").toJSDate();
}

/** Today's calendar date in the agency time zone, at start of day. */
export function todayInAppZone(now: Date = new Date()): DateTime {
  return DateTime.fromJSDate(now, { zone: activeTimeZone }).startOf("day");
}

export function addDays(value: Date, days: number): Date {
  return DateTime.fromJSDate(value, { zone: "utc" }).plus({ days }).toJSDate();
}

/** True when a quotation's valid-until date has passed in the agency zone. */
export function isExpired(validUntil: Date, now: Date = new Date()): boolean {
  const day = DateTime.fromJSDate(validUntil, { zone: "utc" }).toISODate();
  if (!day) return false;
  const endOfDay = DateTime.fromISO(day, { zone: activeTimeZone }).endOf("day");
  return DateTime.fromJSDate(now).setZone(activeTimeZone) > endOfDay;
}

export function daysUntil(value: Date, now: Date = new Date()): number {
  const target = DateTime.fromJSDate(value, { zone: "utc" }).startOf("day");
  const today = DateTime.fromJSDate(now, { zone: activeTimeZone }).startOf("day");
  return Math.round(target.diff(today, "days").days);
}

/** Compare two calendar dates by day only. */
export function isSameOrBefore(a: Date, b: Date): boolean {
  return DateTime.fromJSDate(a, { zone: "utc" }).startOf("day") <=
    DateTime.fromJSDate(b, { zone: "utc" }).startOf("day");
}
