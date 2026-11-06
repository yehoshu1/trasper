import type {
  DocumentBank,
  DocumentCompany,
  DocumentContact,
  DocumentFlight,
  DocumentPassenger,
  ItinerarySnapshot,
  ProformaSnapshot,
  QuotationSnapshot,
} from "@/lib/documents";

/** Sample data for the template previews in Settings. It never touches the
 * database and carries no real customer information. */

const company: DocumentCompany = {
  name: "Northwind Travel",
  address: "1 Example Street, London, United Kingdom",
  email: "hello@northwind.example",
  phone: "+44 20 7946 0000",
  website: "www.northwind.example",
  tin: "12345678",
  headerImage: "/sample-logo.svg",
  letterhead: "/sample-letterhead.svg",
  headerMode: "letterhead",
  footerText: "Northwind Travel — journeys planned with care.",
  vatRegistrationNumber: "VAT 123456789",
};

const contact: DocumentContact = {
  name: "Acme Group Ltd",
  attention: "Ms J. Taylor",
  poBox: "P.O. Box 1234",
  city: "London",
  country: "United Kingdom",
  physicalAddress: "45 Example Road, London",
  email: "travel@acme.example",
  phone: "+44 20 7946 0100",
};

const passengers: DocumentPassenger[] = [
  { title: "Mr", firstName: "Alex", lastName: "Morgan", type: "adult" },
  { title: "Ms", firstName: "Sam", lastName: "Morgan", type: "adult" },
];

const outbound: DocumentFlight = {
  airline: "BA",
  airlineName: "British Airways",
  flightNo: "BA 117",
  fromIata: "LHR",
  toIata: "JFK",
  fromName: "Heathrow Airport",
  toName: "John F. Kennedy International Airport",
  fromCity: "London",
  toCity: "New York",
  departLocal: "2026-11-10T08:20",
  arriveLocal: "2026-11-10T11:15",
  durationMinutes: 475,
  cabin: "Economy",
};

const connection: DocumentFlight = {
  airline: "BA",
  airlineName: "British Airways",
  flightNo: "BA 112",
  fromIata: "JFK",
  toIata: "LHR",
  fromName: "John F. Kennedy International Airport",
  toName: "Heathrow Airport",
  fromCity: "New York",
  toCity: "London",
  departLocal: "2026-11-17T19:05",
  arriveLocal: "2026-11-18T07:10",
  durationMinutes: 425,
  cabin: "Economy",
};

const bank: DocumentBank = {
  currency: "GBP",
  bankName: "Example Bank",
  accountName: "Northwind Travel Ltd",
  accountNumber: "1000 2000 3000",
  branch: "London",
  swift: "EXAMPLEGB2L",
  instructions: "Please quote the document number as the payment reference.",
};

const lines = [
  { description: "Adult fare — Alex Morgan", amountMinor: "195000" },
  { description: "Adult fare — Sam Morgan", amountMinor: "195000" },
  { description: "Airport taxes and transfers", amountMinor: "21000" },
];

const totalMinor = "411000";

export const SAMPLE_QUOTATION: QuotationSnapshot = {
  kind: "quotation",
  number: "QT-2026-0042",
  revision: 1,
  referenceNo: "NW-42",
  branch: "01",
  issueDate: "2026-11-01",
  validUntil: "2026-11-02",
  currency: "GBP",
  template: "classic",
  company,
  contact,
  passengers,
  flights: [outbound, connection],
  options: [
    {
      label: "Journey 1",
      pnr: "ABC123",
      flights: [outbound, connection],
      lines,
      totalMinor,
      vatEnabled: true,
      vatMinor: "21000",
      costMinor: "340000",
      markupMinor: "50000",
      taxesMinor: "21000",
    },
  ],
  heading: "QUOTATION",
  notes:
    "Prices are per person unless stated otherwise and are subject to availability. Ticketing deadlines are set by the airline.",
  validityStatement:
    "This quotation is valid for 24 hours from the date and time of issuance. All fares and seat availability are subject to change without prior notice until the ticket is issued. Final pricing will be confirmed at the time of booking and ticket issuance.",
  bank,
  createdAt: "2026-11-01T08:30:00.000Z",
};

export const SAMPLE_ITINERARY: ItinerarySnapshot = {
  kind: "itinerary",
  number: "IT-2026-0018",
  referenceNo: "NW-42",
  branch: "01",
  issueDate: "2026-11-01",
  template: "classic",
  quotationNumber: "QT-2026-0042",
  company,
  contact,
  passengers,
  optionLabel: "Journey 1",
  showOptionLabel: false,
  pnr: "ABC123",
  flights: [outbound, connection],
  notes:
    "Please check your travel documents and arrive at the airport at least two hours before departure.",
};

export const SAMPLE_PROFORMA: ProformaSnapshot = {
  kind: "proforma",
  number: "PF-2026-0009",
  referenceNo: "NW-42",
  branch: "01",
  issueDate: "2026-11-01",
  template: "classic",
  dueDate: "2026-11-15",
  terms: "50% deposit on confirmation, balance before ticketing.",
  currency: "GBP",
  company,
  contact,
  passengers,
  optionLabel: "Journey 1",
  showOptionLabel: false,
  flights: [outbound, connection],
  showFlights: true,
  showVat: true,
  vatMinor: "21000",
  vatRateBps: "1650",
  vatRegistrationNumber: "VAT 123456789",
  lines,
  totalMinor,
  bank,
  quotationNumber: "QT-2026-0042",
};

export const SAMPLE_PROFORMA_PAYMENTS = [
  {
    paidOn: "2026-11-03",
    amountMinor: "205500",
    method: "bank_transfer",
    reference: "NBM-88231",
    reversal: false,
  },
];

export const SAMPLE_PROFORMA_PAID = "205500";
