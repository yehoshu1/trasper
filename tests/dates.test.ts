import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DateTime } from "luxon";

import {
  documentDateFromInput,
  formatDate,
  formatDateTime,
  isExpired,
  setAppTimeZone,
  timeZoneLabel,
  toDateInput,
  todayInAppZone,
} from "../src/lib/dates";

describe("agency time formatting", () => {
  it("shows document dates in the configured agency time zone", () => {
    setAppTimeZone("Africa/Blantyre");
    const utcMidnight = new Date("2026-10-30T22:00:00.000Z");
    assert.equal(formatDate(utcMidnight), "31 Oct 2026");
    assert.equal(formatDateTime(utcMidnight), "31 Oct 2026, 00:00");
  });

  it("stores a document date at UTC midnight and round-trips it", () => {
    const value = documentDateFromInput("2026-10-31");
    assert.equal(value.toISOString(), "2026-10-31T00:00:00.000Z");
    assert.equal(toDateInput(value), "2026-10-31");
    assert.equal(formatDate(value), "31 Oct 2026");
  });

  it("uses the configured zone for 'today'", () => {
    setAppTimeZone("Africa/Blantyre");
    const lateUtc = new Date("2026-10-31T23:00:00.000Z"); // 01:00 on 1 Nov in Blantyre
    assert.equal(todayInAppZone(lateUtc).toISODate(), "2026-11-01");
  });

  it("can be moved to another zone without changing stored dates", () => {
    setAppTimeZone("Europe/London");
    const lateUtc = new Date("2026-10-31T23:00:00.000Z"); // 23:00 on 31 Oct in London
    assert.equal(todayInAppZone(lateUtc).toISODate(), "2026-10-31");
    assert.match(timeZoneLabel("Europe/London"), /London|Greenwich/);
    setAppTimeZone("UTC");
    assert.equal(todayInAppZone(new Date("2026-10-31T23:00:00.000Z")).toISODate(), "2026-10-31");
  });

  it("expires after the valid-until day in the configured zone", () => {
    setAppTimeZone("Africa/Blantyre");
    const validUntil = documentDateFromInput("2026-10-31");
    assert.equal(isExpired(validUntil, DateTime.fromISO("2026-10-31T21:59", { zone: "Africa/Blantyre" }).toJSDate()), false);
    assert.equal(isExpired(validUntil, DateTime.fromISO("2026-11-01T00:01", { zone: "Africa/Blantyre" }).toJSDate()), true);
  });
});
