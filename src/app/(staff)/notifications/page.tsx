import Link from "next/link";

import { Card, EmptyState, PageHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/dates";
import { requireUser } from "@/server/auth";
import { loadNotifications, type NotificationKind } from "@/server/notifications";

export const dynamic = "force-dynamic";

const LABELS: Record<NotificationKind, string> = {
  ticketing: "Ticketing deadline",
  expiring: "Expiring quotation",
  overdue: "Overdue pro forma",
  followUp: "Follow-up",
};

export default async function NotificationsPage() {
  const user = await requireUser();
  const notifications = await loadNotifications(user);

  return (
    <div className="max-w-4xl">
      <PageHeader
        eyebrow="Overview"
        title="Notifications"
        subtitle="Derived live from quotations, pro formas and follow-ups — nothing is stored twice."
      />
      {notifications.length === 0 ? (
        <EmptyState title="Nothing needs attention">Ticketing deadlines, expiring quotations, overdue pro formas and follow-ups will appear here.</EmptyState>
      ) : (
        <div className="space-y-3">
          {notifications.map((notification) => (
            <Card key={notification.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {LABELS[notification.kind]}
                  </p>
                  <Link href={notification.href} className="mt-1 block text-sm font-semibold text-foreground">
                    {notification.title}
                  </Link>
                  <p className="text-xs text-muted-foreground">{notification.detail}</p>
                </div>
                <div className="text-right">
                  <span
                    className={`badge ${
                      notification.tone === "error"
                        ? "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300"
                        : notification.tone === "warning"
                          ? "bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {formatDateTime(new Date(notification.at))}
                  </span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
