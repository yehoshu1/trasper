import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { activeNavHref, navHrefMatches } from "../src/lib/nav-active";

describe("sidebar active link", () => {
  it("highlights only the most specific report link", () => {
    assert.equal(
      activeNavHref("/reports/aged-debtors", [
        "/reports",
        "/reports/aged-debtors",
      ]),
      "/reports/aged-debtors",
    );
  });

  it("keeps the parent link active on a detail page", () => {
    assert.equal(activeNavHref("/quotations/abc123", ["/quotations", "/customers"]), "/quotations");
  });

  it("matches an exact link", () => {
    assert.equal(activeNavHref("/reports", ["/reports", "/reports/aged-debtors"]), "/reports");
  });

  it("does not match a sibling path with the same prefix", () => {
    assert.equal(navHrefMatches("/reports-old", "/reports"), false);
    assert.equal(activeNavHref("/reports-old", ["/reports"]), null);
  });

  it("matches the dashboard only on its own route", () => {
    assert.equal(navHrefMatches("/dashboard", "/dashboard"), true);
    assert.equal(navHrefMatches("/dashboard/activity", "/dashboard"), true);
    assert.equal(navHrefMatches("/quotations", "/dashboard"), false);
    assert.equal(navHrefMatches("/", "/"), true);
  });

  it("returns null when nothing matches", () => {
    assert.equal(activeNavHref("/unknown", ["/reports", "/quotations"]), null);
  });
});
