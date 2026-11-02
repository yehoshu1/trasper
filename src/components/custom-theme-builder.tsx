"use client";

import { Button } from "@/components/ui/button";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { useMemo, useState, type FormEvent } from "react";
import { Palette, RotateCcw } from "lucide-react";
import { useTheme } from "next-themes";

import { usePalette } from "@/components/palette-provider";
import { CustomThemePreview } from "@/components/theme-preview";
import {
  buildCustomTheme,
  CUSTOM_COLOR_THEME,
  DEFAULT_CUSTOM_THEME_INPUT,
  isHexColour,
} from "@/lib/themes";
import { cn } from "@/lib/utils";

function ColourField({
  id,
  label,
  hint,
  value,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const valid = isHexColour(value);

  return (
    <div>
      <Label htmlFor={`${id}-hex`}>
        {label}
      </Label>
      <div className="flex gap-2">
        <Input
          type="color"
          aria-label={`${label} picker`}
          className="h-9 w-11 shrink-0 cursor-pointer rounded-md border border-input bg-transparent p-1"
          value={valid ? value : DEFAULT_CUSTOM_THEME_INPUT.primary}
          onChange={(event) => onChange(event.target.value)}
        />
        <Input
          id={`${id}-hex`}
          className={cn(
            "font-mono uppercase",
            !valid && "border-red-500 focus-visible:border-red-500",
          )}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          maxLength={7}
          spellCheck={false}
          aria-invalid={!valid}
        />
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

export function CustomThemeBuilder() {
  const { palette, custom, saveCustomTheme } = usePalette();
  const { resolvedTheme } = useTheme();

  const [name, setName] = useState(custom?.name ?? DEFAULT_CUSTOM_THEME_INPUT.name);
  const [primary, setPrimary] = useState(custom?.primary ?? DEFAULT_CUSTOM_THEME_INPUT.primary);
  const [highlight, setHighlight] = useState(
    custom?.highlight ?? DEFAULT_CUSTOM_THEME_INPUT.highlight,
  );
  const [error, setError] = useState<string | null>(null);

  const valid = isHexColour(primary) && isHexColour(highlight);
  const draft = useMemo(
    () => (valid ? buildCustomTheme({ name, primary, highlight }) : null),
    [valid, name, primary, highlight],
  );
  const active = palette === CUSTOM_COLOR_THEME && custom !== null;
  const previewTokens = draft ? (resolvedTheme === "dark" ? draft.dark : draft.light) : null;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) {
      setError("Enter both colours as six-digit hex values, for example #1E3A8A.");
      return;
    }
    setError(null);
    saveCustomTheme(draft);
  }

  function useLogoColours() {
    setPrimary(DEFAULT_CUSTOM_THEME_INPUT.primary);
    setHighlight(DEFAULT_CUSTOM_THEME_INPUT.highlight);
    setError(null);
  }

  return (
    <div className="mt-6 border-t border-border pt-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Palette className="h-4 w-4 text-muted-foreground" />
            Build your own
          </h3>
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
            Choose two colours. The page and sidebar tints, table hover wash, readable text and
            dark-mode shades are generated for you.
          </p>
        </div>
        {active ? (
          <span className="pill-active">In use</span>
        ) : custom ? (
          <span className="pill-muted">Saved</span>
        ) : null}
      </div>

      <form onSubmit={onSubmit} className="mt-4 grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <ColourField
            id="custom-primary"
            label="Primary colour"
            hint="Buttons, active navigation, links and the page tint."
            value={primary}
            onChange={setPrimary}
          />
          <ColourField
            id="custom-highlight"
            label="Highlight colour"
            hint="Focus rings and the warm accent around controls."
            value={highlight}
            onChange={setHighlight}
          />
        </div>

        <div>
          <Label htmlFor="custom-theme-name">
            Theme name
          </Label>
          <Input
            id="custom-theme-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={40}
            placeholder="My theme"
            required
          />
        </div>

        <div>
          <Label>Preview</Label>
          {previewTokens ? (
            <CustomThemePreview tokens={previewTokens} />
          ) : (
            <div className="rounded-md border border-dashed px-4 py-8 text-center text-xs text-muted-foreground">
              Enter two hex colours to preview your theme.
            </div>
          )}
        </div>

        {error ? <p className="text-xs font-medium text-destructive">{error}</p> : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="default" type="submit">
            {active ? "Update my theme" : "Apply my theme"}
          </Button>
          <Button variant="secondary" type="button" onClick={useLogoColours}>
            <RotateCcw className="h-4 w-4" />
            Use logo colours
          </Button>
        </div>
      </form>
    </div>
  );
}
