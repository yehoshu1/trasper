import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  calculateOption,
  convertMinor,
  PricingError,
  roundDiv,
  roundToUnit,
  sumLinePrices,
  type PricingInput,
} from "../src/lib/pricing/index";

const USD = (dollars: number) => BigInt(dollars) * 100n;

function workedExampleInput(vatEnabled: boolean): PricingInput {
  return {
    lines: [
      { id: "a1", description: "Adult 1", costMinor: USD(900), kind: "fare" },
      { id: "a2", description: "Adult 2", costMinor: USD(900), kind: "fare" },
      { id: "c1", description: "Child", costMinor: USD(700), kind: "fare" },
      { id: "v1", description: "Visa", costMinor: USD(80), kind: "service" },
    ],
    rateMicro: 1_750_000_000n, // 1 USD = 1,750 MWK
    marginKind: "percent",
    marginValue: 1_000n, // 10%
    vatEnabled,
    vatRateBps: 1_650n, // 16.5%
    taxes: [],
    roundingUnit: 100n, // whole kwacha
  };
}

describe("rounding helpers", () => {
  it("rounds halves away from zero", () => {
    assert.equal(roundDiv(5n, 2n), 3n);
    assert.equal(roundDiv(-5n, 2n), -3n);
    assert.equal(roundDiv(4n, 2n), 2n);
    assert.equal(roundDiv(1n, 3n), 0n);
  });

  it("rounds to the rounding unit", () => {
    assert.equal(roundToUnit(1_234n, 100n), 1_200n);
    assert.equal(roundToUnit(1_250n, 100n), 1_300n);
    assert.equal(roundToUnit(-1_250n, 100n), -1_300n);
  });
});

describe("currency conversion", () => {
  it("converts at the stored rate, rounding one line at a time", () => {
    assert.equal(convertMinor(90_000n, 1_750_000_000n), 157_500_000n);
    assert.equal(convertMinor(101n, 1_750_500_000n), 176_801n);
  });

  it("rejects a missing rate", () => {
    assert.throws(() => convertMinor(100n, 0n), PricingError);
  });
});

describe("worked example from the pricing rules", () => {
  it("matches the illustrated totals with VAT on", () => {
    const result = calculateOption(workedExampleInput(true));

    assert.equal(result.costTotalMinor, 451_500_000n);
    assert.equal(result.markupMinor, 45_150_000n);
    assert.equal(result.vatMinor, 7_449_750n);
    assert.equal(result.taxesMinor, 0n);
    assert.equal(result.unroundedTotalMinor, 504_099_750n);
    assert.equal(result.totalMinor, 504_099_800n);
    assert.equal(result.profitMinor, 45_150_000n);

    assert.deepEqual(
      result.lines.map((line) => line.priceMinor),
      [175_848_800n, 175_848_800n, 136_771_300n, 15_630_900n],
    );
    assert.equal(sumLinePrices(result), result.totalMinor);
  });

  it("matches the illustrated totals with VAT off", () => {
    const result = calculateOption(workedExampleInput(false));
    assert.equal(result.totalMinor, 496_650_000n);
    assert.equal(result.vatMinor, 0n);
    assert.deepEqual(
      result.lines.map((line) => line.priceMinor),
      [173_250_000n, 173_250_000n, 134_750_000n, 15_400_000n],
    );
    assert.equal(sumLinePrices(result), result.totalMinor);
  });

  it("never charges VAT on cost or taxes", () => {
    const result = calculateOption({
      ...workedExampleInput(true),
      taxes: [
        { id: "t1", name: "Airport tax", kind: "fixed", value: 100_000n, enabled: true },
      ],
    });
    // VAT is still 16.5% of the 451,500 markup only.
    assert.equal(result.vatMinor, 7_449_750n);
    assert.equal(result.taxesMinor, 100_000n);
    assert.equal(result.totalMinor, 504_199_800n);
  });
});

