import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  calculateOption,
  roundDiv,
  sumLinePrices,
  type PricingInput,
} from "../src/lib/pricing/index";
import {
  PRICE_DISPLAY_MODES,
  TAX_DISPLAY_MODES,
  presentPricing,
  sumPresentation,
  type PriceDisplayMode,
  type TaxDisplayMode,
} from "../src/lib/pricing/presentation";
import {
  computeOption,
  optionPassengerCount,
  presentOption,
  resolvePriceDisplay,
  resolveTaxDisplay,
  validateDraftOption,
  type EditorOption,
} from "../src/lib/quotation";
import { saveQuotationSchema } from "../src/lib/schemas";

const USD = (dollars: number) => BigInt(dollars) * 100n;

const baseInput: PricingInput = {
  lines: [
    {
      id: "fare-1",
      description: "Adult — Alex Morgan",
      costMinor: USD(900),
      kind: "fare",
      passengerId: "p1",
    },
    {
      id: "fare-2",
      description: "Adult — Sam Morgan",
      costMinor: USD(900),
      kind: "fare",
      passengerId: "p2",
    },
    {
      id: "hotel",
      description: "Hilton Garden Inn",
      costMinor: USD(600),
      kind: "service",
      quantity: 3,
      unit: "night",
      unitCostMinor: USD(200),
      detail: "Double room, bed & breakfast",
    },
  ],
  rateMicro: 1_750_000_000n,
  marginKind: "percent",
  marginValue: 1_000n,
  vatEnabled: true,
  vatRateBps: 1_650n,
  taxes: [
    { id: "city", name: "City tax", kind: "percent", value: 200n, enabled: true, base: "cost" },
    { id: "service", name: "Service charge", kind: "percent", value: 500n, enabled: true, base: "markup" },
    { id: "fixed", name: "Airport fee", kind: "fixed", value: 10_000n, enabled: true },
  ],
  roundingUnit: 100n,
};

describe("price presentation modes", () => {
  const result = calculateOption(baseInput);

  it("keeps the line-price invariant in the underlying result", () => {
    assert.equal(sumLinePrices(result), result.totalMinor);
  });

  for (const priceDisplay of PRICE_DISPLAY_MODES) {
    for (const taxDisplay of TAX_DISPLAY_MODES) {
      it(`${priceDisplay} + ${taxDisplay} adds up to the same total`, () => {
        const presentation = presentPricing(result, {
          priceDisplay: priceDisplay as PriceDisplayMode,
          taxDisplay: taxDisplay as TaxDisplayMode,
          passengerCount: 2,
        });
        assert.equal(sumPresentation(presentation), result.totalMinor);
      });
    }
  }

  it("keeps the traditional lump-sum layout identical to the priced lines", () => {
    const presentation = presentPricing(result, {
      priceDisplay: "lump_sum",
      taxDisplay: "included",
    });
    assert.deepEqual(
      presentation.lines.map((line) => line.amountMinor),
      result.lines.map((line) => line.priceMinor.toString()),
    );
    assert.equal(presentation.serviceFeeMinor, "0");
    assert.deepEqual(presentation.taxLines, []);
  });

  it("shows the supplier price and a separate service fee", () => {
    const presentation = presentPricing(result, {
      priceDisplay: "net_plus_fee",
      taxDisplay: "included",
    });
    assert.equal(presentation.taxLines.length, 0);
    assert.notEqual(BigInt(presentation.serviceFeeMinor), 0n);
    assert.equal(
      presentation.lines.reduce((sum, line) => sum + BigInt(line.amountMinor), 0n) +
        BigInt(presentation.serviceFeeMinor),
      result.totalMinor,
    );
  });

  it("itemises VAT and each enabled optional tax by name", () => {
    const presentation = presentPricing(result, {
      priceDisplay: "itemised",
      taxDisplay: "itemised",
    });
    assert.deepEqual(
      presentation.taxLines.map((tax) => tax.name),
      ["VAT", "City tax", "Service charge", "Airport fee"],
    );
    assert.equal(
      presentation.taxLines.reduce((sum, tax) => sum + BigInt(tax.amountMinor), 0n),
      result.vatMinor + result.taxesMinor,
    );
    assert.equal(presentation.taxLines[0].base, "markup");
    assert.equal(presentation.taxLines[1].base, "cost");
    assert.equal(presentation.taxLines[2].base, "markup");
  });

  it("promotes an itemised price layout to a combined tax row when taxes were set to included", () => {
    const presentation = presentPricing(result, {
      priceDisplay: "itemised",
      taxDisplay: "included",
    });
    assert.equal(presentation.taxDisplay, "summary");
    assert.equal(presentation.taxLines.length, 1);
    assert.equal(BigInt(presentation.taxLines[0].amountMinor), result.vatMinor + result.taxesMinor);
  });

  it("shows a combined tax row for the summary layout", () => {
    const presentation = presentPricing(result, {
      priceDisplay: "lump_sum",
      taxDisplay: "summary",
    });
    assert.equal(presentation.taxLines.length, 1);
    assert.equal(BigInt(presentation.taxLines[0].amountMinor), result.vatMinor + result.taxesMinor);
    assert.equal(sumPresentation(presentation), result.totalMinor);
  });

  it("supports a single all-in total with no line prices", () => {
    const presentation = presentPricing(result, {
      priceDisplay: "total_only",
      taxDisplay: "itemised",
    });
    assert.deepEqual(presentation.lines, []);
    assert.deepEqual(presentation.taxLines, []);
    assert.equal(presentation.totalMinor, result.totalMinor.toString());
  });

  it("shows the per-person price for a package", () => {
    const presentation = presentPricing(result, {
      priceDisplay: "per_person",
      taxDisplay: "included",
      passengerCount: 2,
    });
    assert.ok(presentation.perPersonMinor);
    assert.equal(presentation.passengerCount, 2);
    assert.equal(
      presentation.perPersonMinor,
      roundDiv(result.totalMinor, 2n).toString(),
    );
  });

  it("describes accommodation quantities and unit rates", () => {
    const presentation = presentPricing(result, {
      priceDisplay: "net_plus_fee",
      taxDisplay: "summary",
    });
    const hotel = presentation.lines.find((line) => line.description === "Hilton Garden Inn");
    assert.ok(hotel);
    assert.equal(hotel.quantity, 3);
    assert.equal(hotel.unit, "night");
    assert.equal(hotel.detail, "Double room, bed & breakfast");
    assert.ok(hotel.unitAmountMinor);
    assert.equal(BigInt(hotel.unitAmountMinor!) * 3n, BigInt(hotel.amountMinor));
  });

  it("adds a note without changing the total", () => {
    const presentation = presentPricing(result, {
      priceDisplay: "lump_sum",
      taxDisplay: "note",
      taxNote: "All taxes are included.",
    });
    assert.equal(presentation.taxNote, "All taxes are included.");
    assert.equal(sumPresentation(presentation), result.totalMinor);
  });
});

