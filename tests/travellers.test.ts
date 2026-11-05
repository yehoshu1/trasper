import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { DocumentPassenger } from "../src/lib/documents";
import {
  applyTravellerNames,
  groupTravellerPassengers,
  splitTravellerName,
  travellerNamesText,
  travellerSlots,
} from "../src/lib/travellers";

const group: DocumentPassenger[] = [
  { firstName: "", lastName: "", type: "adult", unnamed: true, quantity: 3 },
];

describe("traveller names", () => {
  it("expands a group into one editable slot per traveller", () => {
    assert.deepEqual(travellerSlots(group), [
      { type: "adult", name: "" },
      { type: "adult", name: "" },
      { type: "adult", name: "" },
    ]);
    assert.equal(travellerNamesText(group), "\n\n");
  });

  it("keeps blank lines as unnamed travellers", () => {
    const applied = applyTravellerNames(group, "John Banda\n\nMary Phiri");
    assert.equal(applied.error, undefined);
    assert.deepEqual(
      applied.passengers.map((passenger) => ({
        name: [passenger.firstName, passenger.lastName].filter(Boolean).join(" "),
        unnamed: passenger.unnamed ?? false,
        quantity: passenger.quantity ?? 1,
      })),
      [
        { name: "John Banda", unnamed: false, quantity: 1 },
        { name: "Mary Phiri", unnamed: false, quantity: 1 },
        { name: "", unnamed: true, quantity: 1 },
      ],
    );
  });

  it("rejects more names than travellers", () => {
    const applied = applyTravellerNames(group, "A One\nB Two\nC Three\nD Four");
    assert.match(applied.error ?? "", /Only 3 travellers/);
  });

  it("expands names stored on a quotation group", () => {
    const passengers = groupTravellerPassengers("adult", 3, "John Banda\nMary Phiri");
    assert.equal(passengers.filter((passenger) => !passenger.unnamed).length, 2);
    assert.equal(
      passengers.find((passenger) => passenger.unnamed)?.quantity,
      1,
    );
  });

  it("splits a single-word name without losing it", () => {
    assert.deepEqual(splitTravellerName("Madonna"), { firstName: "", lastName: "Madonna" });
    assert.deepEqual(splitTravellerName("John Paul Banda"), {
      firstName: "John Paul",
      lastName: "Banda",
    });
  });
});
