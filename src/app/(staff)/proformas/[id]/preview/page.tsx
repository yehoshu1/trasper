import Link from "next/link";
import { notFound } from "next/navigation";

import { PdfPreview } from "@/components/pdf-preview";
import { requireCapableUser } from "@/server/auth";
import { prisma } from "@/server/db";

export const dynamic = "force-dynamic";

export default async function ProformaPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireCapableUser("viewCosts");
  const { id } = await params;
  const proforma = await prisma.proforma.findUnique({
    where: { id },
    select: { id: true, number: true },
  });
  if (!proforma) notFound();

  return (
    <div>
      <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href={`/proformas/${proforma.id}`} className="text-sm font-semibold text-foreground">
            ← Back to pro forma
          </Link>
          <p className="mt-1 text-xs text-muted-foreground">{proforma.number}</p>
        </div>
        <Link href={`/api/pdf/proforma/${proforma.id}`} className="btn-primary">
          Download PDF
        </Link>
      </div>
      <PdfPreview
        src={`/api/pdf/proforma/${proforma.id}?inline=1`}
        title={`Pro forma ${proforma.number} preview`}
        height="calc(100vh - 230px)"
      />
    </div>
  );
}
