import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { parsePnr } from "../src/lib/pnr/index";

function fixture(name: string): string {
  return readFileSync(join(process.cwd(), "src/lib/pnr/fixtures", name), "utf8");
}

describe("Amadeus fixture", () => {
  const pnr = parsePnr(fixture("amadeus.txt"), { referenceYear: 2026 });

  it("reads both segments", () => {
    assert.equal(pnr.segments.length, 2);
    assert.deepEqual(pnr.segments[0], {
      airline: "ET",
      flightNo: "873",
      fromIata: "LLW",
      toIata: "LUN",
      departLocal: "2026-10-31T06:20",
      arriveLocal: "2026-10-31T09:10",
      cabin: "Y",
      raw: "1  ET 873  Y 31OCT 6 LLWLUN HK1  0620 0910  31OCT  E0/332",
    });
    assert.equal(pnr.segments[1].departLocal, "2026-11-07T17:50");
    assert.equal(pnr.segments[1].arriveLocal, "2026-11-07T21:00");
  });

  it("reads passengers and types", () => {
    assert.equal(pnr.passengers.length, 3);
    assert.equal(pnr.passengers[0].lastName, "BANDA");
    assert.equal(pnr.passengers[0].firstName, "JOHN");
    assert.equal(pnr.passengers[0].title, "MR");
    assert.equal(pnr.passengers[0].type, "adult");
    assert.equal(pnr.passengers[2].type, "child");
  });

  it("reads the ticketing deadline and leaves other lines for manual entry", () => {
    assert.equal(pnr.ticketingDeadline, "2026-10-31T12:00");
    assert.ok(pnr.unparsed.some((line) => line.startsWith("RP/")));
    assert.ok(pnr.unparsed.some((line) => line.startsWith("AP ")));
    assert.deepEqual(pnr.warnings, []);
  });
});

describe("Sabre fixture", () => {
  const pnr = parsePnr(fixture("sabre.txt"), { referenceYear: 2026 });

  it("reads segments, passengers and the TKT time limit", () => {
    assert.equal(pnr.segments.length, 2);
    assert.equal(pnr.segments[0].airline, "ET");
    assert.equal(pnr.segments[0].fromIata, "LLW");
    assert.equal(pnr.passengers.length, 3);
    assert.equal(pnr.passengers[2].type, "infant");
    assert.equal(pnr.ticketingDeadline, "2026-10-30T17:00");
  });
});

describe("Galileo fixture", () => {
  const pnr = parsePnr(fixture("galileo.txt"), { referenceYear: 2026 });

  it("reads segments without a day of week", () => {
    assert.equal(pnr.segments.length, 2);
    assert.equal(pnr.segments[0].departLocal, "2026-10-31T06:20");
    assert.equal(pnr.segments[0].arriveLocal, "2026-10-31T09:10");
    assert.equal(pnr.passengers.length, 2);
    assert.equal(pnr.ticketingDeadline, "2026-10-29T16:00");
  });
});

describe("group booking fixture (placeholder flight numbers)", () => {
  const pnr = parsePnr(fixture("group-booking.txt"), { referenceYear: 2026 });

  it("reads every segment, including ones with XXX flight numbers", () => {
    assert.equal(pnr.segments.length, 5);
    assert.deepEqual(
      pnr.segments.map((segment) => `${segment.airline}${segment.flightNo} ${segment.fromIata}-${segment.toIata}`),
      [
        "ET031 LLW-DAR",
        "ETXXX DAR-ADD",
        "ETXXX ADD-VIE",
        "ETXXX VIE-ADD",
        "ETXXX ADD-LLW",
      ],
    );
  });

  it("honours the +1 next-day arrival marker", () => {
    const overnight = pnr.segments.find((segment) => segment.fromIata === "VIE");
    assert.equal(overnight?.departLocal, "2026-11-07T22:30");
    assert.equal(overnight?.arriveLocal, "2026-11-08T06:30");
  });

  it("keeps same-day arrivals on the departure date", () => {
    assert.equal(pnr.segments[0].departLocal, "2026-10-31T16:00");
    assert.equal(pnr.segments[0].arriveLocal, "2026-10-31T20:10");
  });

  it("attaches the operating carrier to its segment and consumes the line", () => {
    assert.equal(pnr.segments[0].operatingCarrier, "MALAWIAN AIRLINES");
    assert.equal(pnr.unparsed.some((line) => line.includes("OPERATED BY")), false);
  });

  it("warns that XXX is a placeholder, without dropping the segment", () => {
    assert.equal(
      pnr.warnings.filter((warning) => warning.includes("placeholder")).length,
      4,
    );
    assert.equal(pnr.segments.filter((segment) => segment.flightNo === "XXX").length, 4);
  });

  it("reads all three passengers and the two-digit ticketing year", () => {
    assert.equal(pnr.passengers.length, 3);
    assert.equal(pnr.passengers[0].lastName, "SMITH");
    assert.equal(pnr.passengers[2].lastName, "JOHNSON");
    assert.equal(pnr.ticketingDeadline, "2026-10-31T18:00");
  });

  it("leaves only the true header, contact and remark lines unread", () => {
    assert.deepEqual(pnr.unparsed, [
      "RP/LLW1A0980/LLW1A0980            31OCT26/1558Z",
      "  9 AP LLW +265XXXXXXXX",
      " 11 RMK GROUP BOOKING - 3 PASSENGERS",
    ]);
  });

  it("reports no connection breaks for the round trip", () => {
    assert.equal(
      pnr.warnings.some((warning) => warning.includes("previous segment arrives at")),
      false,
    );
  });
});

describe("never guesses", () => {
  it("returns unreadable input untouched", () => {
    const text = "please book two seats\nsome agent note";
    const pnr = parsePnr(text);
    assert.equal(pnr.segments.length, 0);
    assert.equal(pnr.passengers.length, 0);
    assert.equal(pnr.ticketingDeadline, null);
    assert.deepEqual(pnr.unparsed, ["please book two seats", "some agent note"]);
    assert.equal(pnr.warnings.length, 2);
  });

  it("reads a two-digit ticketing year and rejects an impossible date", () => {
    const pnr = parsePnr("TK TL31OCT26/1200", { referenceYear: 2026 });
    assert.equal(pnr.ticketingDeadline, "2026-10-31T12:00");

    const invalid = parsePnr("TK TL32OCT/1200", { referenceYear: 2026 });
    assert.equal(invalid.ticketingDeadline, null);
    assert.equal(invalid.unparsed.includes("TK TL32OCT/1200"), true);
  });

  it("warns about a broken connection but keeps the segments", () => {
    const pnr = parsePnr(
      [
        "1 ET 873 Y 31OCT 6 LLWLUN HK1 0620 0910 31OCT",
        "2 ET 872 Y 07NOV 6 NBOLLW HK1 1750 2100 07NOV",
      ].join("\n"),
      { referenceYear: 2026 },
    );
    assert.equal(pnr.segments.length, 2);
    assert.equal(pnr.warnings.some((w) => w.includes("previous segment arrives at LUN")), true);
  });
});
