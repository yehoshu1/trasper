import { Button } from "@/components/ui/button";

import { Checkbox } from "@/components/ui/checkbox";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { ConfirmButton } from "@/components/confirm-button";
import { Alert, Card, Field, PageHeader } from "@/components/ui";
import { SelectField } from "@/components/ui/select";
import { CURRENCIES } from "@/lib/money";
import { sortBankAccounts } from "@/lib/bank-accounts";
import { requireCapableUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { getSettings } from "@/server/settings";
import { removeBankAction, updateBankAction } from "@/server/actions/settings";

export const dynamic = "force-dynamic";

export default async function BanksSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string; id?: string }>;
}) {
  await requireCapableUser("manageSettings");
  const query = await searchParams;
  const settings = await getSettings();
  const banks = sortBankAccounts(await prisma.bankAccount.findMany());
  const editing = query.id ? banks.find((bank) => bank.id === query.id) : undefined;
  const currencyCodes = [...new Set([settings.baseCurrency, ...Object.keys(CURRENCIES)])];

  return (
    <div className="max-w-6xl">
      <PageHeader
        eyebrow="Settings"
        title="Bank accounts"
        subtitle="Each document prints one account's details. The default is pre-selected, and the chosen details are frozen into the document when it is sent or issued."
      />

      {query.error ? <Alert tone="error">{query.error}</Alert> : null}
      {query.saved ? <Alert tone="success">Saved.</Alert> : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
        <Card title={`Accounts (${banks.length})`}>
          {banks.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No bank accounts yet. Add the first one on the right; it becomes the default.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {banks.map((bank) => (
                <li key={bank.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                  <div>
                    <p className="flex flex-wrap items-center gap-2 font-semibold text-foreground">
                      {bank.label}
                      <span className="badge bg-muted text-muted-foreground">{bank.currency}</span>
                      {bank.isDefault ? (
                        <span className="badge bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                          Default
                        </span>
                      ) : null}
                      {bank.isArchived ? (
                        <span className="badge bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
                          Archived
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {bank.bankName}
                      {bank.branchName ? ` · ${bank.branchName}` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {bank.accountName} · {bank.accountNumber}
                    </p>
                    {bank.swiftCode ? <p className="text-xs text-muted-foreground">SWIFT {bank.swiftCode}</p> : null}
                    {bank.sortCode ? <p className="text-xs text-muted-foreground">Sort code {bank.sortCode}</p> : null}
                    {bank.paymentInstructions ? (
                      <p className="mt-1 max-w-xl text-xs text-muted-foreground">{bank.paymentInstructions}</p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <a href={`/settings/banks?id=${bank.id}`} className="btn-secondary px-2 py-1 text-xs">
                      Edit
                    </a>
                    <form action={removeBankAction}>
                      <Input type="hidden" name="id" value={bank.id} />
                      <ConfirmButton variant="ghost" className="px-2 py-1 text-xs text-red-600 dark:text-red-400"
                        message="Remove this account? Accounts used by a document are archived instead; issued documents keep their frozen details."
                      >
                        {bank.isArchived ? "Delete" : "Remove"}
                      </ConfirmButton>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title={editing ? `Edit ${editing.label}` : "Add an account"}>
          <form action={updateBankAction} className="space-y-3">
            {editing ? <Input type="hidden" name="id" value={editing.id} /> : null}
            <Field label="Label" htmlFor="label" hint="Shown to staff, e.g. Stanbic MWK">
              <Input id="label" name="label" required defaultValue={editing?.label} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Currency" htmlFor="currency">
                <SelectField
                  key={editing?.id ?? "new"}
                  id="currency"
                  name="currency"
                  defaultValue={editing?.currency ?? ""}
                  placeholder="Choose"
                  required
                  options={[
                    { value: "", label: "Choose" },
                    ...currencyCodes.map((code) => ({ value: code, label: code })),
                  ]}
                />
              </Field>
              <Field label="Sort order" htmlFor="sortOrder">
                <Input id="sortOrder" name="sortOrder" type="number" min={0} max={9999} defaultValue={editing?.sortOrder ?? 0} />
              </Field>
            </div>
            <Field label="Bank name" htmlFor="bankName">
              <Input id="bankName" name="bankName" required defaultValue={editing?.bankName} />
            </Field>
            <Field label="Branch name" htmlFor="branchName">
              <Input id="branchName" name="branchName" defaultValue={editing?.branchName ?? ""} />
            </Field>
            <Field label="Account name" htmlFor="accountName">
              <Input id="accountName" name="accountName" required defaultValue={editing?.accountName} />
            </Field>
            <Field label="Account number" htmlFor="accountNumber">
              <Input id="accountNumber" name="accountNumber" required defaultValue={editing?.accountNumber} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="SWIFT code" htmlFor="swiftCode">
                <Input id="swiftCode" name="swiftCode" defaultValue={editing?.swiftCode ?? ""} />
              </Field>
              <Field label="Sort code" htmlFor="sortCode">
                <Input id="sortCode" name="sortCode" defaultValue={editing?.sortCode ?? ""} />
              </Field>
            </div>
            <Field label="Payment instructions" htmlFor="paymentInstructions" hint="Printed beneath the account details">
              <Textarea id="paymentInstructions" name="paymentInstructions" rows={3} defaultValue={editing?.paymentInstructions ?? ""} />
            </Field>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <Checkbox name="isDefault" defaultChecked={editing?.isDefault ?? banks.length === 0} />
              Default account for new documents
            </label>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <Checkbox name="isArchived" defaultChecked={editing?.isArchived ?? false} />
              Archived (hidden from new documents)
            </label>
            <Button variant="default" type="submit" className="w-full">
              Save account
            </Button>
            <p className="text-[11px] text-muted-foreground">
              Saving a default clears the previous default in the same transaction. Issued documents keep
              the details they were frozen with.
            </p>
          </form>
        </Card>
      </div>
    </div>
  );
}
