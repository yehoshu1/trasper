"use client";

import { useSyncExternalStore } from "react";
import { Check } from "lucide-react";

import { CustomThemeBuilder } from "@/components/custom-theme-builder";
import { usePalette } from "@/components/palette-provider";
import { PresetThemePreview } from "@/components/theme-preview";
import { COLOR_THEMES, CUSTOM_COLOR_THEME } from "@/lib/themes";
import { cn } from "@/lib/utils";

const subscribeToNothing = () => () => {};
const hydratedSnapshot = () => true;
const serverSnapshot = () => false;

/** Avoids marking a theme as selected until the stored choice is available. */
function useHydrated() {
  return useSyncExternalStore(subscribeToNothing, hydratedSnapshot, serverSnapshot);
}

export function ThemePicker() {
  const { palette, custom, setPalette } = usePalette();
  const hydrated = useHydrated();

  const activeId = hydrated ? palette : null;
  const activeTheme = COLOR_THEMES.find((theme) => theme.id === palette);
  const customActive = palette === CUSTOM_COLOR_THEME && custom !== null;
  const status = customActive ? custom.name : (activeTheme?.name ?? "Classic");

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {COLOR_THEMES.map((theme) => {
          const selected = activeId === theme.id;
          return (
            <button
              key={theme.id}
              type="button"
              onClick={() => setPalette(theme.id)}
              aria-pressed={selected}
              className={cn(
                "group flex flex-col rounded-lg border border-border bg-card p-2.5 text-left outline-none transition-colors hover:border-ring/60 focus-visible:ring-[3px] focus-visible:ring-ring/30",
                selected && "border-primary ring-2 ring-primary/25",
              )}
            >
              <PresetThemePreview theme={theme.id} />
              <span className="mt-3 flex items-start gap-2 px-0.5">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-foreground">{theme.name}</span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                    {theme.description}
                  </span>
                </span>
                <span
                  className={cn(
                    "mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border transition-colors",
                    selected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border text-transparent",
                  )}
                >
                  <Check className="h-3 w-3" />
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-muted-foreground" aria-live="polite">
        {hydrated
          ? `${status} is applied in this browser.`
          : "Themes apply instantly and are saved in this browser."}
      </p>

      {hydrated ? (
        <CustomThemeBuilder />
      ) : (
        <div aria-hidden className="mt-6 border-t border-border pt-5">
          <div className="h-5 w-28 rounded bg-muted" />
          <div className="mt-2 h-3 w-2/3 rounded bg-muted" />
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="h-9 rounded-md bg-muted" />
            <div className="h-9 rounded-md bg-muted" />
          </div>
        </div>
      )}
    </>
  );
}
