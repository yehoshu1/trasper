import { Button } from "@/components/ui/button";

import Link from "next/link";

import { Alert, Card, PageHeader } from "@/components/ui";
import { ItineraryDocument } from "@/documents/itinerary-document";
import { ProformaDocument } from "@/documents/proforma-document";
import { QuotationDocument } from "@/documents/quotation-document";
import {
  DOCUMENT_TEMPLATE_DESCRIPTIONS,
  DOCUMENT_TEMPLATE_IDS,
  DOCUMENT_TEMPLATE_LABELS,
  type DocumentTemplate,
} from "@/lib/documents";
import {
  SAMPLE_ITINERARY,
  SAMPLE_PROFORMA,
  SAMPLE_PROFORMA_PAID,
  SAMPLE_PROFORMA_PAYMENTS,
  SAMPLE_QUOTATION,
} from "@/lib/template-samples";
import { requireCapableUser } from "@/server/auth";
import { getSettings } from "@/server/settings";
import { updateTemplatesAction } from "@/server/actions/settings";

export const dynamic = "force-dynamic";

type PreviewType = "quotation" | "itinerary" | "proforma";

function TemplatePreview({ type, template }: { type: PreviewType; template: DocumentTemplate }) {
  return (
    <div className="template-preview">
      <div className="template-preview-page">
        {type === "quotation" ? (
          <QuotationDocument snapshot={{ ...SAMPLE_QUOTATION, template }} />
        ) : type === "itinerary" ? (
          <ItineraryDocument snapshot={{ ...SAMPLE_ITINERARY, template }} />
        ) : (
          <ProformaDocument
            snapshot={{ ...SAMPLE_PROFORMA, template }}
            payments={SAMPLE_PROFORMA_PAYMENTS}
            paidMinor={SAMPLE_PROFORMA_PAID}
          />
        )}
      </div>
    </div>
  );
}

function TemplatePicker({
  name,
  title,
  subtitle,
  type,
  selected,
}: {
  name: "quotationTemplate" | "itineraryTemplate" | "proformaTemplate";
  title: string;
  subtitle: string;
  type: PreviewType;
  selected: DocumentTemplate;
}) {
  return (
    <Card title={title} subtitle={subtitle}>
      <fieldset>
        <legend className="sr-only">{title}</legend>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {DOCUMENT_TEMPLATE_IDS.map((template) => (
            <div key={template} className="min-w-0">
              <label className="block cursor-pointer">
                <input
                  type="radio"
                  name={name}
                  value={template}
                  defaultChecked={selected === template}
                  className="peer sr-only"
                  aria-label={DOCUMENT_TEMPLATE_LABELS[template]}
                />
                <div className="rounded-lg border border-border bg-card p-2 transition-shadow peer-checked:border-brand-700 peer-checked:ring-2 peer-checked:ring-brand-700/30">
                  <TemplatePreview type={type} template={template} />
                  <div className="px-1 pb-1 pt-2">
                    <p className="text-sm font-semibold text-foreground">
                      {DOCUMENT_TEMPLATE_LABELS[template]}
                    </p>
                    <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                      {DOCUMENT_TEMPLATE_DESCRIPTIONS[template]}
                    </p>
                  </div>
                </div>
              </label>
              <Link
                href={`/settings/templates/preview?type=${type}&template=${template}`}
                className="mt-1 inline-block px-1 text-[11px] font-semibold text-brand-700 hover:underline dark:text-brand-300"
              >
                Open full preview
              </Link>
            </div>
          ))}
        </div>
      </fieldset>
    </Card>
  );
}

export default async function DocumentTemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  await requireCapableUser("manageSettings");
  const query = await searchParams;
  const settings = await getSettings();

  return (
    <div className="max-w-6xl">
      <PageHeader
        eyebrow="Settings"
        title="Document templates"
        subtitle="Choose one of five designs for newly issued quotations, itineraries and pro formas. The previews use sample data; open a full preview to compare the picture letterhead with the company-details header. Existing documents keep the template they were issued with."
      />

      {query.error ? <Alert tone="error">{query.error}</Alert> : null}
      {query.saved ? <Alert tone="success">Templates saved.</Alert> : null}

      <form action={updateTemplatesAction} className="space-y-6">
        <TemplatePicker
          name="quotationTemplate"
          title="Quotation template"
          subtitle="Used when a quotation is sent, and for its draft preview."
          type="quotation"
          selected={settings.quotationTemplate}
        />
        <TemplatePicker
          name="itineraryTemplate"
          title="Itinerary template"
          subtitle="Copied into every newly issued travel itinerary."
          type="itinerary"
          selected={settings.itineraryTemplate}
        />
        <TemplatePicker
          name="proformaTemplate"
          title="Pro forma template"
          subtitle="Copied into every newly issued pro forma invoice."
          type="proforma"
          selected={settings.proformaTemplate}
        />

        <div className="flex flex-wrap items-center gap-3">
          <Button variant="default" type="submit">
            Save templates
          </Button>
          <p className="text-xs text-muted-foreground">
            Templates are frozen into a document snapshot when it is issued, so changing this
            setting never alters an existing document.
          </p>
        </div>
      </form>
    </div>
  );
}
