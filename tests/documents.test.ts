import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DOCUMENT_HEADER_MODES,
  isDocumentHeaderMode,
  resolveDocumentHeader,
  type DocumentHeaderMode,
} from "../src/lib/documents";

describe("document header choice", () => {
  const cases: {
    name: string;
    letterhead: string | undefined;
    headerMode: DocumentHeaderMode | undefined;
    expected: DocumentHeaderMode;
  }[] = [
    {
      name: "details are printed when the setting asks for them, even with a letterhead",
      letterhead: "/uploads/letterhead.png",
      headerMode: "details",
      expected: "details",
    },
    {
      name: "the picture letterhead is printed when it exists and is selected",
      letterhead: "/uploads/letterhead.png",
      headerMode: "letterhead",
      expected: "letterhead",
    },
    {
      name: "legacy snapshots with a letterhead and no mode keep the letterhead",
      letterhead: "/uploads/letterhead.png",
      headerMode: undefined,
      expected: "letterhead",
    },
    {
      name: "company details are used when no letterhead is uploaded",
      letterhead: undefined,
      headerMode: "letterhead",
      expected: "details",
    },
    {
      name: "fresh company details work without a letterhead",
      letterhead: "",
      headerMode: "details",
      expected: "details",
    },
  ];

  for (const entry of cases) {
    it(entry.name, () => {
      assert.equal(
        resolveDocumentHeader({ letterhead: entry.letterhead, headerMode: entry.headerMode }),
        entry.expected,
      );
    });
  }

  it("only accepts the two documented header modes", () => {
    assert.deepEqual([...DOCUMENT_HEADER_MODES], ["letterhead", "details"]);
    assert.equal(isDocumentHeaderMode("letterhead"), true);
    assert.equal(isDocumentHeaderMode("details"), true);
    assert.equal(isDocumentHeaderMode("logo-only"), false);
    assert.equal(isDocumentHeaderMode(""), false);
    assert.equal(isDocumentHeaderMode(undefined), false);
  });
});
