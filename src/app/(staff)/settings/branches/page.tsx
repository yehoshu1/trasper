import { Button } from "@/components/ui/button";

import { Checkbox } from "@/components/ui/checkbox";

import { Input } from "@/components/ui/input";

import { Alert, Card, Field, PageHeader } from "@/components/ui";
import { requireCapableUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { saveBranchAction } from "@/server/actions/settings";

export const dynamic = "force-dynamic";

export default async function BranchesSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  await requireCapableUser("manageSettings");
  const query = await searchParams;
  const [branches, counts] = await Promise.all([
    prisma.branch.findMany({ orderBy: { code: "asc" } }),
    prisma.user.groupBy({ by: ["branch"], _count: { _all: true } }),
  ]);
  const countFor = (code: string) => counts.find((row) => row.branch === code)?._count._all ?? 0;

  return (
    <div className="max-w-4xl">
      <PageHeader
        eyebrow="Settings"
        title="Branches"
        subtitle="Branch codes appear in quotation numbers; names identify the office to staff and on documents."
      />
      {query.error ? <Alert tone="error">{query.error}</Alert> : null}
      {query.saved ? <Alert tone="success">Saved.</Alert> : null}

      <Card title={`Branches (${branches.length})`}>
        <ul className="divide-y divide-border">
          {branches.map((branch) => (
            <li key={branch.code} className="py-3">
              <form action={saveBranchAction} className="flex flex-wrap items-end gap-3">
                <Input type="hidden" name="code" value={branch.code} />
                <div>
                  <p className="font-mono text-sm font-semibold text-foreground">{branch.code}</p>
                  <p className="text-xs text-muted-foreground">{countFor(branch.code)} user(s)</p>
                </div>
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Name
                  <Input name="name" className="mt-1 min-w-[220px]" defaultValue={branch.name} required />
                </label>
                <label className="flex items-center gap-1.5 self-end pb-2 text-xs text-muted-foreground">
                  <Checkbox name="active" defaultChecked={branch.active} />
                  Active
                </label>
                <Button variant="secondary" type="submit" className="px-2 py-1 text-xs">Save</Button>
              </form>
            </li>
          ))}
        </ul>
      </Card>

      <div className="mt-6">
        <Card title="Add a branch">
          <form action={saveBranchAction} className="space-y-3">
            <Field label="Code" htmlFor="new-branch-code" hint="Two digits, e.g. 02">
              <Input id="new-branch-code" name="code" className="w-24" maxLength={2} pattern="\d{2}" required />
            </Field>
            <Field label="Name" htmlFor="new-branch-name">
              <Input id="new-branch-name" name="name" required placeholder="City office" />
            </Field>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <Checkbox name="active" defaultChecked />
              Active
            </label>
            <Button variant="default" type="submit">Add branch</Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
