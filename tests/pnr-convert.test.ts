import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  convertToPnr,
  parsedFromAiProposal,
  pnrResultFromParsed,
} from "../src/lib/pnr/convert";
import { parsePnr } from "../src/lib/pnr";
import { titleCaseCarrier } from "../src/lib/documents";
import { aiItineraryProposalSchema, pnrConvertInputSchema } from "../src/lib/schemas";

const ITINERARY = `ET873 | 31 Oct 2026 | LLW - LUN | 06:20 - 09:10
ET874 | 07 Nov 2026 | LUN - LLW | 10:15 - 12:05
PAX: CHIRWA/ALICE MR, BANDA/BOB`;

describe("itinerary to PNR conversion", () => {
  it("converts a pipe-separated itinerary into a canonical PNR", () => {
    const result = convertToPnr(ITINERARY, { referenceYear: 2026 });

    assert.equal(result.format, "itinerary");
    assert.equal(result.segments.length, 2);
    assert.deepEqual(
      result.segments.map((segment) => `${segment.airline}${segment.flightNo} ${segment.fromIata}-${segment.toIata}`),
      ["ET873 LLW-LUN", "ET874 LUN-LLW"],
    );
    assert.equal(result.passengers.length, 2);
    assert.equal(result.passengers[0].lastName, "CHIRWA");
    assert.equal(result.passengers[0].title, "MR");
    assert.equal(result.passengers[1].lastName, "BANDA");

    assert.match(result.pnrText, /^1\s+ET 873\s+Y 31OCT LLWLUN HK1\s+0620 0910/m);
    assert.match(result.pnrText, /^2\s+ET 874\s+Y 07NOV LUNLLW HK1\s+1015 1205/m);
    assert.match(result.pnrText, /^1 CHIRWA\/ALICE MR$/m);
    assert.match(result.pnrText, /^2 BANDA\/BOB$/m);

    const reparsed = parsePnr(result.pnrText, { referenceYear: 2026 });
    assert.equal(reparsed.segments.length, 2);
    assert.equal(reparsed.passengers.length, 2);
  });

  it("reads ISO dates, compact times and separate airport tokens", () => {
    const result = convertToPnr("ET 874 2026-11-07 LUN LLW 1015 1205", { referenceYear: 2026 });
    assert.equal(result.segments.length, 1);
    assert.equal(result.segments[0].departLocal, "2026-11-07T10:15");
    assert.equal(result.segments[0].arriveLocal, "2026-11-07T12:05");
    assert.match(result.pnrText, /07NOV LUNLLW HK1\s+1015 1205/);
  });

  it("splits a one-line itinerary export and accepts blank flight numbers", () => {
    const result = convertToPnr(
      "LILONGWE→VIENNA-RETURN 1 . ET 31OCT LLW (LILONGWE) DAR (DARESALAAM) 1600 2010 SA OPERATED BY MALAWIAN AIRLINES 2 . ET 01NOV DAR (DARESALAAM) ADD (ADDIS) 1845 2125 SU 3 . ET 02NOV ADD ( ADDIS) VIE (VIENNA) 0130 0605 MO 4 . ET 07NOV VIE (VIENNA) ADD (ADDIS) 2230 #0630 SA/SU 2 5 . ET 08NOV ADD (ADDIS) LLW (LILONGWE) 1010 1310 SU 2",
      { referenceYear: 2026 },
    );

    assert.equal(result.segments.length, 5);
    assert.deepEqual(
      result.segments.map((segment) => segment.airline),
      ["ET", "ET", "ET", "ET", "ET"],
    );
    assert.deepEqual(
      result.segments.map((segment) => `${segment.fromIata}${segment.toIata}`),
      ["LLWDAR", "DARADD", "ADDVIE", "VIEADD", "ADDLLW"],
    );
    assert.equal(result.segments[0].flightNo, "XXX");
    assert.equal(result.segments[0].departLocal, "2026-10-31T16:00");
    assert.equal(result.segments[3].arriveLocal, "2026-11-08T06:30");
    assert.match(result.pnrText, /1\s+ET XXX\s+Y 31OCT LLWDAR HK1\s+1600 2010/);
    assert.doesNotMatch(result.pnrText, /OPERATED BY/);
    assert.equal(result.segments[0].operatingCarrier, "MALAWIAN AIRLINES");
    assert.match(result.pnrText, /0630\+1/);
    assert.ok(result.warnings.some((warning) => /XXX/.test(warning)));

    // The exact output pasted back into the quotation PNR box must parse.
    const reparsed = parsePnr(result.pnrText, { referenceYear: 2026 });
    assert.equal(reparsed.segments.length, 5);
    assert.equal(reparsed.unparsed.length, 0);
  });

  it("keeps an overnight arrival on the next calendar day", () => {
    const result = convertToPnr("ET XXX 07 Nov 2026 VIE ADD 2230 0630+1", { referenceYear: 2026 });
    assert.equal(result.segments[0].departLocal, "2026-11-07T22:30");
    assert.equal(result.segments[0].arriveLocal, "2026-11-08T06:30");
    assert.match(result.pnrText, /0630\+1/);
  });

  it("normalises booking-system output without changing the flights", () => {
    const source = [
      "1  ET 873  Y 31OCT 6 LLWLUN HK1  0620 0910  31OCT",
      "1 CHIRWA/ALICE MR",
      "TK TL31OCT/1200",
    ].join("\n");
    const result = convertToPnr(source, { referenceYear: 2026 });

    assert.equal(result.format, "pnr");
    assert.equal(result.segments.length, 1);
    assert.equal(result.passengers.length, 1);
    assert.equal(result.ticketingDeadline, "2026-10-31T12:00");
    assert.match(result.pnrText, /31OCT LLWLUN HK1\s+0620 0910/);
    assert.match(result.pnrText, /TK TL31OCT\/1200/);
  });

  it("title-cases operating carrier names for documents", () => {
    assert.equal(titleCaseCarrier("MALAWIAN AIRLINES"), "Malawian Airlines");
    assert.equal(titleCaseCarrier("AIR NEW ZEALAND"), "Air New Zealand");
  });

  it("reports unreadable input instead of inventing flights", () => {
    assert.throws(() => convertToPnr("Please send the itinerary next week", { referenceYear: 2026 }), /No flight segments/);
  });

  it("validates and canonicalises an AI proposal with Zod", () => {
    const proposal = aiItineraryProposalSchema.parse({
      segments: [
        {
          airline: "et",
          flightNo: "xxx",
          fromIata: "llw",
          toIata: "dar",
          departLocal: "2026-10-31T16:00",
          arriveLocal: "2026-10-31T20:10",
          operatingCarrier: "MALAWIAN AIRLINES",
        },
      ],
      passengers: [{ firstName: "Alice", lastName: "Chirwa", title: "MR", type: "adult" }],
      warnings: ["Flight number absent from the itinerary"],
      confidence: 0.7,
    });

    const result = pnrResultFromParsed(
      parsedFromAiProposal(proposal),
      "itinerary",
      ["Converted with AI"],
    );
    assert.equal(result.segments[0].airline, "ET");
    assert.equal(result.segments[0].flightNo, "XXX");
    assert.match(result.pnrText, /ET XXX/);
    assert.doesNotMatch(result.pnrText, /OPERATED BY/);
    assert.match(result.pnrText, /1 CHIRWA\/ALICE MR/);
    assert.match(result.warnings.join(" "), /Converted with AI/);

    assert.equal(
      aiItineraryProposalSchema.safeParse({
        segments: [{ airline: "ET", flightNo: "1", fromIata: "BAD", toIata: "LUN" }],
      }).success,
      false,
    );
  });

  it("validates the pasted text with Zod", () => {
    assert.equal(pnrConvertInputSchema.safeParse({ text: "" }).success, false);
    assert.equal(pnrConvertInputSchema.safeParse({ text: "ET873 31OCT LLWLUN 0620 0910", referenceYear: 1999 }).success, false);
    assert.equal(pnrConvertInputSchema.safeParse({ text: "ET873 31OCT LLWLUN 0620 0910", referenceYear: 2026 }).success, true);
  });
});
