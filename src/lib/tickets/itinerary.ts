import { DateTime } from "luxon";

import type { TicketCouponSnapshot } from "../documents";
import { formatDuration } from "../time";

/** A connection of 24 hours or more is a stopover at the destination. */
export const MAX_LAYOVER_MINUTES = 24 * 60;

/**
 * Minutes between arriving on one coupon and departing on the next. Returns
 * null when the coupons do not connect or the times are not known.
 */
export function layoverMinutes(
  current: TicketCouponSnapshot,
  next: TicketCouponSnapshot,
): number | null {
  if (!current.arriveTime || !current.travelDate || current.toIata !== next.fromIata) return null;
  const arrive = DateTime.fromISO(`${current.travelDate}T${current.arriveTime}`);
  const depart = DateTime.fromISO(`${next.travelDate ?? current.travelDate}T${next.departTime}`);
  if (!arrive.isValid || !depart.isValid) return null;
  // Only roll over when the source did not give the next travel date.
  const adjusted = depart <= arrive ? depart.plus({ days: 1 }) : depart;
  const minutes = adjusted.diff(arrive, "minutes").minutes;
  return minutes > 0 ? minutes : null;
}

/** Customer-facing layover row, or null for a stopover or unconnected flight. */
export function layoverLabel(
  current: TicketCouponSnapshot,
  next: TicketCouponSnapshot,
): string | null {
  const minutes = layoverMinutes(current, next);
  if (minutes === null || minutes >= MAX_LAYOVER_MINUTES) return null;
  const city = current.toCity || current.toIata;
  return `Layover in ${city} (${current.toIata}) - ${formatDuration(minutes)}`;
}
