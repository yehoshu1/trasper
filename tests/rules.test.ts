import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseCsv, parseContactCsv } from "../src/lib/csv";
import { saveQuotationSchema } from "../src/lib/schemas";
import { parseFrozenTotals, splitFlightLegs, type DocumentFlight } from "../src/lib/documents";
import { renderNumber, revisionNumber, splitRevision } from "../src/lib/numbering";
import { deriveStatus } from "../src/lib/payment-status";
import {
  computeOption,
  resolveVatContext,
  validateDraftOption,
  validateQuotationDraft,
  type EditorOption,
} from "../src/lib/quotation";

/** A complete, valid option; tests change one field at a time. */
function option(overrides: Partial<EditorOption> = {}): EditorOption {
  return {
    label: "Option A",
    pnr: "",
    ticketingDeadline: "",
    costCurrency: "USD",
    rateMicro: "1750000000",
    marginKind: "percent",
    marginValue: "1200",
    segments: [
      {
        airline: "ET",
        flightNo: "875",
        fromIata: "BLZ",
        toIata: "ADD",
        departLocal: "2026-11-10T06:20",
        arriveLocal: "2026-11-10T12:35",
      },
    ],
    fares: [
      {
        passengerId: "p1",
        passengerName: "John Banda",
        passengerType: "adult",
        costMinor: "62000",
      },
    ],
    services: [],
    taxes: [],
    ...overrides,
  };
}

const messages = (value: EditorOption) => validateDraftOption(value).issues.map((issue) => issue.message);
const severities = (value: EditorOption) =>
  validateDraftOption(value).issues.map((issue) => issue.severity);

describe("send-readiness rules (quotations)", () => {
  it("accepts a complete option without complaints", () => {
    assert.deepEqual(validateDraftOption(option()).issues, []);
  });

  it("blocks an option with no segments, no fares, no rate and no margin", () => {
    const issues = messages(option({ segments: [], fares: [], rateMicro: "0", marginValue: "" }));
    assert.ok(issues.some((message) => message.includes("flight segment")));
    assert.ok(issues.some((message) => message.includes("passenger fare")));
    assert.ok(issues.some((message) => message.includes("exchange rate")));
    assert.ok(issues.some((message) => message.includes("margin")));
    assert.equal(severities(option({ segments: [] }))[0], "error");
  });

  it("blocks the same passenger twice in one option", () => {
    const duplicate = option({
      fares: [
        { passengerId: "p1", passengerName: "John Banda", passengerType: "adult", costMinor: "62000" },
        { passengerId: "p1", passengerName: "John Banda", passengerType: "adult", costMinor: "62000" },
      ],
    });
    assert.ok(messages(duplicate).some((message) => message.includes("listed twice")));
  });

  it("warns when an infant travels without an adult in the option", () => {
    const infantOnly = option({
      fares: [{ passengerId: "p1", passengerName: "Baby Banda", passengerType: "infant", costMinor: "0" }],
    });
    const result = validateDraftOption(infantOnly);
    assert.ok(result.warnings.some((issue) => issue.message.includes("infant")));
    // A zero fare needs one extra confirmation but is not an error.
    assert.equal(result.requiresZeroFareConfirmation, true);
    assert.equal(result.errors.length, 0);
  });

  it("warns when a segment departs from a different airport than the previous arrival", () => {
    const mismatch = option({
      segments: [
        {
          airline: "ET", flightNo: "875", fromIata: "BLZ", toIata: "ADD",
          departLocal: "2026-11-10T06:20", arriveLocal: "2026-11-10T12:35",
        },
        {
          airline: "ET", flightNo: "920", fromIata: "NBO", toIata: "JNB",
          departLocal: "2026-11-10T16:05", arriveLocal: "2026-11-10T20:30",
        },
      ],
    });
    assert.ok(messages(mismatch).some((message) => message.includes("departs NBO but segment 1 arrives ADD")));
  });

  it("warns when a segment departs before the previous one arrives", () => {
    const outOfOrder = option({
      segments: [
        {
          airline: "ET", flightNo: "875", fromIata: "BLZ", toIata: "ADD",
          departLocal: "2026-11-10T06:20", arriveLocal: "2026-11-10T12:35",
        },
        {
          airline: "ET", flightNo: "920", fromIata: "ADD", toIata: "JNB",
          departLocal: "2026-11-10T09:00", arriveLocal: "2026-11-10T13:30",
        },
      ],
    });
    assert.ok(messages(outOfOrder).some((message) => message.includes("departs before")));
  });

  it("flags a negative margin, and only as a warning", () => {
    const negative = option({ marginValue: "-500" });
    const result = validateDraftOption(negative);
    assert.equal(result.hasNegativeMargin, true);
    assert.equal(result.errors.length, 0);
    assert.ok(result.warnings.some((issue) => issue.message.includes("negative")));
  });

  it("reports every option's problems when a whole quotation is checked", () => {
    const validation = validateQuotationDraft([
      option({ label: "Option A" }),
      option({ label: "Option B", segments: [], fares: [] }),
    ]);
    assert.equal(validation.valid, false);
    assert.ok(validation.errors.some((issue) => issue.optionLabel === "Option B"));
    assert.equal(validation.errors.every((issue) => issue.optionLabel === "Option B"), true);
  });
});

