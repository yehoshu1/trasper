import Link from "next/link";

import { ItinerariesTable, type ItineraryTableRow } from "@/components/list-tables";
import { EmptyState, PageHeader } from "@/components/ui";
import { formatDate } from "@/lib/dates";
import { hasCapability } from "@/lib/permissions";
import { requireCapableUser } from "@/server/auth";
import { prisma } from "@/server/db";

export const dynamic = "force-dynamic";

export default async function ItinerariesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; superseded?: string }>;
}) {
  const user = await requireCapableUser("viewDocuments");
  const params = await searchParams;
  const initialSearch = (params.q ?? "").trim();
  const showSuperseded = params.superseded === "1";

  const itineraries = await prisma.itinerary.findMany({
    where: { supersededAt: showSuperseded ? { not: null } : null },
    include: {
      contact: true,
      quotation: { include: { contact: true } },
      createdBy: { select: { name: true } },
    },
    orderBy: { issuedAt: "desc" },
    take: 1000,
  });

  const rows: ItineraryTableRow[] = itineraries.map((itinerary) => ({
    id: itinerary.id,
    number: itinerary.number,
    referenceNo: itinerary.referenceNo ?? "",
    quotationId: itinerary.quotationId ?? "",
    quotationNumber: itinerary.quotation?.number ?? "",
    standalone: !itinerary.quotationId,
    customerName:
      itinerary.contact?.name ?? itinerary.quotation?.contact.name ?? "Customer to be advised",
    issuedIso: itinerary.issuedAt.toISOString(),
    issued: formatDate(itinerary.issuedAt),
    issuedBy: itinerary.createdBy.name,
    state: itinerary.supersededAt ? "superseded" : "current",
    stateLabel: itinerary.supersededAt
      ? `Superseded by ${itinerary.supersededBy ?? "a later issue"}`
      : "Current",
  }));

  return (
    <div>
      <PageHeader
        eyebrow="Documents"
        title={showSuperseded ? "Superseded itineraries" : "Itineraries"}
        subtitle="Issued from an accepted quotation option, or created standalone without prices. Re-issuing creates a new number and leaves the earlier one readable."
        actions={
          hasCapability(user, "manageDocuments") ? (
            <Link href="/itineraries/new" className="btn-primary">
              New standalone itinerary
            </Link>
          ) : null
        }
      />

      <div className="mb-4 flex justify-end">
        <div className="flex gap-1 rounded-lg border border-border bg-card p-1 text-xs font-semibold">
          <Link
            href="/itineraries"
            className={`rounded-md px-3 py-1.5 ${!showSuperseded ? "bg-secondary text-secondary-foreground" : "text-muted-foreground"}`}
          >
            Current
          </Link>
          <Link
            href="/itineraries?superseded=1"
            className={`rounded-md px-3 py-1.5 ${showSuperseded ? "bg-secondary text-secondary-foreground" : "text-muted-foreground"}`}
          >
            Superseded
          </Link>
        </div>
      </div>

      {itineraries.length === 0 ? (
        <EmptyState title={showSuperseded ? "No superseded itineraries" : "No itineraries issued yet"}>
          Accept a quotation option and issue its itinerary, or create a standalone itinerary without
          a quotation.
        </EmptyState>
      ) : (
        <ItinerariesTable
          rows={rows}
          initialSearch={initialSearch}
          initialState={showSuperseded ? "superseded" : "current"}
        />
      )}
    </div>
  );
}
