import { hasCapability, type Capability } from "@/lib/permissions";
import { EMPTY_SEARCH_RESULTS, type GlobalSearchResults } from "@/lib/search";
import { prisma } from "@/server/db";

/**
 * One search implementation for the search page and the command palette.
 * Capability checks happen before any customer or passenger data is read, so
 * a viewer never receives records they are not allowed to see.
 */
export async function globalSearch(
  user: { role: string; capabilities?: readonly Capability[] },
  rawQuery: string,
): Promise<GlobalSearchResults> {
  // Bound the LIKE query; a multi-megabyte search string is needless load.
  const query = rawQuery.trim().slice(0, 100);
  if (!query) return EMPTY_SEARCH_RESULTS;

  const canViewDocuments = hasCapability(user, "viewDocuments");
  const canViewCustomers = hasCapability(user, "viewContacts");
  const canViewPassengers = hasCapability(user, "manageContacts");

  const [quotations, itineraries, proformas, customers, passengers] = await Promise.all([
    canViewDocuments
      ? prisma.quotation.findMany({
          where: {
            OR: [
              { number: { contains: query } },
              { referenceNo: { contains: query } },
              { contact: { name: { contains: query } } },
              { options: { some: { pnr: { contains: query } } } },
              {
                options: {
                  some: {
                    fares: {
                      some: {
                        passenger: {
                          OR: [
                            { firstName: { contains: query } },
                            { lastName: { contains: query } },
                          ],
                        },
                      },
                    },
                  },
                },
              },
            ],
          },
          include: { contact: { select: { name: true } } },
          orderBy: { createdAt: "desc" },
          take: 10,
        })
      : Promise.resolve([]),
    canViewDocuments
      ? prisma.itinerary.findMany({
          where: {
            OR: [
              { number: { contains: query } },
              { referenceNo: { contains: query } },
              { contact: { name: { contains: query } } },
              { quotation: { number: { contains: query } } },
              { quotation: { contact: { name: { contains: query } } } },
            ],
          },
          include: {
            contact: { select: { name: true } },
            quotation: { include: { contact: { select: { name: true } } } },
          },
          orderBy: { issuedAt: "desc" },
          take: 10,
        })
      : Promise.resolve([]),
    canViewDocuments
      ? prisma.proforma.findMany({
          where: {
            OR: [
              { number: { contains: query } },
              { referenceNo: { contains: query } },
              { quotation: { number: { contains: query } } },
              { quotation: { contact: { name: { contains: query } } } },
            ],
          },
          include: { quotation: { include: { contact: true } } },
          orderBy: { createdAt: "desc" },
          take: 10,
        })
      : Promise.resolve([]),
    canViewCustomers
      ? prisma.contact.findMany({
          where: {
            OR: [
              { name: { contains: query } },
              { attention: { contains: query } },
              { email: { contains: query } },
              { phone: { contains: query } },
              { city: { contains: query } },
            ],
          },
          orderBy: { name: "asc" },
          take: 10,
        })
      : Promise.resolve([]),
    canViewPassengers
      ? prisma.passenger.findMany({
          where: {
            OR: [{ firstName: { contains: query } }, { lastName: { contains: query } }],
          },
          orderBy: { lastName: "asc" },
          take: 10,
        })
      : Promise.resolve([]),
  ]);

  const result: GlobalSearchResults = {
    quotations: quotations.map((quotation) => ({
      id: quotation.id,
      number: quotation.number,
      referenceNo: quotation.referenceNo ?? "",
      status: quotation.status,
      issueDate: quotation.issueDate.toISOString(),
      customerName: quotation.contact.name,
    })),
    itineraries: itineraries.map((itinerary) => ({
      id: itinerary.id,
      number: itinerary.number,
      customerName:
        itinerary.contact?.name ??
        itinerary.quotation?.contact.name ??
        "Customer to be advised",
      issuedAt: itinerary.issuedAt.toISOString(),
    })),
    proformas: proformas.map((proforma) => ({
      id: proforma.id,
      number: proforma.number,
      customerName: proforma.quotation.contact.name,
      status: proforma.status,
      issueDate: proforma.issueDate.toISOString(),
    })),
    customers: customers.map((customer) => ({
      id: customer.id,
      name: customer.name,
      email: customer.email ?? "",
      city: customer.city ?? "",
      archived: Boolean(customer.archivedAt),
    })),
    passengers: passengers.map((passenger) => ({
      id: passenger.id,
      firstName: passenger.firstName,
      lastName: passenger.lastName,
      type: passenger.type,
    })),
    total: 0,
  };
  result.total =
    result.quotations.length +
    result.itineraries.length +
    result.proformas.length +
    result.customers.length +
    result.passengers.length;
  return result;
}