describe("optional tax bases", () => {
  const base: PricingInput = {
    lines: [{ id: "l1", description: "Hotel", costMinor: 100_000n }],
    rateMicro: 1_000_000n,
    marginKind: "percent",
    marginValue: 1_000n,
    vatEnabled: false,
    vatRateBps: 0n,
    taxes: [],
    roundingUnit: 1n,
  };

  it("charges cost-based tax on the converted cost", () => {
    const result = calculateOption({
      ...base,
      taxes: [{ id: "t", name: "Cost tax", kind: "percent", value: 1_000n, enabled: true, base: "cost" }],
    });
    assert.equal(result.taxesMinor, 10_000n);
  });

  it("charges a service-fee-based tax on the markup only", () => {
    const result = calculateOption({
      ...base,
      taxes: [{ id: "t", name: "Fee tax", kind: "percent", value: 1_000n, enabled: true, base: "markup" }],
    });
    assert.equal(result.markupMinor, 10_000n);
    assert.equal(result.taxesMinor, 1_000n);
  });

  it("charges a subtotal-based tax on cost plus markup", () => {
    const result = calculateOption({
      ...base,
      taxes: [{ id: "t", name: "Subtotal tax", kind: "percent", value: 1_000n, enabled: true, base: "subtotal" }],
    });
    assert.equal(result.taxesMinor, 11_000n);
  });

  it("leaves VAT on the markup regardless of the optional tax base", () => {
    const result = calculateOption({
      ...base,
      vatEnabled: true,
      vatRateBps: 1_650n,
      taxes: [{ id: "t", name: "Subtotal tax", kind: "percent", value: 1_000n, enabled: true, base: "subtotal" }],
    });
    assert.equal(result.vatMinor, 1_650n);
    assert.equal(result.taxesMinor, 11_000n);
    assert.equal(result.totalMinor, 122_650n);
  });
});

function editorOption(overrides: Partial<EditorOption> = {}): EditorOption {
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
    fares: [
      {
        passengerId: "p1",
        passengerName: "Alex Morgan",
        passengerType: "adult",
        costMinor: "100000",
      },
    ],
    services: [],
    taxes: [],
    ...overrides,
  };
}

