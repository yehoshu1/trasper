import { Button } from "@/components/ui/button";

import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import Link from "next/link";

import { Alert, Field, PageHeader } from "@/components/ui";
import { SelectField } from "@/components/ui/select";
import { CURRENCIES } from "@/lib/money";
import { todayInAppZone } from "@/lib/dates";
import { hasCapability } from "@/lib/permissions";
import { requireCapableUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { createQuotationAction } from "@/server/actions/quotations";
import { getSettings } from "@/server/settings";

export const dynamic = "force-dynamic";

function isoToday(): string {
  return todayInAppZone().toISODate() ?? "";
}

function plusDays(days: number): string {
  return todayInAppZone().plus({ days }).toISODate() ?? "";
}

export default async function NewQuotationPage({
  searchParams,
}: {
  searchParams: Promise<{ contactId?: string; error?: string }>;
}) {
  const user = await requireCapableUser("manageQuotations");
  const params = await searchParams;
  const settings = await getSettings();

  const [contacts, branches] = await Promise.all([
    prisma.contact.findMany({
      where: { archivedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, city: true },
    }),
    prisma.branch.findMany({ where: { active: true }, orderBy: { code: "asc" } }),
  ]);

  return (
    <div className="max-w-3xl">
      <PageHeader
        eyebrow="Quotations"
        title="New quotation"
        subtitle="Choose the paying customer and the document dates. Options, fares and flights are added in the editor."
        actions={<Link href="/quotations" className="btn-secondary">Back to quotations</Link>}
      />
      {params.error ? <Alert tone="error">{params.error}</Alert> : null}

      <form action={createQuotationAction} className="space-y-5">
        <div className="card card-body grid gap-5 sm:grid-cols-2">
          <Field label="Customer" htmlFor="contactId" className="sm:col-span-2">
            <SelectField
              id="contactId"
              name="contactId"
              required
              defaultValue={params.contactId ?? ""}
              placeholder="Choose a customer"
              options={[
                { value: "", label: "Choose a customer" },
                ...contacts.map((contact) => ({
                  value: contact.id,
                  label: contact.city ? `${contact.name} — ${contact.city}` : contact.name,
                })),
              ]}
            />
          </Field>
          <Field
            label="Branch"
            htmlFor="branch"
            hint="Used in the quotation number; defaults to your branch"
          >
            <SelectField
              id="branch"
              name="branch"
              defaultValue={user.branch}
              required
              options={branches.map((branch) => ({
                value: branch.code,
                label: `${branch.code} — ${branch.name}`,
              }))}
            />
          </Field>
          <Field label="Your reference" htmlFor="referenceNo" hint="Customer's own reference, if any">
            <Input id="referenceNo" name="referenceNo" maxLength={80} />
          </Field>
          <Field label="Currency" htmlFor="currency">
            <SelectField
              id="currency"
              name="currency"
              defaultValue={settings.baseCurrency}
              options={Object.values(CURRENCIES).map((currency) => ({
                value: currency.code,
                label: `${currency.code} — ${currency.name}`,
              }))}
            />
          </Field>
          <Field label="Issue date" htmlFor="issueDate">
            <DatePicker id="issueDate" name="issueDate" required defaultValue={isoToday()} />
          </Field>
          <Field label="Valid until" htmlFor="validUntil">
            <DatePicker
              id="validUntil"
              name="validUntil"
              required
              defaultValue={plusDays(settings.defaultValidityDays)}
            />
          </Field>
          <Field
            label="VAT"
            htmlFor="vatOverride"
            hint={`Global setting is ${settings.vatEnabled ? "on" : "off"} at ${Number(settings.vatRateBps) / 100}%. VAT is charged on the margin and never shown on the quotation.`}
          >
            <SelectField
              id="vatOverride"
              name="vatOverride"
              defaultValue="inherit"
              options={[
                { value: "inherit", label: "Follow the global setting" },
                { value: "on", label: "Charge VAT on this quotation" },
                { value: "off", label: "Do not charge VAT" },
              ]}
            />
          </Field>
          <Field label="Notes for the customer" htmlFor="notes" className="sm:col-span-2">
            <Textarea
              id="notes"
              name="notes"
              rows={3}
              placeholder="Leave blank to use the standard quotation notes"
            />
          </Field>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="default" type="submit">Create quotation</Button>
          <Link href="/quotations" className="btn-secondary">Cancel</Link>
          {!hasCapability(user, "manageQuotations") ? (
            <span className="text-xs text-red-600 dark:text-red-400">Your role cannot create quotations.</span>
          ) : null}
        </div>
      </form>
    </div>
  );
}
