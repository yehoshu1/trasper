import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  canArchiveProforma,
  canArchiveQuotation,
  proformaArchiveError,
  quotationArchiveError,
} from "../src/lib/archive";

describe("archive rules", () => {
  it("archives only closed quotations", () => {
    for (const status of ["accepted", "declined", "expired", "cancelled", "superseded"]) {
      assert.equal(canArchiveQuotation(status), true, status);
    }
    for (const status of ["draft", "sent", "unknown"]) {
      assert.equal(canArchiveQuotation(status), false, status);
    }
  });

  it("explains why an open quotation cannot be archived", () => {
    assert.match(quotationArchiveError("draft"), /deleted rather than archived/i);
    assert.match(quotationArchiveError("sent"), /Cancel this quotation/i);
    assert.match(quotationArchiveError("accepted"), /closed quotation/i);
  });

  it("archives only pro formas with no outstanding balance", () => {
    for (const status of ["paid", "cancelled"]) {
      assert.equal(canArchiveProforma(status), true, status);
    }
    for (const status of ["unpaid", "part_paid", "unknown"]) {
      assert.equal(canArchiveProforma(status), false, status);
    }
  });

  it("explains why an open pro forma cannot be archived", () => {
    assert.match(proformaArchiveError("unpaid"), /balance is still open/i);
    assert.match(proformaArchiveError("part_paid"), /balance is still open/i);
  });
});