describe("VAT switch (pricing)", () => {
  const rate = 1650n;
  const rounding = 100n;

  it("follows the global setting when the quotation does not override it", () => {
    assert.equal(resolveVatContext(true, rate, null, rounding).enabled, true);
    assert.equal(resolveVatContext(false, rate, null, rounding).enabled, false);
  });

  it("lets the quotation override the global setting either way", () => {
    assert.equal(resolveVatContext(false, rate, true, rounding).enabled, true);
    assert.equal(resolveVatContext(true, rate, false, rounding).enabled, false);
  });

  it("never charges VAT on cost: VAT is computed on the markup only", () => {
    const vat = resolveVatContext(true, rate, null, rounding);
    const computed = computeOption(option({ marginKind: "lump", marginValue: "100000" }), vat);
    const { result } = computed;
    // 1000 USD cost at 1750 → cost 1,750,000; lump markup 100,000; VAT 16.5% of markup.
    assert.equal(result.vatMinor, (100_000n * 1650n) / 10_000n);
    assert.equal(result.totalMinor, result.costTotalMinor + result.markupMinor + result.vatMinor + result.taxesMinor);
  });
});

describe("document numbering", () => {
  const date = new Date("2026-10-31T10:00:00.000Z");

  it("fills the standard quotation template", () => {
    assert.equal(renderNumber("QT-{YYYY}-{SEQ:4}", 1, date), "QT-2026-0001");
    assert.equal(renderNumber("QT-{YYYY}-{SEQ:4}", 12345, date), "QT-2026-12345");
  });

  it("supports short years and months, and pads an unqualified sequence to four digits", () => {
    assert.equal(renderNumber("IT-{YY}-{MM}-{SEQ}", 7, date), "IT-26-10-0007");
    assert.equal(renderNumber("IT-{YY}-{MM}-{SEQ:2}", 7, date), "IT-26-10-07");
  });

  it("adds -R2, -R3 to revisions without consuming the sequence", () => {
    assert.equal(revisionNumber("QT-2026-0001", 2), "QT-2026-0001-R2");
    assert.equal(revisionNumber("QT-2026-0001-R2", 3), "QT-2026-0001-R3");
  });

  it("parses a stored number back into base and revision", () => {
    assert.deepEqual(splitRevision("QT-2026-0007"), { base: "QT-2026-0007", revision: 1 });
    assert.deepEqual(splitRevision("QT-2026-0007-R3"), { base: "QT-2026-0007", revision: 3 });
  });
});

