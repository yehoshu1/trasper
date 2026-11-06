import { hasCapability, type Capability } from "@/lib/permissions";
import type { NavGroup } from "@/components/sidebar";

export function navGroupsFor(user: { role: string; capabilities?: readonly Capability[] }): NavGroup[] {
  const overview = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/search", label: "Search" },
    { href: "/docs", label: "Documentation" },
  ];

  const groups: NavGroup[] = [
    {
      label: "Overview",
      items: overview,
    },
  ];

  const sales = [];
  if (hasCapability(user, "viewDocuments")) {
    sales.push({ href: "/quotations", label: "Quotations" });
    sales.push({ href: "/itineraries", label: "Itineraries" });
    sales.push({ href: "/tickets", label: "Tickets" });
  }
  if (hasCapability(user, "viewCosts")) sales.push({ href: "/proformas", label: "Pro formas" });
  if (hasCapability(user, "viewContacts")) sales.push({ href: "/customers", label: "Customers" });
  if (hasCapability(user, "manageContacts")) sales.push({ href: "/passengers", label: "Passengers" });
  if (sales.length > 0) groups.push({ label: "Sales", items: sales });

  const tools = [{ href: "/tools/pnr", label: "PNR converter" }];
  if (hasCapability(user, "viewReports")) {
    tools.push({ href: "/reports", label: "Reports" });
    tools.push({ href: "/reports/aged-debtors", label: "Aged debtors" });
  }
  groups.push({ label: "Tools & reports", items: tools });

  if (hasCapability(user, "viewPaymentLedger")) {
    groups.push({ label: "Money", items: [{ href: "/payments", label: "Payments" }] });
  }

  // Themes is a personal appearance preference, available to every signed-in user.
  const settings = [
    { href: "/settings/themes", label: "Themes" },
    { href: "/settings/security", label: "Security" },
  ];
  if (hasCapability(user, "manageSettings")) {
    settings.push({ href: "/settings/ai", label: "AI" });
    settings.push({ href: "/settings/company", label: "Company" });
    settings.push({ href: "/settings/pricing", label: "Pricing presentation" });
    settings.push({ href: "/settings/templates", label: "Document templates" });
    settings.push({ href: "/settings/banks", label: "Bank accounts" });
    settings.push({ href: "/settings/currencies", label: "Currencies" });
    settings.push({ href: "/settings/tax", label: "VAT and taxes" });
    settings.push({ href: "/settings/numbering", label: "Numbering" });
    settings.push({ href: "/settings/airlines", label: "Airlines" });
    settings.push({ href: "/settings/branches", label: "Branches" });
  }
  if (hasCapability(user, "manageUsers")) {
    settings.push({ href: "/settings/users", label: "Users" });
    settings.push({ href: "/settings/roles", label: "Roles and permissions" });
  }
  if (hasCapability(user, "viewAudit")) settings.push({ href: "/settings/audit", label: "Audit log" });
  if (settings.length > 0) groups.push({ label: "Settings", items: settings });

  return groups;
}
