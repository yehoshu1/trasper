-- Electronic tickets imported from airline/GDS output.
CREATE TABLE "Ticket" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "number" TEXT NOT NULL,
    "passengerName" TEXT NOT NULL,
    "passengerId" TEXT,
    "contactId" TEXT,
    "quotationId" TEXT,
    "issueDate" DATETIME,
    "formOfPayment" TEXT,
    "pseudo" TEXT,
    "platingCarrier" TEXT,
    "iso" TEXT,
    "iata" TEXT,
    "rawText" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Ticket_passengerId_fkey" FOREIGN KEY ("passengerId") REFERENCES "Passenger" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Ticket_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Ticket_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Ticket_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Ticket_number_key" ON "Ticket"("number");
CREATE INDEX "Ticket_contactId_idx" ON "Ticket"("contactId");
CREATE INDEX "Ticket_quotationId_idx" ON "Ticket"("quotationId");
CREATE INDEX "Ticket_passengerId_idx" ON "Ticket"("passengerId");

CREATE TABLE "TicketCoupon" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ticketId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "useType" TEXT NOT NULL,
    "carrier" TEXT NOT NULL,
    "flightNo" TEXT NOT NULL,
    "bookingClass" TEXT NOT NULL,
    "travelDate" TEXT,
    "fromIata" TEXT NOT NULL,
    "toIata" TEXT NOT NULL,
    "departTime" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "fareBasis" TEXT,
    "coupon" TEXT,
    "notValidBefore" TEXT,
    "notValidAfter" TEXT,
    "baggage" TEXT,
    "raw" TEXT NOT NULL,
    CONSTRAINT "TicketCoupon_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "TicketCoupon_ticketId_idx" ON "TicketCoupon"("ticketId");
