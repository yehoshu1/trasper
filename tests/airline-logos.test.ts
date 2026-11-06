import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

const root = process.cwd();

describe("bundled airline logos", () => {
  it("contains a real PNG for Air Tanzania", () => {
    const file = path.join(root, "prisma", "seed-data", "airline-logos", "tc.png");
    assert.equal(existsSync(file), true, "tc.png is missing");
    const bytes = readFileSync(file);
    assert.deepEqual([...bytes.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  });

  it("has the matching TC airline reference row", () => {
    const airlines = JSON.parse(
      readFileSync(path.join(root, "prisma", "seed-data", "airlines.json"), "utf8"),
    ) as { iata: string; name: string }[];
    assert.ok(airlines.some((airline) => airline.iata === "TC" && airline.name === "Air Tanzania"));
  });
});
