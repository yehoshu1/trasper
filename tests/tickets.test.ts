import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import {
  carrierForTicketNumber,
  isBookingDocument,
  parseBookingDocument,
} from "../src/lib/tickets/booking";
import { mergeTicketSources } from "../src/lib/tickets/merge";
import { formatTicketNumber, parseTickets } from "../src/lib/tickets/parse";

const sample = `*ISSUED*

TKT: 706 3956 175087     NAME: DZIWENI KASAMBA/YVONNE

ISSUED: 06NOV26          FOP:CASH
PSEUDO: 3QJ9  PLATING CARRIER: KQ  ISO: GA  IATA: 21209963
   USE  CR FLT  CLS  DATE BRDOFF TIME  ST F/B        FARE   CPN
  ARPT KQ  756  L  07NOV LLWNBO  1415 OK LSFMW               1
                                          NVB07NOV NVA07NOV 2PC
  ARPT KQ  488  L  08NOV NBODAR  0120 OK LSFMW               2
                                          NVB08NOV NVA08NOV 2PC

TKT: 706 3956 175087     NAME: DZIWENI KASAMBA/YVONNE

ISSUED: 06NOV26          FOP:CASH
PSEUDO: 3QJ9  PLATING CARRIER: KQ  ISO: GA  IATA: 21209963
   USE  CR FLT  CLS  DATE BRDOFF TIME  ST F/B        FARE   CPN
  ARPT KQ  756  L  07NOV LLWNBO  1415 OK LSFMW               1
                                          NVB07NOV NVA07NOV 2PC

ELECTRONIC TICKET LIST BY *HTE
            NAME             TICKET NUMBER
 >*TE008·   DZIWENI KASAMBA/ 7063956175087
 >*TE009·   NZUNDA/MUNTHANZI 7063956175088
 >*TE010·   YASSIN/BLESSINGS 7063956175089
END OF LIST`;

const hteList = `ELECTRONIC TICKET LIST BY *HTE
            NAME             TICKET NUMBER

*TE008·   DZIWENI KASAMBA/ 7063956175087
*TE009·   NZUNDA/MUNTHANZI 7063956175088
*TE010·   YASSIN/BLESSINGS 7063956175089
*TE011·   MWINAMA/EMMANUEL 7063956175090
*TE012·   MILAZI/MILTON KU 7063956175091
*TE013·   MTITIMILA/JACOB  7063956175092
*TE014·   MHANGO/MONAOSYIL 7063956175093
*TE015·   DZIWENI KASAMBA/ 1973929054335
*TE016·   NZUNDA/MUNTHANZI 1973929054336
*TE017·   YASSIN/BLESSINGS 1973929054337
*TE018·   MWINAMA/EMMANUEL 1973929054338
*TE019·   MILAZI/MILTON KU 1973929054339
*TE020·   MTITIMILA/JACOB  1973929054340
*TE021·   MHANGO/MONAOSYIL 1973929054341

END OF LIST`;

const layoutText = readFileSync(
  path.join(process.cwd(), "tests", "fixtures", "jmc9ny-layout.txt"),
  "utf8",
);
const rawText = readFileSync(
  path.join(process.cwd(), "tests", "fixtures", "jmc9ny-raw.txt"),
  "utf8",
);

describe("e-ticket parser", () => {
  it("reads the issued ticket block and the ticket list", () => {
    const parsed = parseTickets(sample);
    assert.equal(parsed.tickets.length, 3);
    const first = parsed.tickets[0]!;
    assert.equal(first.number, "7063956175087");
    assert.equal(first.passengerName, "DZIWENI KASAMBA/YVONNE");
    assert.equal(first.issueDate, "2026-11-06");
    assert.equal(first.formOfPayment, "CASH");
    assert.equal(first.platingCarrier, "KQ");
    assert.equal(first.coupons.length, 2);
    assert.deepEqual(
      {
        useType: first.coupons[0]!.useType,
        carrier: first.coupons[0]!.carrier,
        flightNo: first.coupons[0]!.flightNo,
        fromIata: first.coupons[0]!.fromIata,
        toIata: first.coupons[0]!.toIata,
        date: first.coupons[0]!.travelDate,
        time: first.coupons[0]!.departTime,
        fareBasis: first.coupons[0]!.fareBasis,
        notValidBefore: first.coupons[0]!.notValidBefore,
        baggage: first.coupons[0]!.baggage,
      },
      {
        useType: "ARPT",
        carrier: "KQ",
        flightNo: "756",
        fromIata: "LLW",
        toIata: "NBO",
        date: "2026-11-07",
        time: "14:15",
        fareBasis: "LSFMW",
        notValidBefore: "2026-11-07",
        baggage: "2PC",
      },
    );
    assert.equal(parsed.tickets[1]!.passengerName, "NZUNDA/MUNTHANZI");
    assert.equal(parsed.tickets[1]!.coupons.length, 0);
  });

  it("formats a ticket number in the airline 3-4-6 grouping", () => {
    assert.equal(formatTicketNumber("7063956175087"), "706 3956 175087");
  });

  it("keeps passengers with the same surname in separate groups", () => {
    const parsed = parseTickets(`ELECTRONIC TICKET LIST BY *HTE
*TE001·   SMITH/JOHN 7061111111111
*TE002·   SMITH/JANE 1972222222222
*TE003·   SMITH/JOHN 1973333333333
END OF LIST`);
    const merged = mergeTicketSources(parsed.tickets, null, true);
    assert.equal(merged.groups.length, 2);
    assert.equal(merged.groups[0]!.primary.number, "7061111111111");
    assert.equal(merged.groups[0]!.secondary?.number, "1973333333333");
    assert.equal(merged.groups[1]!.primary.number, "1972222222222");
    assert.equal(merged.groups[1]!.secondary, undefined);
  });
});

