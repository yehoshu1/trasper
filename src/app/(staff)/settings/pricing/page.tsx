import { Button } from "@/components/ui/button";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { Alert, Card, Field, PageHeader } from "@/components/ui";
import { SelectField } from "@/components/ui/select";
import {
  PRICE_DISPLAY_DESCRIPTIONS,
  PRICE_DISPLAY_LABELS,
  PRICE_DISPLAY_MODES,
  TAX_DISPLAY_DESCRIPTIONS,
  TAX_DISPLAY_LABELS,
  TAX_DISPLAY_MODES,
} from "@/lib/pricing/presentation";
import { requireCapableUser } from "@/server/auth";
import { getSettings } from "@/server/settings";
import { updatePricingPresentationAction } from "@/server/actions/settings";

export const dynamic = "force-dynamic";

export default async function PricingPresentationSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  await requireCapableUser("manageSettings");
  const query = await searchParams;
  const settings = await getSettings();

  return (
    <div className="max-w-5xl">
      <PageHeader
        eyebrow="Settings"
        title="Pricing presentation"
        subtitle="Choose how customer quotations lay out prices, service fees and taxes. These are presentation choices only: the calculation order, VAT base and totals never change. Each quotation can override them."
      />

      {query.error ? <Alert tone="error">{query.error}</Alert> : null}
      {query.saved ? <Alert tone="success">Saved.</Alert> : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <Card title="Default price layout" subtitle="Applied to new quotations unless the quotation overrides it">
            <form action={updatePricingPresentationAction} className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Price layout"
                htmlFor="pricingDisplay"
                hint={PRICE_DISPLAY_DESCRIPTIONS[settings.pricingDisplay]}
                className="sm:col-span-2"
              >
                <SelectField
                  id="pricingDisplay"
                  name="pricingDisplay"
                  defaultValue={settings.pricingDisplay}
                  options={PRICE_DISPLAY_MODES.map((mode) => ({
                    value: mode,
                    label: PRICE_DISPLAY_LABELS[mode],
                  }))}
                />
              </Field>
              <Field
                label="Tax layout"
                htmlFor="taxDisplay"
                hint={TAX_DISPLAY_DESCRIPTIONS[settings.taxDisplay]}
                className="sm:col-span-2"
              >
                <SelectField
                  id="taxDisplay"
                  name="taxDisplay"
                  defaultValue={settings.taxDisplay}
                  options={TAX_DISPLAY_MODES.map((mode) => ({
                    value: mode,
                    label: TAX_DISPLAY_LABELS[mode],
                  }))}
                />
              </Field>
              <p className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground sm:col-span-2">
                <strong className="font-semibold text-foreground">Included</strong> means the tax is
                already inside each flight/service amount.{" "}
                <strong className="font-semibold text-foreground">NOT included</strong> means the
                flight/service amounts are shown before tax and the tax is added as a separate row
                before the total. The total the customer pays is the same in every layout.
              </p>

              <Field label="Service fee label" htmlFor="serviceFeeLabel" hint="e.g. Service fee, Booking fee, Agency commission">
                <Input id="serviceFeeLabel" name="serviceFeeLabel" required defaultValue={settings.serviceFeeLabel} maxLength={60} />
              </Field>
              <Field label="Combined tax label" htmlFor="taxLabel" hint="Used when taxes are shown as one row">
                <Input id="taxLabel" name="taxLabel" required defaultValue={settings.taxLabel} maxLength={60} />
              </Field>
              <Field label="VAT/GST label" htmlFor="vatLabel" hint="e.g. VAT, GST, Sales tax">
                <Input id="vatLabel" name="vatLabel" required defaultValue={settings.vatLabel} maxLength={60} />
              </Field>
              <Field label="Total label" htmlFor="totalLabel" hint="e.g. Total, Grand total, Package price">
                <Input id="totalLabel" name="totalLabel" required defaultValue={settings.totalLabel} maxLength={60} />
              </Field>
              <Field label="Per-person label" htmlFor="perPersonLabel" hint="Used by the per-person layout">
                <Input id="perPersonLabel" name="perPersonLabel" required defaultValue={settings.perPersonLabel} maxLength={60} />
              </Field>
              <Field label="Tax note" htmlFor="taxNote" hint="Optional sentence printed when taxes are included or itemised" className="sm:col-span-2">
                <Textarea id="taxNote" name="taxNote" rows={2} defaultValue={settings.taxNote} maxLength={500} />
              </Field>

              <div className="sm:col-span-2">
                <Button variant="default" type="submit">
                  Save pricing presentation
                </Button>
              </div>
            </form>
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="How the layouts work">
            <dl className="space-y-3 text-xs text-muted-foreground">
              <div>
                <dt className="font-semibold text-foreground">Lump sum per line</dt>
                <dd>One all-in amount per flight or service. The traditional quotation.</dd>
              </div>
              <div>
                <dt className="font-semibold text-foreground">Price plus service fee</dt>
                <dd>The supplier price is shown for each flight or service, then one agency service fee row.</dd>
              </div>
              <div>
                <dt className="font-semibold text-foreground">Itemised</dt>
                <dd>Supplier cost, service fee and every enabled tax appear as separate rows.</dd>
              </div>
              <div>
                <dt className="font-semibold text-foreground">Per person</dt>
                <dd>All-inclusive lines plus the price per traveller, common for packages and groups.</dd>
              </div>
              <div>
                <dt className="font-semibold text-foreground">Single total</dt>
                <dd>One package total without line prices, common for charter and cruise quotations.</dd>
              </div>
            </dl>
          </Card>
          <Card title="Tax layouts">
            <p className="mb-3 text-xs text-muted-foreground">
              VAT/GST is one line. A quotation option can also include multiple optional taxes
              (for example city tax, service charge and an airport fee) at the same time; the
              combined layout summarises them, while the itemised layout lists each one.
            </p>
            <dl className="space-y-3 text-xs text-muted-foreground">
              {TAX_DISPLAY_MODES.map((mode) => (
                <div key={mode}>
                  <dt className="font-semibold text-foreground">{TAX_DISPLAY_LABELS[mode]}</dt>
                  <dd>{TAX_DISPLAY_DESCRIPTIONS[mode]}</dd>
                </div>
              ))}
            </dl>
          </Card>
          <Card title="Accommodation lines">
            <p className="text-xs text-muted-foreground">
              Hotel, tour and transfer lines can carry a quantity and unit such as
              <span className="font-semibold text-foreground"> 3 nights</span>,
              <span className="font-semibold text-foreground"> 2 rooms × 3 nights</span> or
              <span className="font-semibold text-foreground"> 4 people</span>. The quotation then
              prints the unit rate and the line total, which covers the common per-room,
              per-person and per-night hotel pricing methods.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
