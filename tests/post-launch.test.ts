import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ageBucket,
  ageInDays,
  applyPaymentsToSchedule,
  buildAgedDebtorReport,
} from "../src/lib/aged-debtors";
import {
  chooseBankAccount,
  defaultAccountIds,
  hasExactlyOneDefault,
  sortBankAccounts,
} from "../src/lib/bank-accounts";
import { secretsEqual } from "../src/lib/secrets";
import { isStaleVersion, nextVersion } from "../src/lib/locking";
import { parseSavedView, serialiseSavedView } from "../src/lib/saved-views";
import { diffOptions, summaryForDiff } from "../src/lib/revision-diff";
import { redactAuditValue } from "../src/lib/permissions";
import { requiresTwoFactorEnrolment } from "../src/lib/two-factor-policy";
import { scoreFollowUp } from "../src/lib/followups";
import { cronAuthorised } from "../src/lib/cron-auth";
import { MAX_ATTACHMENT_BYTES, safeAttachmentName, validateAttachment } from "../src/lib/attachments";

describe("optimistic locking", () => {
  it("accepts the version the editor loaded", () => {
    assert.equal(isStaleVersion(4, 4), false);
  });

  it("rejects a write from a stale editor", () => {
    assert.equal(isStaleVersion(5, 4), true);
    assert.equal(isStaleVersion(4, 5), true);
  });

  it("increments the stored version after a successful save", () => {
    assert.equal(nextVersion(1), 2);
    assert.equal(nextVersion(41), 42);
  });
});

describe("shared secrets", () => {
  it("compares secrets without leaking length differences", () => {
    assert.equal(secretsEqual("abc", "abc"), true);
    assert.equal(secretsEqual("abc", "abd"), false);
    assert.equal(secretsEqual("abc", "abcd"), false);
  });
});

describe("aged debtors", () => {
  const asOf = new Date("2026-11-01T12:00:00.000Z");

  it("puts a not-yet-due balance in current", () => {
    assert.equal(ageBucket(ageInDays(new Date("2026-11-10T00:00:00Z"), new Date(), asOf)), "current");
  });

  it("uses 30/60/90 day buckets", () => {
    assert.equal(ageBucket(1), "1-30");
    assert.equal(ageBucket(30), "1-30");
    assert.equal(ageBucket(31), "31-60");
    assert.equal(ageBucket(60), "31-60");
    assert.equal(ageBucket(61), "61-90");
    assert.equal(ageBucket(90), "61-90");
    assert.equal(ageBucket(91), "90+");
  });

  it("derives the balance from total minus payments, including reversals", () => {
    const report = buildAgedDebtorReport(
      [
        {
          currency: "MWK",
          totalMinor: 100_000n,
          paidMinor: 25_000n,
          dueDate: new Date("2026-09-01T00:00:00Z"),
          issueDate: new Date("2026-08-01T00:00:00Z"),
        },
      ],
      asOf,
    );
    assert.equal(report.rows[0].balanceMinor, 75_000n);
    assert.equal(report.rows[0].bucket, "61-90");
    assert.equal(report.totals.get("MWK"), 75_000n);
  });

  it("omits cancelled and fully paid pro formas", () => {
    const report = buildAgedDebtorReport(
      [
        {
          currency: "MWK",
          totalMinor: 100_000n,
          paidMinor: 100_000n,
          dueDate: new Date("2026-09-01T00:00:00Z"),
          issueDate: new Date("2026-08-01T00:00:00Z"),
        },
        {
          currency: "MWK",
          totalMinor: 50_000n,
          paidMinor: 0n,
          dueDate: new Date("2026-09-01T00:00:00Z"),
          issueDate: new Date("2026-08-01T00:00:00Z"),
          cancelled: true,
        },
      ],
      asOf,
    );
    assert.equal(report.rows.length, 0);
  });

  it("keeps currencies apart in bucket totals", () => {
    const report = buildAgedDebtorReport(
      [
        { currency: "MWK", totalMinor: 10_000n, paidMinor: 0n, dueDate: new Date("2026-10-01"), issueDate: new Date("2026-09-01") },
        { currency: "USD", totalMinor: 5_000n, paidMinor: 0n, dueDate: new Date("2026-10-01"), issueDate: new Date("2026-09-01") },
      ],
      asOf,
    );
    assert.equal(report.buckets.find((bucket) => bucket.bucket === "31-60")?.amounts.get("MWK"), 10_000n);
    assert.equal(report.buckets.find((bucket) => bucket.bucket === "31-60")?.amounts.get("USD"), 5_000n);
  });

  it("applies payments to instalments oldest first without typing a status", () => {
    const progress = applyPaymentsToSchedule(
      [
        { id: "b", label: "Balance", dueDate: new Date("2026-11-15"), amountMinor: 60_000n },
        { id: "a", label: "Deposit", dueDate: new Date("2026-11-01"), amountMinor: 40_000n },
      ],
      50_000n,
      new Date("2026-11-02T00:00:00Z"),
    );
    assert.deepEqual(
      progress.map((entry) => [entry.id, entry.paidMinor.toString(), entry.state]),
      [
        ["a", "40000", "paid"],
        ["b", "10000", "part_paid"],
      ],
    );
  });
});

