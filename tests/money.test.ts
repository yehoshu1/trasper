import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  formatMoney,
  formatPercent,
  formatRateMicro,
  minorToDecimalString,
  parseMoneyToMinor,
  parsePercentToBps,
  parseRateToMicro,
} from "../src/lib/money";

describe("money parsing and formatting", () => {
  it("formats minor units with grouping", () => {
    assert.equal(formatMoney(504_099_800n, "MWK"), "MWK 5,040,998.00");
    assert.equal(formatMoney(123_45n, "USD"), "USD 123.45");
    assert.equal(formatMoney(-1_250n, "USD"), "-USD 12.50");
    assert.equal(formatMoney(1_500n, "TZS"), "TZS 1,500");
  });

  it("parses amounts without floating point", () => {
    assert.equal(parseMoneyToMinor("1,758,488.00", "MWK"), 175_848_800n);
    assert.equal(parseMoneyToMinor("123.4", "USD"), 12_340n);
    assert.equal(parseMoneyToMinor("1234", "TZS"), 1_234n);
    assert.equal(parseMoneyToMinor("-10.50", "USD"), -1_050n);
    assert.throws(() => parseMoneyToMinor("10.123", "USD"));
    assert.throws(() => parseMoneyToMinor("abc", "USD"));
  });

  it("round-trips amounts for form inputs", () => {
    assert.equal(minorToDecimalString(175_848_800n, "MWK"), "1758488.00");
    assert.equal(minorToDecimalString(-1_050n, "USD"), "-10.50");
  });

  it("parses rates and percentages as scaled integers", () => {
    assert.equal(parseRateToMicro("1,750.5"), 1_750_500_000n);
    assert.equal(parseRateToMicro("0.85"), 850_000n);
    assert.equal(formatRateMicro(1_750_500_000n), "1750.5");
    assert.equal(parsePercentToBps("16.5"), 1_650n);
    assert.equal(parsePercentToBps("10%"), 1_000n);
    assert.equal(parsePercentToBps("-2.25"), -225n);
    assert.equal(formatPercent(1_650n), "16.5%");
    assert.equal(formatPercent(1_000n), "10%");
    assert.throws(() => parsePercentToBps("1.234"));
  });
});
