import type { CSSProperties } from "react";

import {
  themeTokensToCssProperties,
  type PresetColorTheme,
  type ThemeTokens,
} from "@/lib/themes";

/** A miniature of the app, rendered with whichever theme tokens are in scope. */
function ThemeMock({ style }: { style?: CSSProperties }) {
  return (
    <div
      aria-hidden
      style={style}
      className="overflow-hidden rounded-md border border-border bg-background p-2.5"
    >
      <div className="flex gap-2">
        <div className="w-10 shrink-0 rounded border border-sidebar-border bg-sidebar p-1">
          <div className="flex items-center gap-1">
            <span className="h-2 w-2 shrink-0 rounded-[3px] bg-sidebar-primary" />
            <span className="h-1 min-w-0 flex-1 rounded bg-sidebar-foreground/30" />
          </div>
          <div className="mt-2 space-y-1">
            <span className="block h-1 rounded bg-sidebar-accent" />
            <span className="block h-1 rounded bg-sidebar-foreground/10" />
            <span className="block h-1 rounded bg-sidebar-foreground/10" />
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="h-1.5 w-10 rounded-full bg-foreground/70" />
            <span className="h-3.5 w-12 rounded bg-primary" />
          </div>
          <div className="mt-1.5 rounded border bg-card p-1.5">
            <span className="block h-1 w-2/3 rounded bg-muted-foreground/30" />
            <span className="mt-1 block h-1 w-full rounded bg-muted" />
            <span className="mt-1 block h-1 w-4/5 rounded bg-muted" />
            <span className="theme-row-hover mt-1 block h-1.5 w-full rounded" />
          </div>
          <div className="mt-1.5 flex items-center gap-1">
            <span className="h-3.5 w-10 rounded bg-accent" />
            <span className="h-3.5 w-5 rounded border border-border bg-card" />
            <span className="ml-auto h-3.5 w-3.5 rounded-full bg-primary ring-2 ring-ring/30" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function PresetThemePreview({ theme }: { theme: PresetColorTheme }) {
  return (
    <div data-palette={theme}>
      <ThemeMock />
    </div>
  );
}

export function CustomThemePreview({ tokens }: { tokens: ThemeTokens }) {
  return <ThemeMock style={themeTokensToCssProperties(tokens) as CSSProperties} />;
}

export { ThemeMock };