describe("margins and taxes", () => {
  const base: PricingInput = {
    lines: [{ id: "l1", description: "Fare", costMinor: 100_000n }],
    rateMicro: 1_000_000n,
    marginKind: "percent",
    marginValue: 1_000n,
    vatEnabled: false,
    vatRateBps: 0n,
    taxes: [],
    roundingUnit: 1n,
  };

  it("supports a lump-sum margin", () => {
    const result = calculateOption({ ...base, marginKind: "lump", marginValue: 25_000n });
    assert.equal(result.markupMinor, 25_000n);
    assert.equal(result.totalMinor, 125_000n);
    assert.equal(result.lines[0].priceMinor, 125_000n);
  });

  it("applies a lump-sum margin per traveller", () => {
    const result = calculateOption({
      ...base,
      marginKind: "lump",
      marginValue: 25_000n,
      marginUnits: 3,
    });
    assert.equal(result.markupMinor, 75_000n);
    assert.equal(result.totalMinor, 175_000n);
    assert.equal(result.lines[0].priceMinor, 175_000n);
  });

  it("supports fixed and percentage taxes, and ignores disabled ones", () => {
    const result = calculateOption({
      ...base,
      vatEnabled: true,
      vatRateBps: 1_650n,
      roundingUnit: 100n,
      taxes: [
        { id: "t1", name: "Immigration", kind: "fixed", value: 5_000n, enabled: true },
        { id: "t2", name: "Levy", kind: "percent", value: 200n, enabled: true },
        { id: "t3", name: "Disabled", kind: "fixed", value: 999_999n, enabled: false },
      ],
    });
    assert.equal(result.taxesMinor, 7_000n);
    assert.equal(result.taxes.length, 2);
    assert.equal(result.totalMinor, 118_700n);
    assert.equal(sumLinePrices(result), result.totalMinor);
  });

  it("allows a negative margin (admin override) without breaking the total", () => {
    const result = calculateOption({ ...base, marginValue: -1_000n });
    assert.equal(result.markupMinor, -10_000n);
    assert.equal(result.totalMinor, 90_000n);
    assert.equal(result.lines[0].priceMinor, 90_000n);
  });

  it("rejects an impossible negative margin", () => {
    assert.throws(
      () => calculateOption({ ...base, marginValue: -100_001n }),
      PricingError,
    );
  });

  it("handles zero fares (infants) and zero cost totals", () => {
    const zero = calculateOption({
      ...base,
      lines: [
        { id: "adult", description: "Adult", costMinor: 100_000n },
        { id: "infant", description: "Infant", costMinor: 0n },
      ],
    });
    assert.equal(zero.lines[1].priceMinor, 0n);

    const noCost = calculateOption({
      ...base,
      marginKind: "lump",
      marginValue: 10_000n,
      lines: [
        { id: "a", description: "A", costMinor: 0n },
        { id: "b", description: "B", costMinor: 0n },
      ],
    });
    assert.equal(noCost.totalMinor, 10_000n);
    assert.deepEqual(noCost.lines.map((l) => l.priceMinor), [0n, 10_000n]);
  });

  it("rounds the total once at the end", () => {
    const result = calculateOption({
      ...base,
      marginValue: 3_333n,
      roundingUnit: 100n,
    });
    // cost 100,000 + markup 33,330 = 133,330 -> 1,333 units -> 1,300
    assert.equal(result.unroundedTotalMinor, 133_330n);
    assert.equal(result.totalMinor, 133_300n);
  });
});

describe("invariants across a table of cases", () => {
  const cases: PricingInput[] = [
    {
      lines: [
        { id: "1", description: "One", costMinor: 12_345n },
        { id: "2", description: "Two", costMinor: 67_890n },
        { id: "3", description: "Three", costMinor: 1n },
      ],
      rateMicro: 1_000_000n,
      marginKind: "percent",
      marginValue: 1_234n,
      vatEnabled: true,
      vatRateBps: 1_650n,
      taxes: [{ id: "t", name: "Tax", kind: "percent", value: 150n, enabled: true }],
      roundingUnit: 100n,
    },
    {
      lines: [
        { id: "1", description: "USD", costMinor: 99_999n },
        { id: "2", description: "USD 2", costMinor: 1n },
      ],
      rateMicro: 1_750_500_000n,
      marginKind: "lump",
      marginValue: 12_345n,
      vatEnabled: false,
      vatRateBps: 0n,
      taxes: [],
      roundingUnit: 1n,
    },
    {
      lines: [
        { id: "1", description: "Zero", costMinor: 0n },
        { id: "2", description: "Zero 2", costMinor: 0n },
        { id: "3", description: "Paid", costMinor: 500_000n },
      ],
      rateMicro: 1_000_000n,
      marginKind: "percent",
      marginValue: 2_000n,
      vatEnabled: true,
      vatRateBps: 1_650n,
      taxes: [{ id: "t", name: "Fixed", kind: "fixed", value: 7_777n, enabled: true }],
      roundingUnit: 1n,
    },
  ];

  cases.forEach((input, index) => {
    it(`case ${index + 1}: line prices equal the total`, () => {
      const result = calculateOption(input);
      assert.equal(sumLinePrices(result), result.totalMinor);
      assert.equal(
        result.totalMinor % input.roundingUnit,
        0n,
        "total respects the rounding unit",
      );
    });
  });
});

describe("input validation", () => {
  const base: PricingInput = {
    lines: [{ id: "l", description: "Line", costMinor: 100n }],
    rateMicro: 1_000_000n,
    marginKind: "percent",
    marginValue: 1_000n,
    vatEnabled: false,
    vatRateBps: 0n,
    taxes: [],
    roundingUnit: 1n,
  };

  it("requires at least one line", () => {
    assert.throws(() => calculateOption({ ...base, lines: [] }), PricingError);
  });

  it("requires a positive rounding unit", () => {
    assert.throws(() => calculateOption({ ...base, roundingUnit: 0n }), PricingError);
  });

  it("rejects negative VAT", () => {
    assert.throws(
      () => calculateOption({ ...base, vatEnabled: true, vatRateBps: -1n }),
      PricingError,
    );
  });
});
