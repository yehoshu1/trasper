-- Two ticket numbers per passenger and the extra itinerary fields shown on
-- the agency e-ticket receipt.
ALTER TABLE "Ticket" ADD COLUMN "secondaryNumber" TEXT;
ALTER TABLE "Ticket" ADD COLUMN "bookingRef" TEXT;
ALTER TABLE "Ticket" ADD COLUMN "checkInRef" TEXT;
ALTER TABLE "Ticket" ADD COLUMN "secondaryCheckInRef" TEXT;
ALTER TABLE "Ticket" ADD COLUMN "secondaryCarrier" TEXT;

CREATE UNIQUE INDEX "Ticket_secondaryNumber_key" ON "Ticket"("secondaryNumber");

ALTER TABLE "TicketCoupon" ADD COLUMN "arriveTime" TEXT;
ALTER TABLE "TicketCoupon" ADD COLUMN "fromTerminal" TEXT;
ALTER TABLE "TicketCoupon" ADD COLUMN "toTerminal" TEXT;
ALTER TABLE "TicketCoupon" ADD COLUMN "aircraft" TEXT;
ALTER TABLE "TicketCoupon" ADD COLUMN "stopInfo" TEXT;
ALTER TABLE "TicketCoupon" ADD COLUMN "meal" TEXT;
ALTER TABLE "TicketCoupon" ADD COLUMN "cabin" TEXT;
