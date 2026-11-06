import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PDFDocument } from "pdf-lib";

import type { QuotationSnapshot, TicketSnapshot } from "../src/lib/documents";
import { calculateOption } from "../src/lib/pricing";
import { presentPricing } from "../src/lib/pricing/presentation";
import { renderQuotationPdf, renderTicketPdf } from "../src/server/pdf";

const snapshot: QuotationSnapshot = {
  kind: "quotation",
  number: "QT-2026-0001",
  revision: 1,
  referenceNo: "REF-1",
  issueDate: "2026-10-31",
  validUntil: "2026-11-07",
  validityStatement:
    "This quotation is valid for 24 hours from the date and time of issuance. All fares and seat availability are subject to change without prior notice until the ticket is issued. Final pricing will be confirmed at the time of booking and ticket issuance.",
  currency: "GBP",
  company: {
    name: "Northwind Travel",
    address: "1 Example Street, London, United Kingdom",
    email: "hello@northwind.example",
    phone: "+44 20 7946 0000",
    website: "www.northwind.example",
    tin: "",
    headerImage: "",
    footerText: "Northwind Travel - journeys planned with care.",
    vatRegistrationNumber: "",
  },
  contact: { name: "Acme Group Ltd", city: "London", country: "United Kingdom" },
  passengers: [{ title: "Mr", firstName: "Alex", lastName: "Morgan", type: "adult" }],
  flights: [],
  options: [
    {
      label: "Option A",
      pnr: "ABC123",
      flights: [
        {
          airline: "ET",
          airlineName: "Ethiopian Airlines",
          flightNo: "875",
          fromIata: "LLW",
          toIata: "ADD",
          fromName: "Kamuzu International Airport",
          fromCity: "Lilongwe",
          toName: "Bole International Airport",
          toCity: "Addis Ababa",
          departLocal: "2026-11-10T06:20",
          arriveLocal: "2026-11-10T12:35",
          durationMinutes: 255,
        },
        {
          airline: "ET",
          airlineName: "Ethiopian Airlines",
          flightNo: "920",
          fromIata: "ADD",
          toIata: "LLW",
          fromName: "Bole International Airport",
          fromCity: "Addis Ababa",
          toName: "Kamuzu International Airport",
          toCity: "Lilongwe",
          departLocal: "2026-11-17T10:10",
          arriveLocal: "2026-11-17T13:10",
          durationMinutes: 180,
        },
      ],
      lines: [
        { description: "Adult - Alex Morgan", amountMinor: "250000" },
      ],
      totalMinor: "250000",
      vatEnabled: true,
      vatMinor: "36234",
      costMinor: "183000",
      markupMinor: "219600",
      taxesMinor: "4575",
    },
  ],
  heading: "Your tailor-made journey",
  notes: "Prices are subject to availability.",
  bank: null,
  createdAt: "2026-10-31T10:00:00.000Z",
};

const ticketSnapshot: TicketSnapshot = {
  kind: "ticket",
  number: "7063956175087",
  passengerName: "DZIWENI KASAMBA/YVONNE",
  issueDate: "2026-11-06",
  company: snapshot.company,
  formOfPayment: "CASH",
  pseudo: "3QJ9",
  platingCarrier: "KQ",
  iso: "GA",
  iata: "21209963",
  coupons: [
    {
      position: 0,
      useType: "ARPT",
      carrier: "KQ",
      flightNo: "756",
      bookingClass: "L",
      travelDate: "2026-11-07",
      fromIata: "LLW",
      toIata: "NBO",
      departTime: "14:15",
      status: "OK",
      fareBasis: "LSFMW",
      coupon: "1",
      notValidBefore: "2026-11-07",
      notValidAfter: "2026-11-07",
      baggage: "2PC",
    },
  ],
  createdAt: "2026-11-06T00:00:00.000Z",
};

describe("ticket PDF", () => {
  it("renders a real, loadable ticket receipt", async () => {
    const bytes = await renderTicketPdf(ticketSnapshot);
    const pdf = await PDFDocument.load(bytes);
    assert.equal(pdf.getPageCount(), 1);
  });
});

describe("quotation PDF", () => {
  it("renders a real, loadable PDF", async () => {
    const bytes = await renderQuotationPdf(snapshot);
    assert.equal(Buffer.from(bytes).subarray(0, 5).toString(), "%PDF-");
    const doc = await PDFDocument.load(bytes);
    assert.ok(doc.getPageCount() >= 1);
  });

  it("renders all five document templates", async () => {
    for (const template of ["classic", "modern", "minimal", "executive", "vivid"] as const) {
      const bytes = await renderQuotationPdf({ ...snapshot, template });
      assert.equal(Buffer.from(bytes).subarray(0, 5).toString(), "%PDF-");
      const doc = await PDFDocument.load(bytes);
      assert.ok(doc.getPageCount() >= 1);
    }
  });

  it("renders both document header choices", async () => {
    for (const headerMode of ["letterhead", "details"] as const) {
      const bytes = await renderQuotationPdf({
        ...snapshot,
        company: {
          ...snapshot.company,
          letterhead: "/sample-letterhead.svg",
          headerMode,
          tin: "12345678",
        },
      });
      assert.equal(Buffer.from(bytes).subarray(0, 5).toString(), "%PDF-");
      const doc = await PDFDocument.load(bytes);
      assert.ok(doc.getPageCount() >= 1);
    }
  });

  it("keeps long documents on A4 and splits rather than overflowing", async () => {
    const long = {
      ...snapshot,
      options: Array.from({ length: 6 }, (_, index) => ({
        ...snapshot.options[0],
        label: `Option ${String.fromCharCode(65 + index)}`,
        flights: [...snapshot.options[0].flights, ...snapshot.options[0].flights],
        lines: Array.from({ length: 8 }, (_, line) => ({
          description: `Fare line ${line + 1} - passenger ${line + 1}`,
          amountMinor: "45000",
        })),
      })),
    };
    const bytes = await renderQuotationPdf(long);
    const doc = await PDFDocument.load(bytes);
    assert.ok(doc.getPageCount() >= 2);
    for (const page of doc.getPages()) {
      const { width, height } = page.getSize();
      assert.equal(Math.round(width), 595);
      assert.equal(Math.round(height), 842);
    }
  });

  it("renders an itemised service-fee and tax layout from the frozen presentation", async () => {
    const priced = calculateOption({
      lines: [
        { id: "fare", description: "Adult - Alex Morgan", costMinor: 90_000n, kind: "fare" },
        {
          id: "hotel",
          description: "Hilton Garden Inn",
          costMinor: 60_000n,
          kind: "service",
          quantity: 3,
          unit: "night",
          unitCostMinor: 20_000n,
          detail: "Double room, bed & breakfast",
        },
      ],
      rateMicro: 1_000_000n,
      marginKind: "percent",
      marginValue: 1_000n,
      vatEnabled: true,
      vatRateBps: 1_650n,
      taxes: [
        { id: "city", name: "City tax", kind: "percent", value: 200n, enabled: true, base: "cost" },
      ],
      roundingUnit: 100n,
    });
    const presentation = presentPricing(priced, {
      priceDisplay: "itemised",
      taxDisplay: "itemised",
      passengerCount: 1,
    });
    const bytes = await renderQuotationPdf({
      ...snapshot,
      options: [
        {
          ...snapshot.options[0],
          presentation,
          totalMinor: presentation.totalMinor,
        },
      ],
    });
    assert.equal(Buffer.from(bytes).subarray(0, 5).toString(), "%PDF-");
    const doc = await PDFDocument.load(bytes);
    assert.ok(doc.getPageCount() >= 1);
  });
});
