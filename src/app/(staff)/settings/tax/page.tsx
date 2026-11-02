import { Button } from "@/components/ui/button";

import { Checkbox } from "@/components/ui/checkbox";

import { Input } from "@/components/ui/input";

import { ConfirmButton } from "@/components/confirm-button";
import { Alert, Card, Field, PageHeader } from "@/components/ui";
import { SelectField } from "@/components/ui/select";
import { formatPercent, minorToDecimalString } from "@/lib/money";
import { requireCapableUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { getSettings } from "@/server/settings";
import { removeTaxPresetAction, saveTaxPresetAction, updateTaxAction } from "@/server/actions/settings";

export const dynamic = "force-dynamic";

export default async function TaxSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string; id?: string }>;
}) {
  await requireCapableUser("manageSettings");
  const query = await searchParams;
  const settings = await getSettings();
  const presets = await prisma.taxPreset.findMany({ orderBy: { name: "asc" } });
  const editing = query.id ? presets.find((preset) => preset.id === query.id) : undefined;

  return (
    <div className="max-w-5xl">
      <PageHeader
        eyebrow="Settings"
        title="VAT and taxes"
        subtitle="VAT is always calculated on the service fee (markup) only. Optional taxes can be charged on cost, service fee or subtotal. Settings → Pricing presentation controls whether tax rows appear on a quotation; the calculation itself never changes. A quotation can include VAT plus up to 20 optional taxes, and each preset here can be reused on any quotation."
      />

      {query.error ? <Alert tone="error">{query.error}</Alert> : null}
      {query.saved ? <Alert tone="success">Saved.</Alert> : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <Card title="VAT">
            <form action={updateTaxAction} className="grid gap-4 sm:grid-cols-2">
              <label className="flex items-center gap-2 text-sm text-foreground sm:col-span-2">
                <Checkbox name="vatEnabled" defaultChecked={settings.vatEnabled} />
                Charge VAT by default on new quotations
              </label>
              <Field
                label="VAT rate (%)"
                htmlFor="vatRate"
                hint="Enter your local VAT rate, for example 16.5; stored as basis points"
              >
                <Input
                  id="vatRate"
                  name="vatRate" className="text-right"
                  inputMode="decimal"
                  defaultValue={(Number(settings.vatRateBps) / 100).toString()}
                  required
                />
              </Field>
              <Field label="VAT registration number" htmlFor="vatRegistrationNumber">
                <Input
                  id="vatRegistrationNumber"
                  name="vatRegistrationNumber"
                  defaultValue={settings.vatRegistrationNumber}
                />
              </Field>
              <Field
                label="Rounding unit (minor units)"
                htmlFor="roundingUnit"
                hint="Totals are rounded once to this unit, e.g. 100 = nearest kwacha"
              >
                <Input
                  id="roundingUnit"
                  name="roundingUnit"
                  type="number"
                  min={1}
                  max={100000}
                  defaultValue={settings.roundingUnit.toString()}
                  required
                />
              </Field>
              <div className="self-end sm:col-span-2">
                <Button variant="default" type="submit">
                  Save VAT settings
                </Button>
              </div>
            </form>
            <p className="mt-3 rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              Quotations can override the VAT switch per document. The default presentation keeps
              taxes inside one lump sum per line; choose an itemised tax layout in Settings → Pricing
              presentation when the customer or tax authority needs the tax rows shown.
            </p>
          </Card>

          <Card title={`Optional tax presets (${presets.length})`} subtitle="Add as many reusable presets as you need — hotel service tax, airport fee, city tax and similar. A quotation option may include several enabled optional taxes at once.">
            {presets.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No presets yet. Add one below, or type taxes directly into each option in the quotation editor.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {presets.map((preset) => (
                  <li key={preset.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                    <div>
                      <p className="font-semibold text-foreground">{preset.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {preset.kind === "percent"
                          ? `${formatPercent(preset.value)} of ${preset.base === "markup" ? "service fee" : preset.base === "subtotal" ? "subtotal" : "converted cost"}`
                          : `${minorToDecimalString(preset.value, settings.baseCurrency)} ${settings.baseCurrency} fixed`}
                        {!preset.enabled ? " · disabled" : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <a href={`/settings/tax?id=${preset.id}`} className="btn-secondary px-2 py-1 text-xs">
                        Edit
                      </a>
                      <form action={removeTaxPresetAction}>
                        <Input type="hidden" name="id" value={preset.id} />
                        <ConfirmButton variant="ghost" className="px-2 py-1 text-xs text-red-600 dark:text-red-400"
                          message="Remove this tax preset?"
                        >
                          Remove
                        </ConfirmButton>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <Card title={editing ? "Edit preset" : "Add a preset"}>
          <form action={saveTaxPresetAction} className="space-y-3">
            {editing ? <Input type="hidden" name="id" value={editing.id} /> : null}
            <Field label="Name" htmlFor="name">
              <Input id="name" name="name" required defaultValue={editing?.name} placeholder="Service fee" />
            </Field>
            <Field label="Kind" htmlFor="kind">
              <SelectField
                key={editing?.id ?? "new"}
                id="kind"
                name="kind"
                defaultValue={editing?.kind ?? "fixed"}
                options={[
                  { value: "fixed", label: "Fixed amount" },
                  { value: "percent", label: "Percent" },
                ]}
              />
            </Field>
            <Field
              label="Percentage base"
              htmlFor="base"
              hint="Cost is the supplier cost; service fee is the markup; subtotal is cost plus service fee"
            >
              <SelectField
                id="base"
                name="base"
                defaultValue={editing?.base ?? "cost"}
                options={[
                  { value: "cost", label: "Converted cost" },
                  { value: "markup", label: "Service fee (markup)" },
                  { value: "subtotal", label: "Cost + service fee" },
                ]}
              />
            </Field>
            <Field
              label="Value"
              htmlFor="value"
              hint="Fixed amounts are in the base currency; percentages use up to two decimals"
            >
              <Input
                id="value"
                name="value" className="text-right"
                inputMode="decimal"
                required
                defaultValue={
                  editing
                    ? editing.kind === "percent"
                      ? (Number(editing.value) / 100).toString()
                      : minorToDecimalString(editing.value, settings.baseCurrency)
                    : ""
                }
              />
            </Field>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <Checkbox name="enabled" defaultChecked={editing?.enabled ?? true} />
              Enabled
            </label>
            <Button variant="default" type="submit" className="w-full">
              Save preset
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
