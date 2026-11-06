import assert from "node:assert/strict";
import { describe, it } from "node:test";

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
});