describe("bank account default", () => {
  const accounts = [
    { id: "a", label: "Stanbic MWK", currency: "MWK", isDefault: true, isArchived: false, sortOrder: 1 },
    { id: "b", label: "Standard USD", currency: "USD", isDefault: false, isArchived: false, sortOrder: 2 },
    { id: "c", label: "Old account", currency: "MWK", isDefault: false, isArchived: true, sortOrder: 0 },
  ];

  it("finds the single active default", () => {
    assert.deepEqual(defaultAccountIds(accounts), ["a"]);
    assert.equal(hasExactlyOneDefault(accounts), true);
  });

  it("rejects two defaults", () => {
    assert.equal(
      hasExactlyOneDefault([...accounts, { ...accounts[1], id: "d", isDefault: true }]),
      false,
    );
  });

  it("uses the explicitly chosen active account", () => {
    assert.equal(chooseBankAccount(accounts, "b")?.id, "b");
  });

  it("falls back to the default when none was chosen or the choice is archived", () => {
    assert.equal(chooseBankAccount(accounts, undefined)?.id, "a");
    assert.equal(chooseBankAccount(accounts, "c")?.id, "a");
    assert.equal(chooseBankAccount(accounts, "missing")?.id, "a");
  });

  it("sorts by sortOrder then label", () => {
    assert.deepEqual(
      sortBankAccounts([
        { label: "Zeta", sortOrder: 1 },
        { label: "Alpha", sortOrder: 2 },
        { label: "Beta", sortOrder: 1 },
      ]).map((entry) => entry.label),
      ["Beta", "Zeta", "Alpha"],
    );
  });
});

describe("saved table views", () => {
  it("round-trips column visibility, sort and filters", () => {
    const state = {
      globalFilter: "Banda",
      sorting: [{ id: "issuedIso", desc: true }],
      filters: [{ id: "status", value: "sent" }],
      visibility: { total: false, status: true },
    };
    assert.deepEqual(parseSavedView(serialiseSavedView(state)), state);
  });

  it("returns null for malformed or missing state", () => {
    assert.equal(parseSavedView(null), null);
    assert.equal(parseSavedView("not json"), null);
    assert.equal(parseSavedView(JSON.stringify({ globalFilter: 1 })), null);
  });
});

describe("revision diff", () => {
  const base = {
    number: "QT-01-0001",
    revision: 1,
    issueDate: "2026-10-31",
    validUntil: "2026-11-07",
    currency: "MWK",
    options: [
      {
        label: "Option A",
        pnr: "ABC123",
        totalMinor: "100000",
        lines: [{ description: "Adult — John Banda", amountMinor: "100000" }],
        flights: [
          {
            airline: "ET",
            flightNo: "875",
            fromIata: "LLW",
            toIata: "ADD",
            departLocal: "2026-11-10T06:20",
            arriveLocal: "2026-11-10T12:35",
          },
        ],
      },
    ],
  };

  it("marks an unchanged revision as unchanged", () => {
    const diff = diffOptions(base, {
      ...base,
      revision: 2,
      number: "QT-01-0001-R2",
    });
    assert.equal(diff[0].state, "same");
    assert.equal(diff[0].totalChanged, false);
  });

  it("flags changed lines, totals and flights", () => {
    const diff = diffOptions(base, {
      ...base,
      revision: 2,
      options: [
        {
          ...base.options[0],
          pnr: "XYZ999",
          totalMinor: "110000",
          lines: [{ description: "Adult — John Banda", amountMinor: "110000" }],
          flights: [
            {
              airline: "ET",
              flightNo: "875",
              fromIata: "LLW",
              toIata: "ADD",
              departLocal: "2026-11-11T06:20",
              arriveLocal: "2026-11-11T12:35",
            },
          ],
        },
      ],
    });
    assert.equal(diff[0].state, "changed");
    assert.equal(diff[0].totalChanged, true);
    assert.equal(diff[0].pnrChanged, true);
    assert.equal(diff[0].lines.after[0].state, "added");
    assert.equal(diff[0].lines.before[0].state, "removed");
    assert.equal(diff[0].flights.after[0].state, "added");
  });

  it("flags added and removed options", () => {
    const diff = diffOptions(base, {
      ...base,
      revision: 2,
      options: [
        { ...base.options[0] },
        {
          label: "Option B",
          totalMinor: "90000",
          lines: [{ description: "Adult — John Banda", amountMinor: "90000" }],
          flights: [],
        },
      ],
    });
    assert.equal(diff.find((option) => option.label === "Option B")?.state, "added");
    assert.deepEqual(summaryForDiff(diff), { added: 1, removed: 0, changed: 0, unchanged: 1 });
  });
});

