import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { calculateOption } from "../src/lib/pricing";
import { presentPricing } from "../src/lib/pricing/presentation";
import { proformaInvoiceLines } from "../src/lib/proforma-invoice";

const vat = {
  enabled: false,
  rateBps: 0n,
  roundingUnit: 1n,
};

describe("pro forma invoice lines", () => {
  it("turns a named fare into a flight-ticket line", () => {
    const result = calculateOption({
      lines: [{ id: "f1", description: "Adult — John Banda", costMinor: 100_000n, kind: "fare" }],
      rateMicro: 1_000_000n,
      marginKind: "percent",
      marginValue: 1_000n,
      vatEnabled: vat.enabled,
      vatRateBps: vat.rateBps,
      taxes: [],
      roundingUnit: vat.roundingUnit,
    });
    const presentation = presentPricing(result, {
      priceDisplay: "lump_sum",
      taxDisplay: "included",
      passengerCount: 1,
    });
    const lines = proformaInvoiceLines({
      lines: result.lines.map((line) => ({
        description: line.description,
        amountMinor: line.priceMinor.toString(),
      })),
      presentation,
      totalMinor: result.totalMinor.toString(),
    });
    assert.equal(lines[0]?.description, "Flight ticket for John Banda");
    assert.equal(lines[0]?.quantity, 1);
    assert.equal(lines[0]?.amountMinor, "110000");
  });

  it("keeps group quantity and unit price on the line", () => {
    const result = calculateOption({
      lines: [
        {
          id: "f1",
          description: "2 Adults",
          costMinor: 100_000n,
          kind: "fare",
          quantity: 2,
          unit: "person",
        },
      ],
      rateMicro: 1_000_000n,
      marginKind: "percent",
      marginValue: 1_000n,
      vatEnabled: vat.enabled,
      vatRateBps: vat.rateBps,
      taxes: [],
      roundingUnit: vat.roundingUnit,
    });
    const presentation = presentPricing(result, {
      priceDisplay: "lump_sum",
      taxDisplay: "included",
      passengerCount: 2,
    });
    const lines = proformaInvoiceLines({
      lines: result.lines.map((line) => ({
        description: line.description,
        amountMinor: line.priceMinor.toString(),
      })),
      presentation,
      totalMinor: result.totalMinor.toString(),
    });
    assert.equal(lines[0]?.description, "Flight tickets for 2 Adults");
    assert.equal(lines[0]?.quantity, 2);
    assert.equal(lines[0]?.unitAmountMinor, "55000");
    assert.equal(lines[0]?.amountMinor, "110000");
  });

  it("lists the group passengers by name", () => {
    const result = calculateOption({
      lines: [
        {
          id: "f1",
          description: "2 Adults",
          costMinor: 100_000n,
          kind: "fare",
          quantity: 2,
          unit: "person",
        },
      ],
      rateMicro: 1_000_000n,
      marginKind: "percent",
      marginValue: 1_000n,
      vatEnabled: vat.enabled,
      vatRateBps: vat.rateBps,
      taxes: [],
      roundingUnit: vat.roundingUnit,
    });
    const presentation = presentPricing(result, {
      priceDisplay: "lump_sum",
      taxDisplay: "included",
      passengerCount: 2,
    });
    const lines = proformaInvoiceLines({
      lines: result.lines.map((line) => ({
        description: line.description,
        amountMinor: line.priceMinor.toString(),
      })),
      presentation,
      passengers: [
        { firstName: "John", lastName: "Banda", type: "adult" },
        { firstName: "Mary", lastName: "Phiri", type: "adult" },
      ],
      totalMinor: result.totalMinor.toString(),
    });
    assert.equal(
      lines[0]?.description,
      "Flight tickets for\nJohn Banda (adult)\nMary Phiri (adult)",
    );
    assert.equal(lines[0]?.quantity, 2);
    assert.equal(lines[0]?.unitAmountMinor, "55000");
  });
});
