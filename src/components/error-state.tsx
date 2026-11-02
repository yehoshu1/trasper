import type { ReactNode } from "react";
import { Compass, TriangleAlert } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Shared branded 404 / runtime error panel.
 *
 * The error boundaries pass a retry button through `actions`; the not-found
 * pages pass ordinary links. `fullHeight` is for public pages that are not
 * already inside the staff shell.
 */
export function ErrorState({
  code,
  title,
  description,
  actions,
  reference,
  fullHeight = false,
  className,
}: {
  code: string;
  title: string;
  description: string;
  actions: ReactNode;
  reference?: string;
  fullHeight?: boolean;
  className?: string;
}) {
  const Icon = code === "404" ? Compass : TriangleAlert;

  return (
    <div
      className={cn(
        "mx-auto flex w-full max-w-lg flex-col justify-center",
        fullHeight ? "min-h-svh p-6" : "py-16",
        className,
      )}
    >
      <div className="card p-8 text-center sm:p-10">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <Icon className="h-6 w-6" aria-hidden />
        </span>
        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          {code}
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{description}</p>
        {reference ? (
          <p className="mt-3 text-xs text-muted-foreground">
            Reference: <span className="font-mono text-foreground">{reference}</span>
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">{actions}</div>
        <p className="mt-8 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          Trasper · staff travel workspace
        </p>
      </div>
    </div>
  );
}

/** Read Next's error digest without exposing an arbitrary thrown value. */
export function errorReference(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("digest" in error)) return undefined;
  const digest = (error as { digest?: unknown }).digest;
  return typeof digest === "string" && digest ? digest : undefined;
}
