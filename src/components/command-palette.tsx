"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import {
  ArrowUpRight,
  Building2,
  FilePlus2,
  FileText,
  Loader2,
  Plane,
  Receipt,
  Search,
  UserPlus,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import type { Capability } from "@/lib/permissions";
import type { GlobalSearchResults } from "@/lib/search";
import { EMPTY_SEARCH_RESULTS } from "@/lib/search";
import type { NavGroup } from "@/components/sidebar";

interface CommandPaletteProps {
  capabilities: Capability[];
  groups: NavGroup[];
}

const GROUP_CLASS =
  "[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-muted-foreground";

interface ResultItem {
  id: string;
  label: string;
  hint: string;
  href: string;
  icon: LucideIcon;
}

function hrefFor(type: string, id: string): string {
  if (type === "quotation") return `/quotations/${id}`;
  if (type === "itinerary") return `/itineraries/${id}`;
  if (type === "proforma") return `/proformas/${id}`;
  if (type === "customer") return `/customers/${id}`;
  return `/passengers/${id}`;
}

function buildSearchItems(results: GlobalSearchResults): { group: string; items: ResultItem[] }[] {
  const groups: { group: string; items: ResultItem[] }[] = [];
  if (results.quotations.length > 0) {
    groups.push({
      group: "Quotations",
      items: results.quotations.map((quotation) => ({
        id: `quotation-${quotation.id}`,
        label: quotation.number,
        hint: quotation.customerName,
        href: hrefFor("quotation", quotation.id),
        icon: FileText,
      })),
    });
  }
  if (results.itineraries.length > 0) {
    groups.push({
      group: "Itineraries",
      items: results.itineraries.map((itinerary) => ({
        id: `itinerary-${itinerary.id}`,
        label: itinerary.number,
        hint: itinerary.customerName,
        href: hrefFor("itinerary", itinerary.id),
        icon: Plane,
      })),
    });
  }
  if (results.proformas.length > 0) {
    groups.push({
      group: "Pro formas",
      items: results.proformas.map((proforma) => ({
        id: `proforma-${proforma.id}`,
        label: proforma.number,
        hint: proforma.customerName,
        href: hrefFor("proforma", proforma.id),
        icon: Receipt,
      })),
    });
  }
  if (results.customers.length > 0) {
    groups.push({
      group: "Customers",
      items: results.customers.map((customer) => ({
        id: `customer-${customer.id}`,
        label: customer.name,
        hint: [customer.email, customer.city].filter(Boolean).join(" · "),
        href: hrefFor("customer", customer.id),
        icon: Building2,
      })),
    });
  }
  if (results.passengers.length > 0) {
    groups.push({
      group: "Passengers",
      items: results.passengers.map((passenger) => ({
        id: `passenger-${passenger.id}`,
        label: `${passenger.firstName} ${passenger.lastName}`,
        hint: passenger.type,
        href: hrefFor("passenger", passenger.id),
        icon: Users,
      })),
    });
  }
  return groups;
}

