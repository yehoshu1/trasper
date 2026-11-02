"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  ArrowLeftRight,
  BadgeCheck,
  BarChart3,
  Building2,
  ChevronsUpDown,
  CircleDollarSign,
  Coins,
  FileClock,
  FileText,
  Hash,
  Landmark,
  LayoutDashboard,
  LayoutTemplate,
  LockKeyhole,
  LogOut,
  Luggage,
  Palette,
  PanelLeft,
  Percent,
  Plane,
  PlaneTakeoff,
  Plus,
  Receipt,
  ScrollText,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  UserCog,
  Users,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";

import type { SessionUser } from "@/server/auth";
import { signOutAction } from "@/server/actions/auth";
import { activeNavHref } from "@/lib/nav-active";
import { cn, initials } from "@/lib/utils";

export interface NavItem {
  href: string;
  label: string;
  badge?: number;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

const ICONS: Record<string, LucideIcon> = {
  "/dashboard": LayoutDashboard,
  "/search": Search,
  "/customers": Building2,
  "/passengers": Users,
  "/quotations": FileText,
  "/itineraries": Plane,
  "/proformas": Receipt,
  "/payments": Wallet,
  "/tools/pnr": ArrowLeftRight,
  "/reports": BarChart3,
  "/reports/aged-debtors": FileClock,
  "/settings/security": LockKeyhole,
  "/settings/company": Building2,
  "/settings/templates": LayoutTemplate,
  "/settings/banks": Landmark,
  "/settings/currencies": Coins,
  "/settings/tax": Percent,
  "/settings/numbering": Hash,
  "/settings/airlines": PlaneTakeoff,
  "/settings/users": UserCog,
  "/settings/audit": ScrollText,
  "/settings/branches": Landmark,
  "/settings/roles": ShieldCheck,
  "/settings/profile": UserCog,
  "/settings/themes": Palette,
  "/settings/ai": Sparkles,
};

function iconFor(href: string, group: string): LucideIcon {
  if (ICONS[href]) return ICONS[href];
  if (group === "Money") return CircleDollarSign;
  if (group === "Settings") return Settings2;
  if (group === "Sales") return Luggage;
  if (group === "Tools & reports") return ArrowLeftRight;
  return FileText;
}

interface SidebarContextValue {
  collapsed: boolean;
  toggleCollapsed: () => void;
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
}

const SidebarContext = createContext<SidebarContextValue | null>(null);

export function useSidebar(): SidebarContextValue {
  const context = useContext(SidebarContext);
  if (!context) throw new Error("useSidebar must be used inside SidebarProvider");
  return context;
}

export function SidebarProvider({
  children,
  defaultCollapsed = false,
}: {
  children: ReactNode;
  defaultCollapsed?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((current) => {
      const next = !current;
      document.cookie = `app-sidebar-collapsed=${next ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
      return next;
    });
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "b") {
        event.preventDefault();
        toggleCollapsed();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleCollapsed]);

  const value = useMemo(
    () => ({ collapsed, toggleCollapsed, mobileOpen, setMobileOpen }),
    [collapsed, mobileOpen, toggleCollapsed],
  );

  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>;
}

function BrandSwitcher({ user, company }: { user: SessionUser; company: { name: string; logo: string } }) {
  const { collapsed } = useSidebar();

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className={cn(
            "flex w-full items-center gap-2.5 rounded-md p-2 text-left outline-none transition-colors hover:bg-sidebar-accent data-[state=open]:bg-sidebar-accent",
            collapsed && "justify-center px-0",
          )}
        >
          {company.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={company.logo}
              alt=""
              className="h-8 w-8 shrink-0 rounded-lg bg-white object-contain p-1 ring-1 ring-black/5"
            />
          ) : (
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
              <Plane className="h-4 w-4" />
            </span>
          )}
          {collapsed ? null : (
            <>
              <span className="grid min-w-0 flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">{company.name}</span>
                <span className="truncate text-xs text-muted-foreground">
                  Quotations · Branch {user.branch}{user.branchName ? ` — ${user.branchName}` : ""}
                </span>
              </span>
              <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            </>
          )}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side="right"
          align="start"
          sideOffset={6}
          className="z-50 min-w-60 animate-fade-in rounded-lg border bg-popover p-1 text-popover-foreground shadow-pop"
        >
          <DropdownMenu.Label className="px-2 py-1.5 text-xs text-muted-foreground">
            Workspace
          </DropdownMenu.Label>
          <DropdownMenu.Item className="flex cursor-default items-center gap-2 rounded-md px-2 py-2 text-sm outline-none">
            <span className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-md border bg-white">
              {company.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={company.logo} alt="" className="h-full w-full object-contain p-0.5" />
              ) : (
                <Plane className="h-3.5 w-3.5" />
              )}
            </span>
            <span className="flex-1">{company.name}</span>
            <span className="text-xs text-muted-foreground">Branch {user.branch}{user.branchName ? ` — ${user.branchName}` : ""}</span>
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="-mx-1 my-1 h-px bg-border" />
          <DropdownMenu.Item asChild>
            <Link
              href="/settings/company"
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm outline-none transition-colors focus:bg-accent"
            >
              <Building2 className="h-4 w-4 text-muted-foreground" />
              Company profile
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item asChild>
            <Link
              href="/settings/numbering"
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm outline-none transition-colors focus:bg-accent"
            >
              <Hash className="h-4 w-4 text-muted-foreground" />
              Numbering
            </Link>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function SidebarNav({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname();
  const { collapsed } = useSidebar();
  const activeHref = activeNavHref(
    pathname,
    groups.flatMap((group) => group.items.map((item) => item.href)),
  );

  return (
    <nav aria-label="Main navigation" className="flex flex-col gap-1">
      {groups.map((group, index) => (
        <div key={group.label} className={cn(index > 0 && "pt-2")}>
          {collapsed ? (
            index > 0 ? <div className="mx-2 mb-2 h-px bg-sidebar-border" /> : null
          ) : (
            <p className="sidebar-group-label">{group.label}</p>
          )}
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const active = activeHref === item.href;
              const Icon = iconFor(item.href, group.label);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    title={collapsed ? item.label : undefined}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "sidebar-link",
                      active && "sidebar-link-active",
                      collapsed && "justify-center px-0",
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" strokeWidth={2} />
                    {collapsed ? (
                      <span className="sr-only">{item.label}</span>
                    ) : (
                      <>
                        <span className="flex-1 truncate">{item.label}</span>
                        {typeof item.badge === "number" && item.badge > 0 ? (
                          <span className="flex h-5 min-w-5 items-center justify-center rounded-md bg-sidebar-primary px-1 text-[11px] font-medium text-sidebar-primary-foreground">
                            {item.badge}
                          </span>
                        ) : null}
                      </>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function UserAvatar({ user, className }: { user: SessionUser; className?: string }) {
  if (user.image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={user.image}
        alt=""
        className={cn("h-8 w-8 shrink-0 rounded-lg bg-white object-cover ring-1 ring-black/5", className)}
      />
    );
  }
  return (
    <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-muted text-xs font-semibold", className)}>
      {initials(user.name)}
    </span>
  );
}

function UserMenu({ user }: { user: SessionUser }) {
  const { collapsed } = useSidebar();
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <>
      <form ref={formRef} action={signOutAction} className="hidden" aria-hidden />
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            className={cn(
              "flex w-full items-center gap-2.5 rounded-md p-2 text-left outline-none transition-colors hover:bg-sidebar-accent data-[state=open]:bg-sidebar-accent",
              collapsed && "justify-center px-0",
            )}
          >
            <UserAvatar user={user} />
            {collapsed ? null : (
              <>
                <span className="grid min-w-0 flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{user.name}</span>
                  <span className="truncate text-xs text-muted-foreground">{user.email}</span>
                </span>
                <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
              </>
            )}
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            side="right"
            align="end"
            sideOffset={6}
            className="z-50 min-w-60 animate-fade-in rounded-lg border bg-popover p-1 text-popover-foreground shadow-pop"
          >
            <DropdownMenu.Label className="px-2 py-2">
              <span className="flex items-center gap-2">
                <UserAvatar user={user} />
                <span className="grid text-sm leading-tight">
                  <span className="font-medium">{user.name}</span>
                  <span className="text-xs text-muted-foreground">{user.email}</span>
                </span>
              </span>
            </DropdownMenu.Label>
            <DropdownMenu.Separator className="-mx-1 my-1 h-px bg-border" />
            <DropdownMenu.Item className="flex cursor-default items-center gap-2 rounded-md px-2 py-2 text-sm outline-none">
              <BadgeCheck className="h-4 w-4 text-muted-foreground" />
              {user.roleName} · Branch {user.branch}{user.branchName ? ` — ${user.branchName}` : ""}
            </DropdownMenu.Item>
            <DropdownMenu.Item asChild>
              <Link
                href="/settings/profile"
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm outline-none transition-colors focus:bg-accent"
              >
                <UserCog className="h-4 w-4 text-muted-foreground" />
                My profile
              </Link>
            </DropdownMenu.Item>
            <DropdownMenu.Item asChild>
              <Link
                href="/settings/themes"
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm outline-none transition-colors focus:bg-accent"
              >
                <Palette className="h-4 w-4 text-muted-foreground" />
                Colour theme
              </Link>
            </DropdownMenu.Item>
            {user.capabilities.includes("manageUsers") ? (
              <DropdownMenu.Item asChild>
                <Link
                  href="/settings/users"
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm outline-none transition-colors focus:bg-accent"
                >
                  <Users className="h-4 w-4 text-muted-foreground" />
                  Team and access
                </Link>
              </DropdownMenu.Item>
            ) : null}
            <DropdownMenu.Separator className="-mx-1 my-1 h-px bg-border" />
            <DropdownMenu.Item
              onSelect={(event) => {
                event.preventDefault();
                formRef.current?.requestSubmit();
              }}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm outline-none transition-colors focus:bg-accent"
            >
              <LogOut className="h-4 w-4 text-muted-foreground" />
              Sign out
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </>
  );
}

function SidebarBody({
  user,
  groups,
  company,
  collapsed,
  onClose,
}: {
  user: SessionUser;
  groups: NavGroup[];
  company: { name: string; logo: string };
  collapsed: boolean;
  onClose?: () => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-16 shrink-0 items-center gap-1.5 border-b border-sidebar-border px-2">
        <div className="min-w-0 flex-1">
          <BrandSwitcher user={user} company={company} />
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            aria-label="Close navigation"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <div className={cn("min-h-0 flex-1 overflow-y-auto overflow-x-hidden py-2", collapsed ? "px-2" : "px-3")}>
        <SidebarNav groups={groups} />
      </div>

      <div className="border-t border-sidebar-border p-2">
        <UserMenu user={user} />
      </div>
    </div>
  );
}

export function AppSidebar({
  user,
  groups,
  company,
}: {
  user: SessionUser;
  groups: NavGroup[];
  company: { name: string; logo: string };
}) {
  const { collapsed, mobileOpen, setMobileOpen, toggleCollapsed } = useSidebar();
  const pathname = usePathname();

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname, setMobileOpen]);

  return (
    <>
      <aside
        className={cn(
          "sidebar-shell no-print group/sidebar hidden transition-[width] duration-200 md:flex",
          collapsed ? "w-12" : "w-64",
        )}
      >
        <SidebarBody user={user} groups={groups} company={company} collapsed={collapsed} />
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
          title={collapsed ? "Expand navigation (Ctrl+B)" : "Collapse navigation (Ctrl+B)"}
          className="absolute inset-y-0 -right-1 z-10 w-2 cursor-col-resize border-r-2 border-transparent transition-colors hover:border-sidebar-ring/60"
        />
      </aside>

      {mobileOpen ? (
        <div className="no-print fixed inset-0 z-50 flex md:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
          />
          <aside className="relative z-10 flex h-svh w-72 max-w-[85vw] border-r border-sidebar-border bg-sidebar text-sidebar-foreground shadow-pop">
            <SidebarBody
              user={user}
              groups={groups}
              company={company}
              collapsed={false}
              onClose={() => setMobileOpen(false)}
            />
          </aside>
        </div>
      ) : null}
    </>
  );
}

export function SidebarTrigger() {
  const { toggleCollapsed, setMobileOpen } = useSidebar();

  return (
    <button
      type="button"
      onClick={() => {
        if (window.matchMedia("(min-width: 768px)").matches) toggleCollapsed();
        else setMobileOpen(true);
      }}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      aria-label="Toggle navigation"
    >
      <PanelLeft className="h-4 w-4" />
    </button>
  );
}

export function NewQuotationButton({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/quotations/new" className="btn-primary">
      <Plus className="h-4 w-4" />
      {compact ? <span className="sm:hidden">New</span> : null}
      <span className={compact ? "hidden sm:inline" : undefined}>New quotation</span>
    </Link>
  );
}
