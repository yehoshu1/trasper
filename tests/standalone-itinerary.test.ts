import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseSnapshot, type ItinerarySnapshot } from "../src/lib/documents";
import { standaloneItinerarySchema } from "../src/lib/schemas";

describe("standalone itinerary input", () => {
  const valid = {
    contactId: "contact-1",
    branch: "01",
    referenceNo: "REF-1",
    pnrText: "1 ET 875 Y 10NOV BLZADD HK1 0620 1235",
    notes: "Meet and greet included.",
    passengerIds: ["p1", "p2"],
  };

  it("accepts a contact, PNR text, branch and passengers", () => {
    const parsed = standaloneItinerarySchema.safeParse(valid);
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.deepEqual(parsed.data.passengerIds, ["p1", "p2"]);
      assert.equal(parsed.data.branch, "01");
    }
  });

  it("defaults passengers to an empty list when none are selected", () => {
    const { passengerIds: _passengerIds, ...withoutPassengers } = valid;
    const parsed = standaloneItinerarySchema.safeParse(withoutPassengers);
    assert.equal(parsed.success, true);
    if (parsed.success) assert.deepEqual(parsed.data.passengerIds, []);
  });

  it("requires a contact, valid branch and readable PNR text", () => {
    assert.equal(standaloneItinerarySchema.safeParse({ ...valid, contactId: "" }).success, false);
    assert.equal(standaloneItinerarySchema.safeParse({ ...valid, branch: "1" }).success, false);
    assert.equal(standaloneItinerarySchema.safeParse({ ...valid, pnrText: "" }).success, false);
    assert.equal(
      standaloneItinerarySchema.safeParse({ ...valid, pnrText: "tiny" }).success,
      false,
    );
  });

  it("caps the passenger list rather than accepting unbounded input", () => {
    const tooMany = Array.from({ length: 61 }, (_, index) => `p${index}`);
    assert.equal(
      standaloneItinerarySchema.safeParse({ ...valid, passengerIds: tooMany }).success,
      false,
    );
  });

  it("accepts manual flights when there is no text to read", () => {
    const { pnrText: _pnrText, ...withoutText } = valid;
    const parsed = standaloneItinerarySchema.safeParse({
      ...withoutText,
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
    });
    assert.equal(parsed.success, true);
    if (parsed.success) assert.equal(parsed.data.segments.length, 1);
  });

  it("rejects a flight row that is missing its airport or times", () => {
    const parsed = standaloneItinerarySchema.safeParse({
      ...valid,
      pnrText: "",
      segments: [
        {
          airline: "ET",
          flightNo: "875",
          fromIata: "",
          toIata: "ADD",
          departLocal: "2026-11-10T06:20",
          arriveLocal: "2026-11-10T12:35",
        },
      ],
    });
    assert.equal(parsed.success, false);
  });

  it("still requires either pasted text or a manual flight", () => {
    assert.equal(
      standaloneItinerarySchema.safeParse({ ...valid, pnrText: "", segments: [] }).success,
      false,
    );
  });
});

describe("standalone itinerary snapshot", () => {
  it("parses a frozen snapshot without a quotation number", () => {
    const snapshot: ItinerarySnapshot = {
      kind: "itinerary",
      number: "IT-2026-0001",
      issueDate: "2026-11-02",
      template: "classic",
      standalone: true,
      company: {
        name: "Agency",
        address: "",
        email: "",
        phone: "",
        website: "",
        tin: "",
        headerImage: "",
        footerText: "",
        vatRegistrationNumber: "",
      },
      contact: { name: "Customer" },
      passengers: [],
      optionLabel: "Itinerary",
      showOptionLabel: false,
      flights: [],
      notes: "",
    };
    const parsed = parseSnapshot<ItinerarySnapshot>(JSON.stringify(snapshot));
    assert.ok(parsed);
    assert.equal(parsed.quotationNumber, undefined);
    assert.equal(parsed.standalone, true);
    assert.equal(parsed.number, "IT-2026-0001");
  });
});