describe("pro forma status", () => {
  const total = 100_000n;

  it("is unpaid until something is paid", () => {
    assert.equal(deriveStatus(total, 0n), "unpaid");
  });

  it("is part-paid between zero and the total", () => {
    assert.equal(deriveStatus(total, 1n), "part_paid");
    assert.equal(deriveStatus(total, 99_999n), "part_paid");
  });

  it("is paid when the total is reached or exceeded by a rounding edge", () => {
    assert.equal(deriveStatus(total, total), "paid");
    assert.equal(deriveStatus(total, total + 1n), "paid");
  });

  it("moves back to unpaid when a reversal cancels the only payment", () => {
    const paid = 50_000n + -50_000n; // append-only reversal, not an edit
    assert.equal(deriveStatus(total, paid), "unpaid");
  });
});

describe("CSV import parsing", () => {
  it("reads quoted fields, doubled quotes and CRLF endings", () => {
    const rows = parseCsv('name,city\r\n"Chirwa, Ltd","Lilongwe"" West"\r\n');
    assert.deepEqual(rows, [["name", "city"], ["Chirwa, Ltd", 'Lilongwe" West']]);
  });

  it("maps common header aliases onto contact fields", () => {
    const parsed = parseContactCsv("Customer Name,Telephone,City\nJohn Banda,+265 999,Blantyre\n");
    assert.equal(parsed.columns.name, 0);
    assert.equal(parsed.columns.phone, 1);
    assert.equal(parsed.columns.city, 2);
    assert.equal(parsed.rows[0].values.name, "John Banda");
  });

  it("reports unknown columns instead of guessing", () => {
    const parsed = parseContactCsv("name,frequent flyer\nJohn Banda,ABC123\n");
    assert.deepEqual(parsed.unknownHeaders, ["frequent flyer"]);
  });

  it("flags a row without a name and an invalid email", () => {
    const parsed = parseContactCsv("name,email\n,not-an-email\n");
    assert.equal(parsed.rows[0].errors.length, 2);
  });
});

describe("frozen totals", () => {
  it("returns null for missing or malformed snapshots instead of throwing", () => {
    assert.equal(parseFrozenTotals(null), null);
    assert.equal(parseFrozenTotals(undefined), null);
    assert.equal(parseFrozenTotals("not json"), null);
  });

  it("round-trips a frozen option so issued documents never change", () => {
    const frozen = {
      version: 1,
      frozenAt: "2026-10-31T10:00:00.000Z",
      currency: "MWK",
      label: "Option A",
      costCurrency: "USD",
      rateMicro: "1750000000",
      marginKind: "percent",
      marginValue: "1200",
      vatEnabled: true,
      vatRateBps: "1650",
      roundingUnit: "100",
      totals: {
        costMinor: "183000",
        markupMinor: "219600",
        vatMinor: "36234",
        taxesMinor: "4575",
        totalMinor: "3929925",
        profitMinor: "219600",
      },
      lines: [
        { id: "l1", description: "Adult — John Banda", kind: "fare", priceMinor: "1332600", costMinor: "62000" },
      ],
      passengers: [],
      services: [],
      taxes: [],
      segments: [],
    };
    const parsed = parseFrozenTotals(JSON.stringify(frozen));
    assert.equal(parsed?.totals.totalMinor, "3929925");
    assert.equal(parsed?.lines[0].priceMinor, "1332600");
  });
});

