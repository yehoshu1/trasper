import type { ReactNode } from "react";
import Link from "next/link";

import { Label } from "@/components/ui/label";
import { formatMoney } from "@/lib/money";
import { cn, initials } from "@/lib/utils";

export function PageHeader({
  title,
  subtitle,
  actions,
  eyebrow,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  eyebrow?: string;
}) {
  return (
    <div className="no-print mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="mb-1 text-xs font-medium text-muted-foreground">{eyebrow}</p>
        ) : null}
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
        {subtitle ? (
          <p className="mt-1.5 max-w-3xl text-sm text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Card({
  title,
  subtitle,
  actions,
  children,
  className = "",
}: {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const hasHeader = Boolean(title || subtitle || actions);
  return (
    <section className={cn("card flex flex-col", className)}>
      {hasHeader ? (
        <header className="flex flex-wrap items-start justify-between gap-3 px-6 pb-4 pt-6">
          <div className="min-w-0 space-y-1">
            {title ? <h2 className="text-[15px] font-semibold leading-none tracking-tight">{title}</h2> : null}
            {subtitle ? <p className="text-[13px] text-muted-foreground">{subtitle}</p> : null}
          </div>
          {actions}
        </header>
      ) : null}
      <div className={cn("flex-1", hasHeader ? "px-6 pb-6" : "p-6")}>{children}</div>
    </section>
  );
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className = "",
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label htmlFor={htmlFor}>
        {label}
      </Label>
      {children}
      {hint ? <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p> : null}
      {error ? <p className="mt-1.5 text-xs font-medium text-destructive">{error}</p> : null}
    </div>
  );
}

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  accepted: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  declined: "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  expired: "bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
  superseded: "bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
  unpaid: "bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
  part_paid: "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  paid: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  cancelled: "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  supersededDoc: "bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  sent: "Sent",
  accepted: "Accepted",
  declined: "Declined",
  expired: "Expired",
  superseded: "Superseded",
  unpaid: "Unpaid",
  part_paid: "Part-paid",
  paid: "Paid",
  cancelled: "Cancelled",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn("badge", STATUS_STYLES[status] ?? "bg-muted text-muted-foreground")}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

export function Avatar({ name, className = "" }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-muted text-[13px] font-semibold text-foreground",
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed px-6 py-10 text-center">
      <p className="text-sm font-medium text-foreground">{title}</p>
      {children ? <div className="mt-1 text-[13px] text-muted-foreground">{children}</div> : null}
    </div>
  );
}

export function Alert({
  tone = "info",
  title,
  children,
}: {
  tone?: "info" | "warning" | "error" | "success";
  title?: string;
  children: ReactNode;
}) {
  const styles = {
    info: "border-border bg-muted/50 text-foreground",
    warning:
      "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200",
    error:
      "border-red-200 bg-red-50 text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200",
    success:
      "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200",
  }[tone];
  return (
    <div className={cn("no-print mb-4 rounded-lg border px-4 py-3 text-sm", styles)} role="status">
      {title ? <p className="font-medium">{title}</p> : null}
      <div>{children}</div>
    </div>
  );
}

export function Money({
  amountMinor,
  currency,
  className = "",
}: {
  amountMinor: bigint | string;
  currency: string;
  className?: string;
}) {
  return (
    <span className={cn("tabular-nums", className)}>
      {formatMoney(typeof amountMinor === "string" ? BigInt(amountMinor) : amountMinor, currency)}
    </span>
  );
}

export function StatCard({
  label,
  value,
  hint,
  href,
  delta,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  href?: string;
  delta?: string;
}) {
  const body = (
    <>
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className="mt-2 text-xl font-semibold tracking-tight text-foreground lg:text-2xl">{value}</p>
      <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
        {delta ? <span className="font-medium text-emerald-600 dark:text-emerald-400">{delta}</span> : null}
        {hint}
      </p>
    </>
  );
  return href ? (
    <Link
      href={href}
      className="card block p-6 transition-colors hover:border-ring/50"
    >
      {body}
    </Link>
  ) : (
    <div className="card p-6">{body}</div>
  );
}

export function ProgressBar({ value, className = "" }: { value: number; className?: string }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-muted", className)}>
      <div className="h-full rounded-full bg-primary" style={{ width: `${clamped}%` }} />
    </div>
  );
}