describe("generalised quotation options", () => {
  it("allows an accommodation-only option with no flights", () => {
    const accommodation = editorOption({
      optionType: "accommodation",
      segments: [],
      fares: [],
      services: [
        {
          category: "hotel",
          description: "Hilton Garden Inn",
          costMinor: "525000",
          quantity: "3",
          unit: "night",
          unitCostMinor: "175000",
          details: "Double room, bed & breakfast",
        },
      ],
    });
    assert.deepEqual(validateDraftOption(accommodation).errors, []);
  });

  it("still requires flight segments for a flight option", () => {
    const flight = editorOption({ segments: [] });
    assert.ok(validateDraftOption(flight).errors.some((issue) => issue.message.includes("flight segment")));
  });

  it("counts distinct travellers for per-person pricing", () => {
    assert.equal(optionPassengerCount(editorOption()), 1);
    assert.equal(
      optionPassengerCount(
        editorOption({
          fares: [
            { passengerId: "p1", passengerName: "A", passengerType: "adult", costMinor: "1" },
            { passengerId: "p2", passengerName: "B", passengerType: "adult", costMinor: "1" },
            { passengerId: "p2", passengerName: "B", passengerType: "adult", costMinor: "1" },
          ],
        }),
      ),
      2,
    );
  });

  it("carries service quantities into the price presentation", () => {
    const option = editorOption({
      optionType: "accommodation",
      segments: [],
      fares: [],
      services: [
        {
          category: "hotel",
          description: "Beach resort",
          costMinor: "300000",
          quantity: "3",
          unit: "night",
          unitCostMinor: "100000",
        },
      ],
    });
    const computed = computeOption(option, {
      enabled: false,
      rateBps: 0n,
      roundingUnit: 1n,
    });
    const presentation = presentOption(computed, option, {
      priceDisplay: "net_plus_fee",
      taxDisplay: "included",
    });
    const line = presentation.lines[0];
    assert.equal(line.quantity, 3);
    assert.equal(line.unit, "night");
    assert.equal(BigInt(line.unitAmountMinor!), 100_000n);
  });
});

describe("multiple optional taxes", () => {
  it("accepts and itemises several optional taxes on one option", () => {
    const option = editorOption({
      taxes: [
        { name: "City tax", kind: "percent", value: "200", enabled: true, base: "cost" },
        { name: "Service charge", kind: "percent", value: "500", enabled: true, base: "markup" },
        { name: "Airport fee", kind: "fixed", value: "10000", enabled: true, base: "cost" },
        { name: "Disabled levy", kind: "fixed", value: "9999", enabled: false, base: "cost" },
      ],
    });
    const computed = computeOption(option, {
      enabled: true,
      rateBps: 1_650n,
      roundingUnit: 1n,
    });
    assert.equal(computed.result.taxes.length, 3);
    const presentation = presentOption(computed, option, {
      priceDisplay: "itemised",
      taxDisplay: "itemised",
    });
    assert.deepEqual(
      presentation.taxLines.map((tax) => tax.name),
      ["VAT", "City tax", "Service charge", "Airport fee"],
    );
    assert.equal(sumPresentation(presentation), computed.totalMinor);
  });
});

describe("presentation defaults", () => {
  it("resolves a quotation override against the agency default", () => {
    assert.equal(resolvePriceDisplay(null, "lump_sum"), "lump_sum");
    assert.equal(resolvePriceDisplay("itemised", "lump_sum"), "itemised");
    assert.equal(resolveTaxDisplay(null, "included"), "included");
    assert.equal(resolveTaxDisplay("itemised", "included"), "itemised");
  });

  it("accepts the new presentation fields and generalised option types in the save schema", () => {
    const parsed = saveQuotationSchema.safeParse({
      quotationId: "q1",
      version: 1,
      contactId: "c1",
      currency: "MWK",
      issueDate: "2026-11-01",
      validUntil: "2026-11-08",
      vatOverride: "inherit",
      pricingDisplay: "net_plus_fee",
      taxDisplay: "itemised",
      options: [
        {
          label: "Option A",
          optionType: "accommodation",
          costCurrency: "USD",
          rateMicro: "1750000000",
          marginKind: "percent",
          marginValue: "1000",
          segments: [],
          fares: [],
          services: [
            {
              category: "hotel",
              description: "Beach resort",
              costMinor: "300000",
              quantity: "3",
              unit: "night",
              unitCostMinor: "100000",
              details: "Double room, bed & breakfast",
            },
          ],
          taxes: [
            { name: "City tax", kind: "percent", value: "200", enabled: true, base: "cost" },
          ],
        },
      ],
    });
    assert.equal(parsed.success, true);
  });
});
