import Link from "next/link";

import { PageHeader } from "@/components/ui";
import { ItineraryDocument } from "@/documents/itinerary-document";
import { ProformaDocument } from "@/documents/proforma-document";
import { QuotationDocument } from "@/documents/quotation-document";
import {
  DOCUMENT_HEADER_MODES,
  DOCUMENT_HEADER_MODE_LABELS,
  DOCUMENT_TEMPLATE_IDS,
  DOCUMENT_TEMPLATE_LABELS,
  isDocumentHeaderMode,
  isDocumentTemplate,
} from "@/lib/documents";
import {
  SAMPLE_ITINERARY,
  SAMPLE_PROFORMA,
  SAMPLE_PROFORMA_PAID,
  SAMPLE_PROFORMA_PAYMENTS,
  SAMPLE_QUOTATION,
} from "@/lib/template-samples";
import { requireCapableUser } from "@/server/auth";

export const dynamic = "force-dynamic";

const TYPES = [
  ["quotation", "Quotation"],
  ["itinerary", "Itinerary"],
  ["proforma", "Pro forma"],
] as const;

export default async function TemplatePreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; template?: string; header?: string }>;
}) {
  await requireCapableUser("manageSettings");
  const query = await searchParams;
  const type = TYPES.find(([value]) => value === query.type)?.[0] ?? "quotation";
  const template = isDocumentTemplate(query.template) ? query.template : "classic";
  const header = isDocumentHeaderMode(query.header) ? query.header : "letterhead";
  const typeLabel = TYPES.find(([value]) => value === type)?.[1] ?? "Quotation";
  const templateLabel = DOCUMENT_TEMPLATE_LABELS[template];

  return (
    <div>
      <PageHeader
        eyebrow="Settings"
        title="Template preview"
        subtitle={`${typeLabel} · ${templateLabel} · ${DOCUMENT_HEADER_MODE_LABELS[header]} · sample data`}
        actions={
          <Link href="/settings/templates" className="btn-secondary">
            Back to templates
          </Link>
        }
      />

      <div className="no-print mb-2 flex flex-wrap items-center gap-2">
        {DOCUMENT_TEMPLATE_IDS.map((value) => (
          <Link
            key={value}
            href={`/settings/templates/preview?type=${type}&template=${value}&header=${header}`}
            className={value === template ? "btn-primary" : "btn-secondary"}
          >
            {DOCUMENT_TEMPLATE_LABELS[value]}
          </Link>
        ))}
      </div>

      <div className="no-print mb-4 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Header
        </span>
        {DOCUMENT_HEADER_MODES.map((mode) => (
          <Link
            key={mode}
            href={`/settings/templates/preview?type=${type}&template=${template}&header=${mode}`}
            className={mode === header ? "btn-primary" : "btn-secondary"}
          >
            {DOCUMENT_HEADER_MODE_LABELS[mode]}
          </Link>
        ))}
      </div>

      <div className="overflow-x-auto pb-8">
        {type === "quotation" ? (
          <QuotationDocument
            snapshot={{
              ...SAMPLE_QUOTATION,
              template,
              company: { ...SAMPLE_QUOTATION.company, headerMode: header },
            }}
          />
        ) : type === "itinerary" ? (
          <ItineraryDocument
            snapshot={{
              ...SAMPLE_ITINERARY,
              template,
              company: { ...SAMPLE_ITINERARY.company, headerMode: header },
            }}
          />
        ) : (
          <ProformaDocument
            snapshot={{
              ...SAMPLE_PROFORMA,
              template,
              company: { ...SAMPLE_PROFORMA.company, headerMode: header },
            }}
            payments={SAMPLE_PROFORMA_PAYMENTS}
            paidMinor={SAMPLE_PROFORMA_PAID}
          />
        )}
      </div>
    </div>
  );
}
