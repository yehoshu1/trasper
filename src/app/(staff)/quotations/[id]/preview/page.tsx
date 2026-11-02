import Link from "next/link";
import { notFound } from "next/navigation";

import { PdfPreview } from "@/components/pdf-preview";
import { requireCapableUser } from "@/server/auth";
import { prisma } from "@/server/db";

export const dynamic = "force-dynamic";

export default async function QuotationPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireCapableUser("viewDocuments");
  const { id } = await params;
  const quotation = await prisma.quotation.findUnique({
    where: { id },
    select: { id: true, number: true },
  });
  if (!quotation) notFound();

  return (
    <div>
      <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href={`/quotations/${quotation.id}`} className="text-sm font-semibold text-foreground">
            ← Back to quotation
          </Link>
          <p className="mt-1 text-xs text-muted-foreground">{quotation.number}</p>
        </div>
        <Link href={`/api/pdf/quotation/${quotation.id}`} className="btn-primary">
          Download PDF
        </Link>
      </div>
      <PdfPreview
        src={`/api/pdf/quotation/${quotation.id}?inline=1`}
        title={`Quotation ${quotation.number} preview`}
        height="calc(100vh - 230px)"
      />
    </div>
  );
}
