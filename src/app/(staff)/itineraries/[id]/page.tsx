import { Input } from "@/components/ui/input";

import Link from "next/link";
import { notFound } from "next/navigation";

import { ConfirmButton } from "@/components/confirm-button";
import { Alert, Card, PageHeader, StatusBadge } from "@/components/ui";
import { formatDate, formatDateTime } from "@/lib/dates";
import { hasCapability } from "@/lib/permissions";
import { parseSnapshot, type ItinerarySnapshot } from "@/lib/documents";
import { ItineraryDocument } from "@/documents/itinerary-document";
import { requireCapableUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { reissueItineraryFormAction } from "@/server/actions/itineraries";
import { loadQuotation } from "@/server/quotations";

export const dynamic = "force-dynamic";

export default async function ItineraryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const user = await requireCapableUser("viewDocuments");
  const { id } = await params;
  const query = await searchParams;

  const itinerary = await prisma.itinerary.findUnique({
    where: { id },
    include: {
      contact: true,
      quotation: { include: { contact: true } },
      createdBy: { select: { name: true } },
    },
  });
  if (!itinerary) notFound();

  const snapshot = parseSnapshot<ItinerarySnapshot>(itinerary.snapshot);
  const quotation = itinerary.quotationId ? await loadQuotation(itinerary.quotationId) : null;
  const customerName =
    itinerary.contact?.name ?? itinerary.quotation?.contact.name ?? "Customer to be advised";
  const standalone = !itinerary.quotationId;
  const canReissue =
    hasCapability(user, "manageDocuments") &&
    !itinerary.supersededAt &&
    (standalone || quotation?.status === "accepted");

  return (
    <div>
      <PageHeader
        eyebrow="Itinerary"
        title={`${itinerary.number} · ${customerName}`}
        subtitle={`Issued ${formatDate(itinerary.issuedAt)} by ${itinerary.createdBy.name}`}
        actions={
          <>
            {itinerary.quotationId && itinerary.quotation ? (
              <Link href={`/quotations/${itinerary.quotationId}`} className="btn-secondary">
                Quotation {itinerary.quotation.number}
              </Link>
            ) : null}
            <Link href={`/itineraries/${itinerary.id}/preview`} className="btn-secondary">
              Preview PDF
            </Link>
            <Link href={`/api/pdf/itinerary/${itinerary.id}`} className="btn-secondary">
              Download PDF
            </Link>
          </>
        }
      />

      {query.error ? <Alert tone="error">{query.error}</Alert> : null}
      {query.saved ? <Alert tone="success">Saved.</Alert> : null}
      {itinerary.supersededAt ? (
        <Alert tone="warning" title="Superseded">
          This itinerary was replaced by {itinerary.supersededBy ?? "a later issue"} on{" "}
          {formatDateTime(itinerary.supersededAt)}. Its printed content is unchanged.
        </Alert>
      ) : null}

      <div className="no-print mb-4 flex flex-wrap items-center gap-2">
        <StatusBadge status={itinerary.supersededAt ? "superseded" : "accepted"} />
        {standalone ? (
          <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Standalone · no quotation
          </span>
        ) : null}
        {itinerary.referenceNo ? (
          <span className="text-xs text-muted-foreground">Reference {itinerary.referenceNo}</span>
        ) : null}
        {canReissue ? (
          <form action={reissueItineraryFormAction} className="ml-auto">
            <Input type="hidden" name="itineraryId" value={itinerary.id} />
            <ConfirmButton variant="secondary"
              message="Re-issue this itinerary? A new number is allocated and this one is marked superseded."
            >
              Re-issue itinerary
            </ConfirmButton>
          </form>
        ) : null}
      </div>

      {snapshot ? (
        <div className="overflow-x-auto pb-8">
          <ItineraryDocument snapshot={snapshot} />
        </div>
      ) : (
        <Card title="Snapshot unavailable">
          <p className="text-sm text-muted-foreground">
            The saved snapshot for this itinerary could not be read. Its content cannot be
            reconstructed, so create a new itinerary if the document is still needed.
          </p>
        </Card>
      )}
    </div>
  );
}
