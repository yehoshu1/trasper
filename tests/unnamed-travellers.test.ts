import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { passengerName } from "../src/lib/documents";
import {
  computeOption,
  invariantLineTotal,
  optionPassengerCount,
  validateDraftOption,
  type EditorFare,
  type EditorOption,
} from "../src/lib/quotation";
import { fareInputSchema } from "../src/lib/schemas";

const vat = { enabled: false, rateBps: 0n, roundingUnit: 1n };

function optionWith(fares: EditorFare[]): EditorOption {
  return {
    label: "Option A",
    optionType: "flight",
    pnr: "",
    ticketingDeadline: "",
    costCurrency: "USD",
    rateMicro: "1000000",
    marginKind: "percent",
    marginValue: "1000",
    segments: [
      {
        airline: "ET",
        flightNo: "875",
        fromIata: "LLW",
        toIata: "ADD",
        departLocal: "2026-11-10T06:20",
        arriveLocal: "2026-11-10T12:35",
      },
    ],
    fares,
    services: [],
    taxes: [],
  };
}

const unnamedAdult: EditorFare = {
  passengerId: "",
  passengerName: "",
  passengerType: "adult",
  quantity: "2",
  costMinor: "100000",
};

describe("unnamed traveller groups", () => {
  it("prices a group as one line and describes the count", () => {
    const computed = computeOption(optionWith([unnamedAdult]), vat);
    assert.equal(computed.lines.length, 1);
    assert.equal(computed.lines[0].description, "2 Adults");
    // costMinor is the per-traveller cost for an unnamed group.
    assert.equal(computed.result.costTotalMinor, 200000n);
    assert.equal(computed.result.markupMinor, 20000n);
    assert.equal(computed.totalMinor, 220000n);
    assert.equal(invariantLineTotal(computed), true);
  });

  it("counts group quantities for per-person layouts", () => {
    const option = optionWith([
      unnamedAdult,
      { ...unnamedAdult, passengerType: "child", quantity: "1", costMinor: "50000" },
      { ...unnamedAdult, passengerId: "p1", passengerName: "Alex Morgan", quantity: "1", costMinor: "90000" },
    ]);
    assert.equal(optionPassengerCount(option), 4);
  });

  it("rejects two unnamed groups of the same type", () => {
    const result = validateDraftOption(optionWith([unnamedAdult, { ...unnamedAdult }]));
    assert.ok(result.errors.some((issue) => issue.message.includes("one group")));
  });

  it("rejects a group with no travellers", () => {
    const result = validateDraftOption(optionWith([{ ...unnamedAdult, quantity: "0" }]));
    assert.ok(result.errors.some((issue) => issue.message.includes("at least one traveller")));
  });

  it("allows named and unnamed travellers of the same type", () => {
    const result = validateDraftOption(
      optionWith([
        unnamedAdult,
        { ...unnamedAdult, passengerId: "p1", passengerName: "Alex Morgan", quantity: "1" },
      ]),
    );
    assert.equal(result.errors.length, 0);
  });
});

describe("fare input schema", () => {
  it("accepts an unnamed group with a quantity", () => {
    const parsed = fareInputSchema.safeParse({
      passengerId: "",
      passengerType: "adult",
      quantity: "2",
      costMinor: "100000",
    });
    assert.equal(parsed.success, true);
  });

  it("accepts a named passenger without a quantity", () => {
    const parsed = fareInputSchema.safeParse({ passengerId: "p1", costMinor: "100000" });
    assert.equal(parsed.success, true);
  });

  it("rejects a group with zero travellers", () => {
    const parsed = fareInputSchema.safeParse({
      passengerId: "",
      passengerType: "adult",
      quantity: "0",
      costMinor: "100000",
    });
    assert.equal(parsed.success, false);
  });

  it("rejects a quantity on a named passenger", () => {
    const parsed = fareInputSchema.safeParse({
      passengerId: "p1",
      quantity: "2",
      costMinor: "100000",
    });
    assert.equal(parsed.success, false);
  });
});

describe("document passenger labels", () => {
  it("prints a group as a count with names to be advised", () => {
    assert.equal(
      passengerName({ firstName: "", lastName: "", type: "adult", unnamed: true, quantity: 2 }),
      "2 Adults",
    );
    assert.equal(
      passengerName({ firstName: "", lastName: "", type: "child", unnamed: true, quantity: 1 }),
      "1 Child",
    );
  });

  it("keeps named passengers unchanged", () => {
    assert.equal(
      passengerName({ firstName: "Alex", lastName: "Morgan", type: "adult" }),
      "Alex Morgan",
    );
  });
});
