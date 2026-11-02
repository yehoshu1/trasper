import { cookies, headers } from "next/headers";

import { AppShell } from "@/components/shell";
import { requireUser } from "@/server/auth";
import { navGroupsFor } from "@/server/nav";
import { loadNotifications } from "@/server/notifications";
import { getSettings } from "@/server/settings";

export const dynamic = "force-dynamic";

/**
 * A request carrying `x-render-bare: 1` gets the page without the staff shell.
 * The PDF route uses it to obtain print-ready HTML of the very same document
 * templates, so the PDF and the on-screen preview cannot diverge.
 */
export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const requestHeaders = await headers();
  if (requestHeaders.get("x-render-bare") === "1") return <>{children}</>;
  const cookieStore = await cookies();
  const defaultCollapsed = cookieStore.get("app-sidebar-collapsed")?.value === "1";
  const settings = await getSettings();
  const notifications = await loadNotifications(user);
  const company = {
    name: settings.companyName,
    logo: settings.companyHeaderImage || settings.companyLetterheadImage,
    timeZone: settings.timeZone,
  };
  return (
    <AppShell
      user={user}
      groups={navGroupsFor(user)}
      defaultCollapsed={defaultCollapsed}
      company={company}
      counts={{ notifications: notifications.length }}
    >
      {children}
    </AppShell>
  );
}