export function CommandPalette({ capabilities, groups }: CommandPaletteProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GlobalSearchResults>(EMPTY_SEARCH_RESULTS);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const requestSequence = useRef(0);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((current) => !current);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!open) return;
    const trimmed = query.trim();
    const sequence = ++requestSequence.current;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      if (trimmed.length < 2) {
        if (sequence === requestSequence.current) {
          setResults(EMPTY_SEARCH_RESULTS);
          setLoading(false);
          setFailed(false);
        }
        return;
      }

      setLoading(true);
      setFailed(false);
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!response.ok) throw new Error("Search failed");
        const body = (await response.json()) as GlobalSearchResults;
        if (sequence === requestSequence.current) setResults(body);
      } catch (error) {
        if ((error as Error).name !== "AbortError" && sequence === requestSequence.current) {
          setFailed(true);
          setResults(EMPTY_SEARCH_RESULTS);
        }
      } finally {
        if (sequence === requestSequence.current) setLoading(false);
      }
    }, trimmed.length < 2 ? 0 : 180);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, query]);

  const searchGroups = useMemo(() => buildSearchItems(results), [results]);

  const quickActions = useMemo(() => {
    const actions: ResultItem[] = [];
    if (capabilities.includes("manageQuotations")) {
      actions.push({
        id: "new-quotation",
        label: "New quotation",
        hint: "Choose a customer and dates",
        href: "/quotations/new",
        icon: FilePlus2,
      });
    }
    if (capabilities.includes("manageContacts")) {
      actions.push(
        {
          id: "new-customer",
          label: "New customer",
          hint: "Add a paying customer",
          href: "/customers/new",
          icon: UserPlus,
        },
        {
          id: "new-passenger",
          label: "Add a passenger",
          hint: "Create or edit a traveller",
          href: "/passengers",
          icon: Users,
        },
      );
    }
    if (capabilities.includes("viewPaymentLedger")) {
      actions.push({
        id: "payments",
        label: "Payment ledger",
        hint: "Receipts and reversals",
        href: "/payments",
        icon: Wallet,
      });
    }
    return actions;
  }, [capabilities]);

  const pageItems = useMemo(
    () =>
      groups.flatMap((group) =>
        group.items.map((item) => ({
          ...item,
          group: group.label,
        })),
      ),
    [groups],
  );

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  const trimmedQuery = query.trim();
  const hasQuery = trimmedQuery.length >= 2;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search"
        className="inline-flex h-8 items-center gap-2 rounded-md px-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        <Search className="h-4 w-4" />
        <span className="hidden lg:inline">Search</span>
        <kbd className="hidden rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground lg:inline">
          Ctrl K
        </kbd>
      </button>

      <Command.Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setQuery("");
        }}
        label="Search customers, documents and pages"
        shouldFilter={false}
        overlayClassName="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px]"
        contentClassName="fixed left-1/2 top-[12vh] z-50 w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-pop"
        className="flex max-h-[70vh] flex-col"
      >
        <div className="flex items-center gap-2 border-b px-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <Command.Input
            value={query}
            onValueChange={setQuery}
            placeholder="Search customers, quotations, PNRs or pages…"
            className="h-11 w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
          {loading ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" /> : null}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
          >
            Esc
          </button>
        </div>

        <Command.List className="min-h-0 flex-1 overflow-y-auto p-2">
          {!hasQuery ? (
            <>
              {quickActions.length > 0 ? (
                <Command.Group heading="Quick actions" className={GROUP_CLASS}>
                  {quickActions.map((action) => (
                    <PaletteItem key={action.id} item={action} onSelect={go} />
                  ))}
                </Command.Group>
              ) : null}
              {pageItems.length > 0 ? (
                <Command.Group heading="Go to" className={GROUP_CLASS}>
                  {pageItems.map((item) => (
                    <PaletteItem
                      key={item.href}
                      item={{
                        id: item.href,
                        label: item.label,
                        hint: item.group,
                        href: item.href,
                        icon: FileText,
                      }}
                      onSelect={go}
                    />
                  ))}
                </Command.Group>
              ) : null}
            </>
          ) : (
            <>
              {failed ? (
                <p className="px-3 py-6 text-center text-sm text-destructive">
                  Search is unavailable. Try again or open the full search page.
                </p>
              ) : null}
              {searchGroups.map((group) => (
                <Command.Group key={group.group} heading={group.group} className={GROUP_CLASS}>
                  {group.items.map((item) => (
                    <PaletteItem key={item.id} item={item} onSelect={go} />
                  ))}
                </Command.Group>
              ))}
              {!loading && !failed && results.total === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                  Nothing found for “{trimmedQuery}”. Try a document number, customer name or PNR.
                </p>
              ) : null}
              <Command.Group heading="Search" className={GROUP_CLASS}>
                <Command.Item
                  value={`full-search-${trimmedQuery}`}
                  onSelect={() => go(`/search?q=${encodeURIComponent(trimmedQuery)}`)}
                  className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm outline-none aria-selected:bg-accent aria-selected:text-accent-foreground"
                >
                  <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="flex-1">Open full search results</span>
                  <span className="text-xs text-muted-foreground">{trimmedQuery}</span>
                </Command.Item>
              </Command.Group>
            </>
          )}
        </Command.List>

        <div className="flex items-center justify-between border-t px-3 py-2 text-[11px] text-muted-foreground">
          <span>
            <kbd className="rounded border border-border bg-muted px-1 py-0.5">↑</kbd>{" "}
            <kbd className="rounded border border-border bg-muted px-1 py-0.5">↓</kbd> to navigate ·{" "}
            <kbd className="rounded border border-border bg-muted px-1 py-0.5">Enter</kbd> to open
          </span>
          <span className="hidden sm:inline">VAT is inside the lump sum; costs stay internal.</span>
        </div>
      </Command.Dialog>
    </>
  );
}

function PaletteItem({
  item,
  onSelect,
}: {
  item: ResultItem;
  onSelect: (href: string) => void;
}) {
  const Icon = item.icon;
  return (
    <Command.Item
      value={`${item.id} ${item.label} ${item.hint}`}
      onSelect={() => onSelect(item.href)}
      className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm outline-none aria-selected:bg-accent aria-selected:text-accent-foreground"
    >
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md border bg-card">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{item.label}</span>
        {item.hint ? <span className="block truncate text-xs text-muted-foreground">{item.hint}</span> : null}
      </span>
      <ArrowUpRight className="hidden h-3.5 w-3.5 text-muted-foreground sm:block" />
    </Command.Item>
  );
}
