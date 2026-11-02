import { Button } from "@/components/ui/button";

import { Input } from "@/components/ui/input";

import { Alert, Card, Field, PageHeader } from "@/components/ui";
import { requireCapableUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { getSettings } from "@/server/settings";
import { renderNumber } from "@/server/numbering";
import { updateNumberingAction } from "@/server/actions/settings";

export const dynamic = "force-dynamic";

const KINDS = [
  { key: "quotation", field: "numberingQuotation", label: "Quotation", template: (settings: Awaited<ReturnType<typeof getSettings>>) => settings.numberingQuotation },
  { key: "itinerary", field: "numberingItinerary", label: "Itinerary", template: (settings: Awaited<ReturnType<typeof getSettings>>) => settings.numberingItinerary },
  { key: "proforma", field: "numberingProforma", label: "Pro forma", template: (settings: Awaited<ReturnType<typeof getSettings>>) => settings.numberingProforma },
] as const;

export default async function NumberingSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  await requireCapableUser("manageSettings");
  const query = await searchParams;
  const settings = await getSettings();
  const year = new Date().getUTCFullYear().toString();
  const sequences = await prisma.sequence.findMany();
  const now = new Date();

  return (
    <div className="max-w-4xl">
      <PageHeader
        eyebrow="Settings"
        title="Numbering"
        subtitle="Numbers come from a sequence inside the same transaction that writes the document. They are never reused, even after a cancellation."
      />

      {query.error ? <Alert tone="error">{query.error}</Alert> : null}
      {query.saved ? <Alert tone="success">Saved.</Alert> : null}

      <Card title="Number formats">
        <form action={updateNumberingAction} className="space-y-4">
          {KINDS.map((kind) => {
            const template = kind.template(settings) ?? "";
            const exampleBranch = "01";
            const keyParts: string[] = [kind.key];
            if (template.includes("{BRANCH}")) keyParts.push(exampleBranch);
            if (template.includes("{YYYY}") || template.includes("{YY}")) keyParts.push(year);
            const sequenceKey = keyParts.join(":");
            const sequence = sequences.find((entry) => entry.key === sequenceKey);
            const next = (sequence?.value ?? 0) + 1;
            const printsYear = template.includes("{YYYY}") || template.includes("{YY}");
            return (
              <div key={kind.key} className="grid gap-3 sm:grid-cols-2">
                <Field
                  label={`${kind.label} format`}
                  htmlFor={kind.field}
                  hint="Placeholders: {BRANCH}, {YYYY}, {YY}, {MM}, {DD}, {SEQ} or {SEQ:4}"
                >
                  <Input
                    id={kind.field}
                    name={kind.field} className="font-mono"
                    defaultValue={template}
                    required
                  />
                </Field>
                <div className="self-end rounded-lg bg-muted/40 px-3 py-2">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                    Next{printsYear ? ` in ${year}` : ""}
                    {template.includes("{BRANCH}") ? " for branch 01" : ""}
                  </p>
                  <p className="font-mono text-sm font-semibold text-foreground">
                    {renderNumber(template, next, now, "01")}
                  </p>
                </div>
              </div>
            );
          })}
          <Button variant="default" type="submit">
            Save formats
          </Button>
        </form>
        <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:text-amber-200 dark:bg-amber-500/10 dark:text-amber-300">
          Changing a format applies from the next number. Existing documents keep the number they
          were issued with.
        </p>
      </Card>

      <div className="mt-6">
        <Card title="Allocated sequences">
          {sequences.length === 0 ? (
            <p className="text-sm text-muted-foreground">No numbers allocated yet.</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {sequences.map((sequence) => (
                <li key={sequence.key} className="flex items-center justify-between py-1.5">
                  <span className="font-mono text-foreground">{sequence.key}</span>
                  <span className="tabular-nums text-muted-foreground">{sequence.value} allocated</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
