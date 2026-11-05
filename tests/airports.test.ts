import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

interface SeedAirport {
  iata: string;
  name: string;
  city: string;
  country: string;
  tz: string;
}

const airports = JSON.parse(
  readFileSync(path.join(process.cwd(), "prisma", "seed-data", "airports.json"), "utf8"),
) as SeedAirport[];

describe("airport reference data", () => {
  it("keeps every IATA code unique", () => {
    const codes = airports.map((airport) => airport.iata);
    assert.equal(new Set(codes).size, codes.length);
  });

  it("includes Dodoma International Airport with its agency time zone", () => {
    const dodoma = airports.find((airport) => airport.iata === "DOD");
    assert.ok(dodoma, "DOD is missing from the airport seed data");
    assert.equal(dodoma.name, "Dodoma International Airport");
    assert.equal(dodoma.city, "Dodoma");
    assert.equal(dodoma.country, "Tanzania");
    assert.equal(dodoma.tz, "Africa/Dar_es_Salaam");
  });
});
