"use client";

import { useTheme } from "next-themes";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, Monitor, Moon, Sun } from "lucide-react";

import { cn } from "@/lib/utils";

const OPTIONS = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const current = theme ?? "system";

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label="Choose colour theme"
          className="relative inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-50 min-w-40 animate-fade-in rounded-lg border bg-popover p-1 text-popover-foreground shadow-pop"
        >
          <DropdownMenu.Label className="px-2 py-1.5 text-xs text-muted-foreground">
            Appearance
          </DropdownMenu.Label>
          {OPTIONS.map((option) => {
            const OptionIcon = option.icon;
            const selected = current === option.value;
            return (
              <DropdownMenu.Item
                key={option.value}
                onSelect={() => setTheme(option.value)}
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm outline-none transition-colors focus:bg-accent",
                  selected && "bg-accent/70",
                )}
              >
                <OptionIcon className="h-4 w-4 text-muted-foreground" />
                <span className="flex-1">{option.label}</span>
                {selected ? <Check className="h-4 w-4" /> : null}
              </DropdownMenu.Item>
            );
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
