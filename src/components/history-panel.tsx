import { Button } from "@/components/ui/button";

import { DateTimePicker, DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";

import { DateTime } from "luxon";

import { Card, EmptyState } from "@/components/ui";
import { SelectField } from "@/components/ui/select";
import { appTimeZone, formatDateTime, timeZoneLabel } from "@/lib/dates";
import { redactAuditValue } from "@/lib/permissions";
import { ACTIVITY_TYPES } from "@/lib/schemas";
import { parseAuditDiff } from "@/server/audit";
import { prisma } from "@/server/db";
import { createActivityAction } from "@/server/actions/activities";

const ACTIVITY_LABELS: Record<string, string> = {
  called: "Call",
  emailed: "Email",
  whatsapp: "WhatsApp",
  note: "Note",
  meeting: "Meeting",
};

type TimelineEntry = {
  id: string;
  at: Date;
  title: string;
  detail: string;
  body?: string;
  followUp?: Date | null;
  diff?: unknown;
  kind: "activity" | "audit";
};

export async function HistoryPanel({
  entity,
  entityId,
  quotationId,
  contactId,
  canAddActivity = false,
  canViewAudit = false,
  canSeeCosts = false,
}: {
  entity: "Quotation" | "Contact" | "Proforma" | "Passenger";
  entityId: string;
  quotationId?: string;
  contactId?: string;
  canAddActivity?: boolean;
  /** Audit rows are only queried for roles with the viewAudit capability. */
  canViewAudit?: boolean;
  /** Fail closed: callers must opt in before internal cost data is rendered. */
  canSeeCosts?: boolean;
}) {
  const [audits, activities] = await Promise.all([
    canViewAudit
      ? prisma.auditLog.findMany({
          where: { entity, entityId },
          include: { user: { select: { name: true } } },
          orderBy: { at: "desc" },
          take: 100,
        })
      : Promise.resolve([]),
    quotationId || contactId
      ? prisma.activity.findMany({
          where: {
            ...(quotationId ? { quotationId } : {}),
            ...(contactId && !quotationId ? { contactId } : {}),
          },
          include: { user: { select: { name: true } } },
          orderBy: { occurredAt: "desc" },
          take: 100,
        })
      : Promise.resolve([]),
  ]);

  const entries: TimelineEntry[] = [
    ...activities.map((activity) => ({
      id: `activity-${activity.id}`,
      at: activity.occurredAt,
      title: `${ACTIVITY_LABELS[activity.type] ?? activity.type} · ${activity.user.name}`,
      detail: formatDateTime(activity.occurredAt),
      body: activity.body,
      followUp: activity.nextFollowUpAt,
      kind: "activity" as const,
    })),
    ...audits.map((entry) => ({
      id: `audit-${entry.id}`,
      at: entry.at,
      title: `${entry.action} · ${entry.entity}`,
      detail: `${formatDateTime(entry.at)}${entry.user ? ` · ${entry.user.name}` : " · system"}`,
      diff: canSeeCosts ? parseAuditDiff(entry.diff) : redactAuditValue(parseAuditDiff(entry.diff)),
      kind: "audit" as const,
    })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  return (
    <Card
      title="History and activity"
      subtitle="Read-only audit trail plus calls, emails, WhatsApp messages, notes and meetings."
    >
      {canAddActivity && (quotationId || contactId) ? (
        <form action={createActivityAction} className="mb-5 grid gap-3 rounded-lg border border-border bg-muted/30 p-3 lg:grid-cols-[150px_1fr_auto]">
          {quotationId ? <Input type="hidden" name="quotationId" value={quotationId} /> : null}
          {contactId ? <Input type="hidden" name="contactId" value={contactId} /> : null}
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Type
            <SelectField
              name="type"
              className="mt-1"
              defaultValue="called"
              options={ACTIVITY_TYPES.map((type) => ({
                value: type,
                label: ACTIVITY_LABELS[type] ?? type,
              }))}
            />
          </label>
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            What happened
            <Input name="body" className="mt-1" required minLength={2} maxLength={4000} placeholder="Spoke to the customer; they will confirm by Friday" />
          </label>
          <div className="grid gap-2 sm:grid-cols-2 lg:col-span-3 lg:grid-cols-[180px_180px_auto]">
            <label className="min-w-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Occurred ({timeZoneLabel()})
              <DateTimePicker
                name="occurredAt" className="mt-1"
                required
                defaultValue={DateTime.now().setZone(appTimeZone()).toFormat("yyyy-LL-dd'T'HH:mm")}
              />
            </label>
            <label className="min-w-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Next follow-up
              <DatePicker name="nextFollowUpAt" className="mt-1" />
            </label>
            <Button variant="default" type="submit" className="self-end">
              Add to timeline
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground lg:col-span-3">
            Recorded against the signed-in user and written to the audit trail.
          </p>
        </form>
      ) : null}

      {entries.length === 0 ? (
        <EmptyState title="No history yet" />
      ) : (
        <ol className="relative ml-2 space-y-4 border-l border-border pl-5">
          {entries.map((entry) => (
            <li key={entry.id} className="relative">
              <span
                aria-hidden
                className={`absolute -left-[27px] top-1 h-3 w-3 rounded-full border-2 border-background ${
                  entry.kind === "activity" ? "bg-emerald-500" : "bg-slate-400"
                }`}
              />
              <p className="text-sm font-semibold text-foreground">{entry.title}</p>
              <p className="text-xs text-muted-foreground">{entry.detail}</p>
              {entry.body ? <p className="mt-1 whitespace-pre-line text-sm text-foreground">{entry.body}</p> : null}
              {entry.followUp ? (
                <p className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-300">
                  Follow up on {formatDateTime(entry.followUp)}
                </p>
              ) : null}
              {entry.diff ? (
                <details className="mt-1">
                  <summary className="cursor-pointer text-xs font-semibold text-muted-foreground">
                    Show changes
                  </summary>
                  <pre className="mt-1 max-h-56 overflow-auto rounded-lg bg-slate-950 p-2 text-[11px] leading-relaxed text-slate-100">
                    {JSON.stringify(entry.diff, null, 2)}
                  </pre>
                </details>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
