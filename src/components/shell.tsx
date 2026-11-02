import type { ReactNode } from "react";
import Link from "next/link";
import { Bell, Plus } from "lucide-react";

import type { SessionUser } from "@/server/auth";
import { timeZoneLabel } from "@/lib/dates";
import { hasCapability } from "@/lib/permissions";
import { AppSidebar, NewQuotationButton, SidebarProvider, SidebarTrigger } from "@/components/sidebar";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { CommandPalette } from "@/components/command-palette";
import { ThemeToggle } from "@/components/theme-toggle";
import type { NavGroup } from "@/components/sidebar";

interface ShellCounts {
  quotationsAwaiting?: number;
  proformasOpen?: number;
  notifications?: number;
}

export function AppShell({
  user,
  groups,
  children,
  counts = {},
  defaultCollapsed = false,
  company,
}: {
  user: SessionUser;
  groups: NavGroup[];
  children: ReactNode;
  counts?: ShellCounts;
  defaultCollapsed?: boolean;
  company: { name: string; logo: string; timeZone: string };
}) {
  const canCreate = hasCapability(user, "manageQuotations");

  return (
    <SidebarProvider defaultCollapsed={defaultCollapsed}>
      <div className="flex min-h-svh w-full bg-background">
        <AppSidebar user={user} groups={groups} company={company} />

        <div className="flex min-h-svh min-w-0 flex-1 flex-col">
          <header className="no-print sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur-md supports-[backdrop-filter]:bg-background/60 md:px-6">
            <SidebarTrigger />
            <span aria-hidden className="mr-1 h-4 w-px bg-border" />
            <Breadcrumbs />
            <div className="ml-auto flex items-center gap-1.5">
              <Link
                href="/notifications"
                aria-label="Notifications"
                className="relative inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <Bell className="h-4 w-4" />
                {counts.notifications ? (
                  <span className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-4 text-white">
                    {counts.notifications > 99 ? "99+" : counts.notifications}
                  </span>
                ) : null}
              </Link>
              <CommandPalette capabilities={user.capabilities} groups={groups} />
              <ThemeToggle />
              {canCreate ? (
                <>
                  <Link
                    href="/quotations/new"
                    aria-label="New quotation"
                    className="ml-0.5 inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground sm:hidden"
                  >
                    <Plus className="h-4 w-4" />
                  </Link>
                  <div className="ml-1.5 hidden sm:block">
                    <NewQuotationButton />
                  </div>
                </>
              ) : null}
            </div>
          </header>

          <main className="mx-auto flex w-full max-w-[1440px] flex-1 flex-col p-4 md:p-6">
            {children}
          </main>

          <footer className="no-print border-t px-4 py-3 md:px-6">
            <p className="text-xs text-muted-foreground">
              {company.name} quotation system · Trasper · {timeZoneLabel(company.timeZone)} ·{" "}
              {counts.quotationsAwaiting
                ? `${counts.quotationsAwaiting} quotations awaiting a reply`
                : "staff only"}
            </p>
          </footer>
        </div>
      </div>
    </SidebarProvider>
  );
}