describe("outbound and return legs", () => {
  /** Minimal flight stub: only the airports matter for splitting. */
  const flight = (from: string, to: string): DocumentFlight => ({
    airline: "ET",
    airlineName: "Ethiopian Airlines",
    flightNo: "000",
    fromIata: from,
    toIata: to,
    fromName: from,
    fromCity: from,
    toName: to,
    toCity: to,
    departLocal: "2026-11-01T08:00",
    arriveLocal: "2026-11-01T11:00",
    durationMinutes: 180,
  });

  it("keeps a one-way itinerary in a single leg", () => {
    const legs = splitFlightLegs([flight("LLW", "ADD"), flight("ADD", "JNB")]);
    assert.equal(legs.returnLeg, null);
    assert.equal(legs.outbound.length, 2);
  });

  it("splits a simple round trip at the turnaround", () => {
    const legs = splitFlightLegs([
      flight("LLW", "ADD"),
      flight("ADD", "VIE"),
      flight("VIE", "ADD"),
      flight("ADD", "LLW"),
    ]);
    assert.ok(legs.returnLeg);
    assert.deepEqual(
      legs.outbound.map((f) => `${f.fromIata}-${f.toIata}`),
      ["LLW-ADD", "ADD-VIE"],
    );
    assert.deepEqual(
      legs.returnLeg!.map((f) => `${f.fromIata}-${f.toIata}`),
      ["VIE-ADD", "ADD-LLW"],
    );
  });

  it("handles the group-booking PNR: five segments, three out and two back", () => {
    const legs = splitFlightLegs([
      flight("LLW", "DAR"),
      flight("DAR", "ADD"),
      flight("ADD", "VIE"),
      flight("VIE", "ADD"),
      flight("ADD", "LLW"),
    ]);
    assert.equal(legs.outbound.length, 3);
    assert.equal(legs.returnLeg?.length, 2);
    assert.equal(legs.outbound[legs.outbound.length - 1].toIata, "VIE");
    assert.equal(legs.returnLeg![0].fromIata, "VIE");
  });

  it("splits when the outbound hub is reused on the way home", () => {
    const legs = splitFlightLegs([
      flight("LLW", "ADD"),
      flight("ADD", "JNB"),
      flight("JNB", "ADD"),
      flight("ADD", "LLW"),
    ]);
    assert.equal(legs.outbound.length, 2);
    assert.equal(legs.returnLeg?.length, 2);
  });

  it("leaves an open-jaw itinerary unsplit when there is no revisit", () => {
    const legs = splitFlightLegs([
      flight("LLW", "NBO"),
      flight("NBO", "DAR"),
      flight("DAR", "JNB"),
    ]);
    assert.equal(legs.returnLeg, null);
    assert.equal(legs.outbound.length, 3);
  });

  it("does not split a single flight", () => {
    const legs = splitFlightLegs([flight("LLW", "BLZ")]);
    assert.equal(legs.returnLeg, null);
    assert.equal(legs.outbound.length, 1);
  });
});

describe("quotation options are optional", () => {
  it("accepts a quotation with no options", () => {
    const parsed = saveQuotationSchema.safeParse({
      quotationId: "q1",
      version: 1,
      contactId: "c1",
      currency: "MWK",
      issueDate: "2026-10-31",
      validUntil: "2026-11-07",
      vatOverride: "inherit",
      options: [],
    });
    assert.equal(parsed.success, true);
  });

  it("treats an empty draft as ready to send", () => {
    const validation = validateQuotationDraft([]);
    assert.equal(validation.valid, true);
    assert.deepEqual(validation.errors, []);
  });
});

describe("branch-coded quotation numbering", () => {
  const date = new Date("2026-10-31T10:00:00.000Z");

  it("renders QT-branch-sequence without a date", () => {
    assert.equal(renderNumber("QT-{BRANCH}-{SEQ:4}", 1, date, "01"), "QT-01-0001");
    assert.equal(renderNumber("QT-{BRANCH}-{SEQ:4}", 27, date, "02"), "QT-02-0027");
  });

  it("still supports date placeholders for custom templates", () => {
    assert.equal(
      renderNumber("QT-{BRANCH}-{YYYY}-{MM}-{DD}-{SEQ:4}", 1, date, "01"),
      "QT-01-2026-10-31-0001",
    );
  });

  it("defaults the branch placeholder to 01 for old templates", () => {
    assert.equal(renderNumber("QT-{YYYY}-{SEQ:4}", 1, date), "QT-2026-0001");
  });

  it("rejects branch codes that are not two digits", () => {
    const base = {
      quotationId: "q1",
      version: 1,
      contactId: "c1",
      currency: "MWK",
      issueDate: "2026-10-31",
      validUntil: "2026-11-07",
      vatOverride: "inherit",
      options: [],
    };
    assert.equal(saveQuotationSchema.safeParse({ ...base, branch: "01" }).success, true);
    assert.equal(saveQuotationSchema.safeParse({ ...base, branch: "1" }).success, false);
    assert.equal(saveQuotationSchema.safeParse({ ...base, branch: "AB" }).success, false);
  });
});
