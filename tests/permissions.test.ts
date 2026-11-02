import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  canViewCosts,
  hasCapability,
  PermissionError,
  redactOption,
  requireCapability,
} from "../src/lib/permissions";

describe("permission matrix", () => {
  it("gives admin every capability", () => {
    assert.equal(hasCapability("admin", "manageUsers"), true);
    assert.equal(hasCapability("admin", "manageSettings"), true);
    assert.equal(hasCapability("admin", "recordPayments"), true);
    assert.equal(hasCapability("admin", "viewCosts"), true);
    assert.equal(hasCapability("admin", "viewReports"), true);
  });

  it("lets agents manage contacts and quotations but not users or payments", () => {
    assert.equal(hasCapability("agent", "manageContacts"), true);
    assert.equal(hasCapability("agent", "manageQuotations"), true);
    assert.equal(hasCapability("agent", "viewCosts"), true);
    assert.equal(hasCapability("agent", "manageUsers"), false);
    assert.equal(hasCapability("agent", "manageSettings"), false);
    assert.equal(hasCapability("agent", "recordPayments"), false);
    assert.equal(hasCapability("agent", "viewReports"), false);
  });

  it("lets accountants see costs, payments and the audit log", () => {
    assert.equal(hasCapability("accountant", "viewCosts"), true);
    assert.equal(hasCapability("accountant", "recordPayments"), true);
    assert.equal(hasCapability("accountant", "viewAudit"), true);
    assert.equal(hasCapability("accountant", "viewReports"), true);
    assert.equal(hasCapability("accountant", "manageQuotations"), false);
    assert.equal(hasCapability("accountant", "manageUsers"), false);
  });

  it("gives viewers documents only and never costs or reports", () => {
    assert.equal(hasCapability("viewer", "viewDocuments"), true);
    assert.equal(hasCapability("viewer", "viewCosts"), false);
    assert.equal(hasCapability("viewer", "viewContacts"), false);
    assert.equal(hasCapability("viewer", "recordPayments"), false);
    assert.equal(hasCapability("viewer", "manageQuotations"), false);
    assert.equal(hasCapability("viewer", "viewReports"), false);
    assert.equal(canViewCosts("viewer"), false);
  });

  it("fails closed for an unknown role", () => {
    assert.equal(hasCapability("owner", "viewDocuments"), false);
    assert.throws(() => requireCapability("viewer", "viewCosts"), PermissionError);
    assert.doesNotThrow(() => requireCapability("agent", "manageQuotations"));
  });

  it("redacts cost fields for roles that cannot see them", () => {
    const safe = redactOption({
      id: "opt",
      label: "Option A",
      costCurrency: "USD",
      rateMicro: 1_750_000_000n,
      marginValue: 1_000n,
      marginKind: "percent",
    });
    assert.equal("rateMicro" in safe, false);
    assert.equal("marginValue" in safe, false);
    assert.equal(safe.label, "Option A");
  });
});
