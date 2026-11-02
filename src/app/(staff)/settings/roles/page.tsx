import { Button } from "@/components/ui/button";

import { Checkbox } from "@/components/ui/checkbox";

import { Input } from "@/components/ui/input";

import { Alert, Card, Field, PageHeader } from "@/components/ui";
import {
  CAPABILITIES,
  CAPABILITY_LABELS,
  parseCapabilities,
} from "@/lib/permissions";
import { requireCapableUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { saveRoleAction } from "@/server/actions/settings";

export const dynamic = "force-dynamic";

export default async function RolesSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  await requireCapableUser("manageUsers");
  const query = await searchParams;
  const [roles, counts] = await Promise.all([
    prisma.role.findMany({ orderBy: { key: "asc" } }),
    prisma.user.groupBy({ by: ["role"], _count: { _all: true } }),
  ]);
  const countFor = (key: string) => counts.find((row) => row.role === key)?._count._all ?? 0;

  return (
    <div className="max-w-5xl">
      <PageHeader
        eyebrow="Settings"
        title="Roles and permissions"
        subtitle="Custom roles are built from capabilities. Every check is enforced on the server; the Administrator role always keeps every permission."
      />
      {query.error ? <Alert tone="error">{query.error}</Alert> : null}
      {query.saved ? <Alert tone="success">Saved.</Alert> : null}

      <div className="space-y-4">
        {roles.map((role) => {
          const selected = parseCapabilities(role.capabilities);
          const isAdmin = role.key === "admin";
          return (
            <Card key={role.key} title={`${role.name} · ${role.key}`} subtitle={`${countFor(role.key)} user(s)`}>
              <form action={saveRoleAction} className="space-y-3">
                <Input type="hidden" name="key" value={role.key} />
                <div className="flex flex-wrap items-end gap-3">
                  <Field label="Name" htmlFor={`role-name-${role.key}`}>
                    <Input id={`role-name-${role.key}`} name="name" className="min-w-[220px]" defaultValue={role.name} required />
                  </Field>
                  <label className="flex items-center gap-1.5 self-end pb-2 text-xs text-muted-foreground">
                    <Checkbox name="active" defaultChecked={role.active} disabled={isAdmin} />
                    Active
                  </label>
                </div>
                <fieldset className="grid gap-2 sm:grid-cols-2">
                  <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Capabilities
                  </legend>
                  {CAPABILITIES.map((capability) => (
                    <label key={capability} className="flex items-start gap-2 text-sm text-foreground">
                      <Checkbox
                        name="capabilities"
                        value={capability}
                        defaultChecked={isAdmin || selected.includes(capability)}
                        disabled={isAdmin}
                        className="mt-0.5"
                      />
                      <span>{CAPABILITY_LABELS[capability]}</span>
                    </label>
                  ))}
                </fieldset>
                <Button variant="secondary" type="submit" className="px-2 py-1 text-xs">Save role</Button>
              </form>
            </Card>
          );
        })}
      </div>

      <div className="mt-6">
        <Card title="Add a custom role">
          <form action={saveRoleAction} className="space-y-3">
            <div className="flex flex-wrap gap-3">
              <Field label="Key" htmlFor="new-role-key" hint="Lowercase, e.g. sales_manager">
                <Input id="new-role-key" name="key" className="w-48" required pattern="[a-z][a-z0-9_-]{1,39}" />
              </Field>
              <Field label="Name" htmlFor="new-role-name">
                <Input id="new-role-name" name="name" className="min-w-[220px]" required />
              </Field>
              <label className="flex items-center gap-1.5 self-end pb-2 text-xs text-muted-foreground">
                <Checkbox name="active" defaultChecked />
                Active
              </label>
            </div>
            <fieldset className="grid gap-2 sm:grid-cols-2">
              <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Capabilities
              </legend>
              {CAPABILITIES.map((capability) => (
                <label key={capability} className="flex items-start gap-2 text-sm text-foreground">
                  <Checkbox name="capabilities" value={capability} className="mt-0.5" />
                  <span>{CAPABILITY_LABELS[capability]}</span>
                </label>
              ))}
            </fieldset>
            <Button variant="default" type="submit">Add role</Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
