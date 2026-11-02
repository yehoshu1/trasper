"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Home } from "lucide-react";

const LABELS: Record<string, string> = {
  "": "Dashboard",
  dashboard: "Dashboard",
  search: "Search",
  contacts: "Customers",
  passengers: "Passengers",
  quotations: "Quotations",
  itineraries: "Itineraries",
  proformas: "Pro formas",
  payments: "Payments",
  settings: "Settings",
  company: "Company",
  banks: "Bank accounts",
  currencies: "Currencies",
  tax: "VAT and taxes",
  numbering: "Numbering",
  airlines: "Airlines",
  users: "Users",
  audit: "Audit log",
  new: "New",
  edit: "Edit",
  import: "Import",
  branches: "Branches",
  roles: "Roles and permissions",
  profile: "My profile",
  themes: "Themes",
  ai: "AI settings",
  tools: "Tools",
  pnr: "PNR converter",
  reports: "Reports",
  "aged-debtors": "Aged debtors",
};

function isId(segment: string) {
  return (
    /^c[a-z0-9]{16,}$/.test(segment) ||
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment) ||
    /^\d+$/.test(segment)
  );
}

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function Breadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter((segment) => segment.length > 0);

  const crumbs = segments.map((segment, index) => {
    const href = `/${segments.slice(0, index + 1).join("/")}`;
    const label = isId(segment) ? "Details" : (LABELS[segment] ?? titleCase(segment.replace(/-/g, " ")));
    return { href, label };
  });

  const onDashboard = pathname === "/dashboard";

  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex items-center gap-1.5 text-sm">
        <li>
          <Link
            href="/dashboard"
            className="flex items-center text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Dashboard"
            aria-current={onDashboard ? "page" : undefined}
          >
            <Home className="h-3.5 w-3.5" />
          </Link>
        </li>
        {(onDashboard ? [] : crumbs).map((crumb, index) => {
          const last = index === crumbs.length - 1;
          return (
            <li key={crumb.href} className="flex min-w-0 items-center gap-1.5">
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
              {last ? (
                <span className="truncate font-medium text-foreground" aria-current="page">
                  {crumb.label}
                </span>
              ) : (
                <Link
                  href={crumb.href}
                  className="truncate text-muted-foreground transition-colors hover:text-foreground"
                >
                  {crumb.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
