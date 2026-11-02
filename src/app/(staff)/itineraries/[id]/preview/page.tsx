import Link from "next/link";
import { notFound } from "next/navigation";

import { PdfPreview } from "@/components/pdf-preview";
import { requireCapableUser } from "@/server/auth";
import { prisma } from "@/server/db";

export const dynamic = "force-dynamic";

export default async function ItineraryPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireCapableUser("viewDocuments");
  const { id } = await params;
  const itinerary = await prisma.itinerary.findUnique({
    where: { id },
    select: { id: true, number: true },
  });
  if (!itinerary) notFound();

  return (
    <div>
      <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href={`/itineraries/${itinerary.id}`} className="text-sm font-semibold text-foreground">
            ← Back to itinerary
          </Link>
          <p className="mt-1 text-xs text-muted-foreground">{itinerary.number}</p>
        </div>
        <Link href={`/api/pdf/itinerary/${itinerary.id}`} className="btn-primary">
          Download PDF
        </Link>
      </div>
      <PdfPreview
        src={`/api/pdf/itinerary/${itinerary.id}?inline=1`}
        title={`Itinerary ${itinerary.number} preview`}
        height="calc(100vh - 230px)"
      />
    </div>
  );
}
