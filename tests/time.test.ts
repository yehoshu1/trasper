import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  formatDuration,
  formatWallClock,
  parseLocalWallClock,
  TimeError,
  timeItinerary,
  timeSegment,
} from "../src/lib/time/index";

const segment = (overrides: Partial<Parameters<typeof timeSegment>[0]> = {}) => ({
  airline: "ET",
  flightNo: "873",
  fromIata: "LLW",
  toIata: "NBO",
  departLocal: "2026-10-31T18:00",
  arriveLocal: "2026-10-31T21:30",
  fromTz: "Africa/Blantyre",
  toTz: "Africa/Nairobi",
  ...overrides,
});

describe("flight durations", () => {
  it("handles an overnight regional flight", () => {
    const timed = timeSegment(segment());
    assert.equal(timed.durationMinutes, 150);
    assert.equal(timed.departUtc.toISOString(), "2026-10-31T16:00:00.000Z");
    assert.equal(timed.arriveUtc.toISOString(), "2026-10-31T18:30:00.000Z");
  });

  it("handles the spring daylight-saving change", () => {
    const timed = timeSegment(
      segment({
        fromIata: "LHR",
        toIata: "NBO",
        departLocal: "2026-03-29T00:30",
        arriveLocal: "2026-03-29T05:00",
        fromTz: "Europe/London",
        toTz: "Africa/Nairobi",
      }),
    );
    assert.equal(timed.durationMinutes, 90);
  });

  it("handles the autumn daylight-saving change", () => {
    const timed = timeSegment(
      segment({
        fromIata: "LHR",
        toIata: "JNB",
        departLocal: "2026-10-25T00:30",
        arriveLocal: "2026-10-25T12:00",
        fromTz: "Europe/London",
        toTz: "Africa/Johannesburg",
      }),
    );
    assert.equal(timed.durationMinutes, 630);
  });

  it("handles a date-line crossing where arrival is earlier locally", () => {
    const timed = timeSegment(
      segment({
        fromIata: "NRT",
        toIata: "LAX",
        departLocal: "2026-11-01T17:00",
        arriveLocal: "2026-11-01T10:30",
        fromTz: "Asia/Tokyo",
        toTz: "America/Los_Angeles",
      }),
    );
    assert.equal(timed.durationMinutes, 630);
    assert.equal(timed.arriveUtc > timed.departUtc, true);
  });

  it("rejects an arrival before departure and a time that does not exist", () => {
    assert.throws(
      () => timeSegment(segment({ arriveLocal: "2026-10-31T17:00" })),
      TimeError,
    );
    assert.throws(
      () => parseLocalWallClock("2026-03-29T01:30", "Europe/London"),
      TimeError,
    );
  });
});

describe("layovers", () => {
  it("computes layovers from airport time zones", () => {
    const timing = timeItinerary([
      segment(),
      segment({
        flightNo: "720",
        fromIata: "NBO",
        toIata: "IST",
        departLocal: "2026-11-01T02:30",
        arriveLocal: "2026-11-01T08:10",
        fromTz: "Africa/Nairobi",
        toTz: "Europe/Istanbul",
      }),
    ]);
    assert.deepEqual(timing.layoversMinutes, [300]);
    assert.equal(timing.segments[1].durationMinutes, 340);
  });

  it("rejects a connection that departs before the previous flight lands", () => {
    assert.throws(
      () =>
        timeItinerary([
          segment(),
          segment({
            fromIata: "NBO",
            toIata: "IST",
            departLocal: "2026-10-31T20:00",
            arriveLocal: "2026-11-01T02:00",
            fromTz: "Africa/Nairobi",
            toTz: "Europe/Istanbul",
          }),
        ]),
      TimeError,
    );
  });
});

describe("formatting", () => {
  it("formats durations", () => {
    assert.equal(formatDuration(0), "0m");
    assert.equal(formatDuration(45), "45m");
    assert.equal(formatDuration(60), "1h");
    assert.equal(formatDuration(150), "2h 30m");
    assert.equal(formatDuration(630), "10h 30m");
  });

  it("shows local wall-clock times without converting them", () => {
    assert.equal(formatWallClock("2026-10-31T06:20"), "31 Oct 2026, 06:20");
  });
});
