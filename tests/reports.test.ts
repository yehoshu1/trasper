import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DateTime } from "luxon";

import {
  bucketKey,
  buildReportBuckets,
  marginPercent,
  resolveReportRange,
} from "../src/lib/reports";
import { setAppTimeZone } from "../src/lib/dates";

setAppTimeZone("Africa/Blantyre");

const NOW = DateTime.fromISO("2026-11-01T10:30:00", { zone: "Africa/Blantyre" });

describe("report periods (day, week, month, quarter, year, multiple years)", () => {
  it("covers today in the configured agency time zone", () => {
    const range = resolveReportRange({ period: "today" }, NOW);
    assert.equal(range.start.toISO(), "2026-11-01T00:00:00.000+02:00");
    assert.equal(range.endExclusive.toISO(), "2026-11-02T00:00:00.000+02:00");
    assert.equal(range.from, "2026-11-01");
    assert.equal(range.to, "2026-11-01");
  });

  it("starts the week on Monday", () => {
    const range = resolveReportRange({ period: "week" }, NOW);
    assert.equal(range.from, "2026-10-26");
    assert.equal(range.to, "2026-11-01");
  });

  it("uses calendar months, quarters and years", () => {
    const month = resolveReportRange({ period: "month" }, NOW);
    assert.equal(month.from, "2026-11-01");
    assert.equal(month.to, "2026-11-30");

    const quarter = resolveReportRange({ period: "quarter" }, NOW);
    assert.equal(quarter.from, "2026-10-01");
    assert.equal(quarter.to, "2026-12-31");

    const year = resolveReportRange({ period: "year" }, NOW);
    assert.equal(year.from, "2026-01-01");
    assert.equal(year.to, "2026-12-31");
  });

  it("supports last year and multi-year periods", () => {
    const lastYear = resolveReportRange({ period: "last_year" }, NOW);
    assert.equal(lastYear.from, "2025-01-01");
    assert.equal(lastYear.to, "2025-12-31");

    const three = resolveReportRange({ period: "last_3_years" }, NOW);
    assert.equal(three.from, "2024-01-01");
    assert.equal(three.to, "2026-12-31");

    const five = resolveReportRange({ period: "last_5_years" }, NOW);
    assert.equal(five.from, "2022-01-01");
    assert.equal(five.to, "2026-12-31");
  });

  it("treats a custom end date as inclusive and swaps reversed dates", () => {
    const range = resolveReportRange(
      { period: "custom", from: "2026-10-31", to: "2026-11-02" },
      NOW,
    );
    assert.equal(range.start.toISO(), "2026-10-31T00:00:00.000+02:00");
    assert.equal(range.endExclusive.toISO(), "2026-11-03T00:00:00.000+02:00");

    const reversed = resolveReportRange(
      { period: "custom", from: "2026-11-02", to: "2026-10-31" },
      NOW,
    );
    assert.equal(reversed.from, "2026-10-31");
    assert.equal(reversed.to, "2026-11-02");
  });

  it("picks a sensible default grouping for the range length", () => {
    assert.equal(resolveReportRange({ period: "week" }, NOW).grain, "day");
    assert.equal(resolveReportRange({ period: "month" }, NOW).grain, "day");
    assert.equal(resolveReportRange({ period: "quarter" }, NOW).grain, "week");
    assert.equal(resolveReportRange({ period: "year" }, NOW).grain, "month");
    assert.equal(resolveReportRange({ period: "last_3_years" }, NOW).grain, "year");
    assert.equal(resolveReportRange({ period: "last_5_years" }, NOW).grain, "year");
  });
});

describe("report buckets", () => {
  it("creates every day in a month", () => {
    const range = resolveReportRange({ period: "month", grain: "day" }, NOW);
    const buckets = buildReportBuckets(range.start, range.endExclusive, range.grain);
    assert.equal(buckets.length, 30);
    assert.equal(buckets[0].label, "01 Nov 2026");
    assert.equal(buckets[29].label, "30 Nov 2026");
  });

  it("creates each month in a year and each year in a multi-year range", () => {
    const year = resolveReportRange({ period: "year", grain: "month" }, NOW);
    const months = buildReportBuckets(year.start, year.endExclusive, year.grain);
    assert.equal(months.length, 12);
    assert.equal(months[0].label, "Jan 2026");

    const multi = resolveReportRange({ period: "last_3_years", grain: "year" }, NOW);
    const years = buildReportBuckets(multi.start, multi.endExclusive, multi.grain);
    assert.deepEqual(years.map((bucket) => bucket.label), ["2024", "2025", "2026"]);
  });

  it("groups dates into the same ISO week across a year boundary", () => {
    assert.equal(bucketKey(DateTime.fromISO("2026-12-31"), "week"), "2026-W53");
    assert.equal(bucketKey(DateTime.fromISO("2027-01-01"), "week"), "2026-W53");
    assert.equal(bucketKey(DateTime.fromISO("2027-01-04"), "week"), "2027-W01");
  });

  it("calculates gross margin from profit and value", () => {
    assert.equal(marginPercent(3250n, 10000n), 32.5);
    assert.equal(marginPercent(0n, 0n), 0);
  });
});
