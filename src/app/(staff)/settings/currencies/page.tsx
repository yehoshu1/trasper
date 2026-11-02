import { Button } from "@/components/ui/button";

import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";

import Link from "next/link";

import { Alert, Card, Field, PageHeader } from "@/components/ui";
import { SelectField } from "@/components/ui/select";
import { formatDate, todayInAppZone } from "@/lib/dates";
import { CURRENCIES } from "@/lib/money";
import { formatRateMicro } from "@/lib/money";
import { requireCapableUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { getSettings } from "@/server/settings";
import { saveExchangeRateAction } from "@/server/actions/settings";

export const dynamic = "force-dynamic";

export default async function CurrenciesSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  await requireCapableUser("manageSettings");
  const query = await searchParams;
  const settings = await getSettings();
  const [currencies, rates] = await Promise.all([
    prisma.currency.findMany({ orderBy: { code: "asc" } }),
    prisma.exchangeRate.findMany({
      orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }],
      take: 100,
      include: { createdBy: { select: { name: true } } },
    }),
  ]);
  const today = todayInAppZone().toISODate() ?? "";
  const choices = currencies.length > 0 ? currencies.map((currency) => currency.code) : Object.keys(CURRENCIES);

  return (
    <div className="max-w-5xl">
      <PageHeader
        eyebrow="Settings"
        title="Currencies and exchange rates"
        subtitle="Rates are stored as integers (rate × 1,000,000) and frozen onto a quotation when it is sent."
      />

      {query.error ? <Alert tone="error">{query.error}</Alert> : null}
      {query.saved ? <Alert tone="success">Saved.</Alert> : null}

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="card card-body">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Base currency</p>
          <p className="mt-1 text-xl font-bold text-foreground">{settings.baseCurrency}</p>
        </div>
        <div className="card card-body">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Rounding unit</p>
          <p className="mt-1 text-xl font-bold text-foreground">{settings.roundingUnit.toString()} minor</p>
          <p className="text-xs text-muted-foreground">Set on the VAT page</p>
        </div>
        <div className="card card-body">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Rate warning</p>
          <p className="mt-1 text-xl font-bold text-foreground">{settings.rateMaxAgeDays} days</p>
          <Link href="/settings/company" className="text-xs font-semibold">
            Change defaults
          </Link>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card title="Rate history" subtitle="Newest first">
          {rates.length === 0 ? (
            <p className="text-sm text-muted-foreground">No exchange rates saved yet. Add one on the right.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Pair</th>
                    <th className="text-right">Rate</th>
                    <th>Effective from</th>
                    <th>Entered by</th>
                  </tr>
                </thead>
                <tbody>
                  {rates.map((rate) => (
                    <tr key={rate.id}>
                      <td className="font-semibold text-foreground">
                        {rate.fromCcy} → {rate.toCcy}
                      </td>
                      <td className="text-right tabular-nums">{formatRateMicro(rate.rateMicro)}</td>
                      <td className="text-muted-foreground">{formatDate(rate.effectiveFrom)}</td>
                      <td className="text-xs text-muted-foreground">{rate.createdBy.name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div className="space-y-6">
          <Card title="Add a rate">
            <form action={saveExchangeRateAction} className="space-y-3">
              <Field label="From" htmlFor="fromCcy">
                <SelectField
                  id="fromCcy"
                  name="fromCcy"
                  defaultValue="USD"
                  options={choices.map((code) => ({ value: code, label: code }))}
                />
              </Field>
              <Field label="To" htmlFor="toCcy">
                <SelectField
                  id="toCcy"
                  name="toCcy"
                  defaultValue={settings.baseCurrency}
                  options={choices.map((code) => ({ value: code, label: code }))}
                />
              </Field>
              <Field label={`Rate (To per 1 From)`} htmlFor="rate" hint="Up to six decimal places, e.g. 1750.5">
                <Input id="rate" name="rate" className="text-right" inputMode="decimal" required placeholder="1750.5" />
              </Field>
              <Field label="Effective from" htmlFor="effectiveFrom">
                <DatePicker id="effectiveFrom" name="effectiveFrom" defaultValue={today} required />
              </Field>
              <Button variant="default" type="submit" className="w-full">
                Save rate
              </Button>
            </form>
          </Card>

          <Card title="Currency list">
            <ul className="divide-y divide-border text-sm">
              {currencies.map((currency) => (
                <li key={currency.code} className="flex items-center justify-between py-1.5">
                  <span>
                    <span className="font-semibold">{currency.code}</span>{" "}
                    <span className="text-muted-foreground">{currency.name}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">{currency.active ? "Active" : "Inactive"}</span>
                </li>
              ))}
              {currencies.length === 0 ? <li className="py-2 text-muted-foreground">Seed currencies first.</li> : null}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
