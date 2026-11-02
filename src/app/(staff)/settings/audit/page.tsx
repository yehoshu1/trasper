import { Button } from "@/components/ui/button";

import { DatePicker } from "@/components/ui/date-picker";

import { Alert, Card, EmptyState, PageHeader } from "@/components/ui";
import { SelectField } from "@/components/ui/select";
import { formatDate, formatDateTime } from "@/lib/dates";
import { hasCapability, redactAuditValue } from "@/lib/permissions";
import { parseAuditDiff } from "@/server/audit";
import { requireCapableUser } from "@/server/auth";
import { prisma } from "@/server/db";

export const dynamic = "force-dynamic";

export default async function AuditSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ user?: string; entity?: string; from?: string; to?: string }>;
}) {
  const user = await requireCapableUser("viewAudit");
  const params = await searchParams;
  const canSeeCosts = hasCapability(user, "viewCosts");
  const userId = params.user?.match(/^[A-Za-z0-9_-]{1,64}$/) ? params.user : "";
  const entity = params.entity?.match(/^[A-Za-z]{1,40}$/) ? params.entity : "";
  const from = params.from?.match(/^\d{4}-\d{2}-\d{2}$/) ? new Date(`${params.from}T00:00:00.000Z`) : null;
  const to = params.to?.match(/^\d{4}-\d{2}-\d{2}$/) ? new Date(`${params.to}T23:59:59.999Z`) : null;

  const [users, entities, entries] = await Promise.all([
    prisma.user.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.auditLog.findMany({ distinct: ["entity"], select: { entity: true }, orderBy: { entity: "asc" } }),
    prisma.auditLog.findMany({
      where: {
        ...(userId ? { userId } : {}),
        ...(entity ? { entity } : {}),
        ...(from || to
          ? {
              at: {
                ...(from ? { gte: from } : {}),
                ...(to ? { lte: to } : {}),
              },
            }
          : {}),
      },
      include: { user: { select: { name: true, email: true } } },
      orderBy: { at: "desc" },
      take: 200,
    }),
  ]);

  return (
    <div>
      <PageHeader
        eyebrow="Settings"
        title="Audit log"
        subtitle="Append-only record of every write. There is no action that edits or deletes an entry."
      />

      <form className="mb-4 flex flex-wrap items-end gap-2" method="get">
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          User
          <SelectField
            name="user"
            defaultValue={userId}
            className="mt-1 w-auto"
            placeholder="Everyone"
            options={[
              { value: "", label: "Everyone" },
              ...users.map((user) => ({ value: user.id, label: user.name })),
            ]}
          />
        </label>
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Entity
          <SelectField
            name="entity"
            defaultValue={entity}
            className="mt-1 w-auto"
            placeholder="All entities"
            options={[
              { value: "", label: "All entities" },
              ...entities.map((entry) => ({ value: entry.entity, label: entry.entity })),
            ]}
          />
        </label>
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          From
          <DatePicker name="from" defaultValue={params.from ?? ""} className="mt-1" />
        </label>
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          To
          <DatePicker name="to" defaultValue={params.to ?? ""} className="mt-1" />
        </label>
        <Button variant="secondary" type="submit">
          Filter
        </Button>
        {userId || entity || params.from || params.to ? (
          <a href="/settings/audit" className="btn-ghost">
            Clear
          </a>
        ) : null}
      </form>

      {entries.length === 0 ? (
        <EmptyState title="No audit entries match" />
      ) : (
        <div className="space-y-3">
          {entries.map((entry) => {
            const parsedDiff = parseAuditDiff(entry.diff);
            const diff = canSeeCosts ? parsedDiff : redactAuditValue(parsedDiff);
            return (
              <Card key={entry.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {entry.action} · {entry.entity} <span className="font-mono text-xs text-muted-foreground/70">{entry.entityId}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(entry.at)}
                      {entry.user ? ` · ${entry.user.name} (${entry.user.email})` : " · system"}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground/70">{formatDate(entry.at)}</span>
                </div>
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs font-semibold text-foreground">
                    Show changes
                  </summary>
                  <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-slate-950 p-3 text-[11px] leading-relaxed text-slate-100">
                    {JSON.stringify(diff, null, 2)}
                  </pre>
                </details>
              </Card>
            );
          })}
        </div>
      )}
      {entries.length >= 200 ? (
        <Alert tone="info">Showing the 200 most recent entries. Narrow the filter to see older ones.</Alert>
      ) : null}
    </div>
  );
}
