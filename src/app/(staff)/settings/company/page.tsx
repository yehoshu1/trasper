import { Button } from "@/components/ui/button";


import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import Link from "next/link";

import { LogoUploadForm } from "@/components/logo-upload";
import { Alert, Card, Field, PageHeader } from "@/components/ui";
import { SelectField } from "@/components/ui/select";
import { CURRENCIES } from "@/lib/money";
import { timeZoneLabel } from "@/lib/dates";
import {
  DOCUMENT_HEADER_MODES,
  DOCUMENT_HEADER_MODE_DESCRIPTIONS,
  DOCUMENT_HEADER_MODE_LABELS,
} from "@/lib/documents";
import { requireCapableUser } from "@/server/auth";
import { getSettings } from "@/server/settings";
import { updateCompanyAction, updateDefaultsAction } from "@/server/actions/settings";

export const dynamic = "force-dynamic";

export default async function CompanySettingsPage({
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
        title="Company"
        subtitle="Company details, picture letterhead, logo and footer. Choose whether documents print the letterhead image or the typed company details with the logo."
        actions={
          <a href="#document-header" className="btn-primary">
            Choose document header
          </a>
        }
      />

      {query.error ? <Alert tone="error">{query.error}</Alert> : null}
      {query.saved ? <Alert tone="success">Saved.</Alert> : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-6">
          <Card title="Company details">
            <form action={updateCompanyAction} className="grid gap-4 sm:grid-cols-2">
              <Field label="Company name" htmlFor="companyName" className="sm:col-span-2">
                <Input id="companyName" name="companyName" required defaultValue={settings.companyName} />
              </Field>
              <Field label="Address" htmlFor="companyAddress" className="sm:col-span-2">
                <Textarea id="companyAddress" name="companyAddress" rows={2} defaultValue={settings.companyAddress} />
              </Field>
              <Field label="Email" htmlFor="companyEmail">
                <Input id="companyEmail" name="companyEmail" type="email" defaultValue={settings.companyEmail} />
              </Field>
              <Field label="Phone" htmlFor="companyPhone">
                <Input id="companyPhone" name="companyPhone" defaultValue={settings.companyPhone} />
              </Field>
              <Field label="Website" htmlFor="companyWebsite">
                <Input id="companyWebsite" name="companyWebsite" defaultValue={settings.companyWebsite} />
              </Field>
              <Field
                label="TIN"
                htmlFor="companyTin"
                hint="Printed on its own line, separate from a picture letterhead"
              >
                <Input id="companyTin" name="companyTin" defaultValue={settings.companyTin} />
              </Field>
              <div id="document-header" className="scroll-mt-24 sm:col-span-2">
                <Field
                  label="Document header"
                  htmlFor="companyHeaderMode"
                  hint={DOCUMENT_HEADER_MODE_DESCRIPTIONS[settings.companyHeaderMode]}
                >
                  <SelectField
                    id="companyHeaderMode"
                    name="companyHeaderMode"
                    defaultValue={settings.companyHeaderMode}
                    options={DOCUMENT_HEADER_MODES.map((mode) => ({
                      value: mode,
                      label: DOCUMENT_HEADER_MODE_LABELS[mode],
                    }))}
                  />
                </Field>
              </div>
              <Field
                label="Time zone"
                htmlFor="timeZone"
                hint={`IANA zone used for document dates and deadlines (${timeZoneLabel(settings.timeZone)})`}
                className="sm:col-span-2"
              >
                <Input
                  id="timeZone"
                  name="timeZone"
                  defaultValue={settings.timeZone}
                  list="timezone-options"
                  required
                />
                <datalist id="timezone-options">
                  {["UTC","Africa/Blantyre","Africa/Nairobi","Africa/Johannesburg","Africa/Lagos","Africa/Cairo","Europe/London","Europe/Paris","America/New_York","America/Los_Angeles","Asia/Dubai","Asia/Singapore","Australia/Sydney"].map((zone) => (
                    <option key={zone} value={zone} />
                  ))}
                </datalist>
              </Field>
              <Field label="Footer line" htmlFor="companyFooterText" className="sm:col-span-2">
                <Input id="companyFooterText" name="companyFooterText" defaultValue={settings.companyFooterText} />
              </Field>
              <Field label="Internal notes" htmlFor="companyNotes" className="sm:col-span-2" hint="Not printed on customer documents">
                <Textarea id="companyNotes" name="companyNotes" rows={3} defaultValue={settings.companyNotes} />
              </Field>
              <div className="sm:col-span-2">
                <Button variant="default" type="submit">
                  Save company details
                </Button>
              </div>
            </form>
          </Card>

          <Card title="Defaults" subtitle="Applied to new quotations and warnings">
            <form action={updateDefaultsAction} className="grid gap-4 sm:grid-cols-2">
              <Field label="Base currency" htmlFor="baseCurrency">
                <SelectField
                  id="baseCurrency"
                  name="baseCurrency"
                  defaultValue={settings.baseCurrency}
                  options={Object.values(CURRENCIES).map((currency) => ({
                    value: currency.code,
                    label: `${currency.code} — ${currency.name}`,
                  }))}
                />
              </Field>
              <Field label="Default margin (%)" htmlFor="defaultMargin">
                <Input
                  id="defaultMargin"
                  name="defaultMargin" className="text-right"
                  defaultValue={(Number(settings.defaultMarginBps) / 100).toString()}
                  inputMode="decimal"
                />
              </Field>
              <Field
                label="Quotation validity (days)"
                htmlFor="defaultValidityDays"
                hint="New quotations default to 1 day."
              >
                <Input
                  id="defaultValidityDays"
                  name="defaultValidityDays"
                  type="number"
                  min={1}
                  max={365}
                  defaultValue={settings.defaultValidityDays}
                />
              </Field>
              <Field label="Warn when a rate is older than (days)" htmlFor="rateMaxAgeDays">
                <Input
                  id="rateMaxAgeDays"
                  name="rateMaxAgeDays"
                  type="number"
                  min={0}
                  max={365}
                  defaultValue={settings.rateMaxAgeDays}
                />
              </Field>
              <Field label="Ticketing warning window (hours)" htmlFor="ticketingWarningHours">
                <Input
                  id="ticketingWarningHours"
                  name="ticketingWarningHours"
                  type="number"
                  min={1}
                  max={720}
                  defaultValue={settings.ticketingWarningHours}
                />
              </Field>
              <Field label="Payment terms" htmlFor="paymentTerms" className="sm:col-span-2">
                <Textarea id="paymentTerms" name="paymentTerms" rows={2} defaultValue={settings.paymentTerms} />
              </Field>
              <Field label="Standard quotation notes" htmlFor="quotationNotes" className="sm:col-span-2">
                <Textarea id="quotationNotes" name="quotationNotes" rows={3} defaultValue={settings.quotationNotes} />
              </Field>
              <Field
                label="Quotation validity statement"
                htmlFor="quotationValidityStatement"
                hint="Printed under the quotation journeys and frozen when the quotation is sent."
                className="sm:col-span-2"
              >
                <Textarea
                  id="quotationValidityStatement"
                  name="quotationValidityStatement"
                  rows={4}
                  defaultValue={settings.quotationValidityStatement}
                />
              </Field>
              <div className="sm:col-span-2">
                <Button variant="default" type="submit">
                  Save defaults
                </Button>
              </div>
            </form>
          </Card>
        </div>

        <div className="space-y-6">
          <Card
            title="Picture letterhead"
            subtitle="Used when Document header is set to Picture letterhead. The TIN is printed separately below the image (max 2 MB)."
            className="scroll-mt-24"
          >
            <div id="picture-letterhead" className="scroll-mt-24">
              {settings.companyLetterheadImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={settings.companyLetterheadImage}
                  alt="Current letterhead"
                  className="mb-3 w-full rounded border border-border bg-muted/40 p-1"
                />
              ) : (
                <p className="mb-3 text-xs text-muted-foreground">
                  No letterhead yet. Upload a wide image (banners work best) to brand the top of
                  quotations, itineraries and pro formas.
                </p>
              )}
              <LogoUploadForm kind="letterhead" label="Upload letterhead" />
            </div>
          </Card>

          <Card title="Company logo" subtitle="PNG or JPEG; shown in the sidebar and in the Company details document header (max 2 MB)">
            {settings.companyHeaderImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={settings.companyHeaderImage}
                alt="Current header"
                className="mb-3 max-h-24 w-auto rounded border border-border bg-white p-2"
              />
            ) : (
              <p className="mb-3 text-xs text-muted-foreground">No logo yet; a generic mark is used.</p>
            )}
            <LogoUploadForm label="Upload logo" />
          </Card>

          <Card title="Related settings">
            <ul className="space-y-2 text-sm">
              <li><Link href="/settings/templates">Document templates</Link></li>
              <li><Link href="/settings/pricing">Pricing presentation</Link></li>
              <li><Link href="/settings/themes">Themes</Link></li>
              <li><Link href="/settings/branches">Branches</Link></li>
              <li><Link href="/settings/roles">Roles and permissions</Link></li>
              <li><Link href="/settings/banks">Bank accounts</Link></li>
              <li><Link href="/settings/currencies">Currencies and rates</Link></li>
              <li><Link href="/settings/tax">VAT and rounding</Link></li>
              <li><Link href="/settings/numbering">Numbering</Link></li>
              <li><Link href="/settings/airlines">Airlines and logos</Link></li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