describe("booking confirmation parser", () => {
  const expectedFlights = [
    ["KQ", "756", "LLW", "NBO", "2026-11-07", "14:15", "19:45"],
    ["KQ", "488", "NBO", "DAR", "2026-11-08", "01:20", "02:50"],
    ["TC", "108", "DAR", "DOD", "2026-11-08", "06:00", "07:10"],
    ["TC", "175", "DOD", "DAR", "2026-11-14", "01:30", "02:40"],
    ["KQ", "483", "DAR", "NBO", "2026-11-14", "09:55", "11:20"],
    ["KQ", "756", "NBO", "LLW", "2026-11-14", "12:10", "13:25"],
  ];

  for (const [label, text] of [
    ["layout text", layoutText],
    ["raw text", rawText],
  ] as const) {
    it(`reads passengers, references and flights from ${label}`, () => {
      assert.equal(isBookingDocument(text), true);
      const booking = parseBookingDocument(text);

      assert.deepEqual(booking.warnings, []);
      assert.equal(booking.reference, "JMC9NY");
      assert.deepEqual(booking.checkInRefs, [
        { carrier: "KQ", reference: "9H3TXP" },
        { carrier: "TC", reference: "1D8A5Z" },
      ]);
      assert.equal(booking.passengers.length, 7);
      assert.deepEqual(booking.passengers[0]!.ticketNumbers, [
        "1973929054335",
        "7063956175087",
      ]);
      assert.equal(booking.passengers[0]!.name, "DZIWENI KASAMBA/YVONNE");
      assert.equal(booking.passengers[6]!.name, "MHANGO/MONAOSYILE VILLA");

      assert.deepEqual(
        booking.flights.map((flight) => [
          flight.carrier,
          flight.flightNo,
          flight.fromIata,
          flight.toIata,
          flight.travelDate,
          flight.departTime,
          flight.arriveTime,
        ]),
        expectedFlights,
      );

      const first = booking.flights[0]!;
      assert.equal(first.fromTerminal, undefined);
      assert.equal(first.toTerminal, "1A");
      assert.equal(first.bookingClass, "L");
      assert.equal(first.cabin, "Economy");
      assert.equal(first.status, "Confirmed");
      assert.equal(first.aircraft, "EMBRAER 190");
      assert.equal(first.stopInfo, "1 (Nampula)");
      assert.equal(first.meal, undefined);
      assert.equal(first.baggage, "2 x 23KG");

      const second = booking.flights[1]!;
      assert.equal(second.fromTerminal, "1A");
      assert.equal(second.toTerminal, "3");
      assert.equal(second.meal, "Meal");

      const tanzania = booking.flights[2]!;
      assert.equal(tanzania.aircraft, "DHC-8 Dash 8");
      assert.equal(tanzania.stopInfo, "Non-Stop");
      assert.equal(tanzania.baggage, "2 pcs");
    });
  }

  it("merges the ticket list with the booking confirmation", () => {
    const parsed = parseTickets(hteList);
    assert.equal(parsed.tickets.length, 14);

    const booking = parseBookingDocument(layoutText);
    const merged = mergeTicketSources(parsed.tickets, booking, true);

    assert.equal(merged.groups.length, 7);
    for (const group of merged.groups) {
      assert.match(group.primary.number, /^706/);
      assert.match(group.secondary?.number ?? "", /^197/);
      assert.equal(group.coupons.length, 6);
      assert.equal(group.bookingRef, "JMC9NY");
      assert.equal(group.checkInRef, "9H3TXP");
      assert.equal(group.secondaryCheckInRef, "1D8A5Z");
      assert.equal(group.platingCarrier, "KQ");
      assert.equal(group.secondaryCarrier, "TC");
      assert.equal(group.coupons[0]!.cabin, "Economy");
    }

    assert.equal(merged.groups[0]!.primary.passengerName, "DZIWENI KASAMBA/YVONNE");
    assert.equal(merged.groups[1]!.primary.passengerName, "NZUNDA/MUNTHANZI");
    assert.equal(merged.groups[4]!.primary.passengerName, "MILAZI MILTON/KUDZALA");
  });

  it("builds tickets from a booking confirmation without a ticket list", () => {
    const booking = parseBookingDocument(layoutText);
    const merged = mergeTicketSources([], booking, true);

    assert.equal(merged.groups.length, 7);
    assert.equal(merged.groups[0]!.primary.number, "7063956175087");
    assert.equal(merged.groups[0]!.secondary?.number, "1973929054335");
    assert.equal(merged.groups[0]!.coupons.length, 6);
    assert.equal(merged.groups[0]!.coupons[0]!.arriveTime, "19:45");
    assert.equal(merged.groups[0]!.coupons[0]!.toTerminal, "1A");
  });

  it("maps the common ticket prefixes to their airline", () => {
    assert.equal(carrierForTicketNumber("7063956175087"), "KQ");
    assert.equal(carrierForTicketNumber("1973929054335"), "TC");
    assert.equal(carrierForTicketNumber("9990000000000"), undefined);
  });
});