describe("follow-up prioritisation", () => {
  const now = new Date("2026-11-01T00:00:00Z");
  const base = {
    quotationId: "q1",
    number: "QT-01-0001",
    customerName: "Chirwa",
    sentAt: new Date("2026-10-20T00:00:00Z"),
    validUntil: new Date("2026-11-20T00:00:00Z"),
  };

  it("scores an expiring quotation with a ticketing deadline above a quiet one", () => {
    const urgent = scoreFollowUp(
      { ...base, validUntil: new Date("2026-11-02T00:00:00Z"), ticketingDeadline: new Date("2026-11-01T12:00:00Z") },
      now,
    );
    const quiet = scoreFollowUp(base, now);
    assert.ok(urgent.score > quiet.score);
    assert.ok(urgent.reasons.some((reason) => reason.includes("Ticketing")));
    assert.match(urgent.nextAction, /ticketing/i);
  });

  it("always suggests an action and caps the score", () => {
    const result = scoreFollowUp({ ...base, validUntil: new Date("2026-10-01T00:00:00Z") }, now);
    assert.ok(result.score <= 100);
    assert.ok(result.nextAction.length > 0);
  });
});

describe("cron guard", () => {
  const secret = "cron-9f7b0e4d2a6c8b1f";
  it("accepts a bearer secret and no longer accepts one in the URL", () => {
    assert.equal(cronAuthorised({ secretEnv: secret, authorization: `Bearer ${secret}`, nodeEnv: "production" }), true);
    assert.equal(cronAuthorised({ secretEnv: secret, authorization: null, nodeEnv: "production" }), false);
  });

  it("fails closed in production and open only in development/test when no secret is set", () => {
    assert.equal(cronAuthorised({ secretEnv: "", nodeEnv: "production" }), false);
    assert.equal(cronAuthorised({ secretEnv: "", nodeEnv: undefined }), false);
    assert.equal(cronAuthorised({ secretEnv: "", nodeEnv: "development" }), true);
    assert.equal(cronAuthorised({ secretEnv: "", nodeEnv: "test" }), true);
  });

  it("rejects a wrong, short or example secret", () => {
    assert.equal(cronAuthorised({ secretEnv: secret, authorization: "Bearer wrong", nodeEnv: "production" }), false);
    assert.equal(cronAuthorised({ secretEnv: "short", authorization: "Bearer short", nodeEnv: "production" }), false);
    assert.equal(
      cronAuthorised({
        secretEnv: "change-me-to-a-long-random-string",
        authorization: "Bearer change-me-to-a-long-random-string",
        nodeEnv: "production",
      }),
      false,
    );
  });
});

describe("attachment validation", () => {
  it("accepts a PDF within the size limit", () => {
    const result = validateAttachment({ name: "Supplier Confirmation.PDF", type: "application/pdf", size: 1024 });
    assert.equal(result.ok, true);
    assert.equal(result.safeName, "Supplier-Confirmation.PDF");
  });

  it("rejects oversized files and type/extension mismatches", () => {
    assert.equal(validateAttachment({ name: "a.pdf", type: "application/pdf", size: MAX_ATTACHMENT_BYTES + 1 }).ok, false);
    assert.equal(validateAttachment({ name: "a.exe", type: "application/pdf", size: 10 }).ok, false);
    assert.equal(validateAttachment({ name: "a.pdf", type: "image/png", size: 10 }).ok, false);
  });

  it("strips path traversal from stored names", () => {
    assert.equal(safeAttachmentName("../../etc/passwd.pdf"), "passwd.pdf");
  });
});

describe("history redaction", () => {
  it("removes nested cost, rate and margin fields for a role without viewCosts", () => {
    const redacted = redactAuditValue({
      number: "QT-01-0001",
      options: [{ label: "Option A", costMinor: "123", rateMicro: "1750000", marginValue: "1200", totalMinor: "456" }],
    }) as { number: string; options: { label: string; totalMinor: string }[] };
    assert.equal(redacted.number, "QT-01-0001");
    assert.equal(redacted.options[0].label, "Option A");
    assert.equal("costMinor" in redacted.options[0], false);
    assert.equal("rateMicro" in redacted.options[0], false);
    assert.equal("marginValue" in redacted.options[0], false);
  });
});



describe("per-role 2FA enrolment policy", () => {
  it("requires enrolment only for listed roles that have not enrolled", () => {
    assert.equal(requiresTwoFactorEnrolment({ role: "admin", enabled: false, requiredRoles: ["admin"] }), true);
    assert.equal(requiresTwoFactorEnrolment({ role: "admin", enabled: true, requiredRoles: ["admin"] }), false);
    assert.equal(requiresTwoFactorEnrolment({ role: "agent", enabled: false, requiredRoles: ["admin"] }), false);
    assert.equal(requiresTwoFactorEnrolment({ role: "agent", enabled: false, requiredRoles: [] }), false);
  });
});
