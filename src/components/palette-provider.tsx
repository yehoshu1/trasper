"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  COLOR_THEME_COOKIE,
  COLOR_THEME_STORAGE_KEY,
  CUSTOM_COLOR_THEME,
  CUSTOM_THEME_COOKIE,
  CUSTOM_THEME_STORAGE_KEY,
  CUSTOM_THEME_STYLE_ID,
  customThemeCookieValue,
  customThemeCss,
  DEFAULT_COLOR_THEME,
  isPresetColorTheme,
  parseCustomTheme,
  type ColorTheme,
  type CustomTheme,
  type PresetColorTheme,
} from "@/lib/themes";

interface PaletteState {
  palette: ColorTheme;
  custom: CustomTheme | null;
}

interface PaletteContextValue extends PaletteState {
  setPalette: (palette: PresetColorTheme) => void;
  saveCustomTheme: (theme: CustomTheme) => void;
}

const PaletteContext = createContext<PaletteContextValue | null>(null);

function readCustomTheme(): CustomTheme | null {
  try {
    const raw = window.localStorage.getItem(CUSTOM_THEME_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return parseCustomTheme(parsed);
  } catch {
    return null;
  }
}

function readPaletteState(): PaletteState {
  if (typeof window === "undefined") {
    return { palette: DEFAULT_COLOR_THEME, custom: null };
  }

  const custom = readCustomTheme();
  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem(COLOR_THEME_STORAGE_KEY);
  } catch {
    stored = null;
  }

  if (stored === CUSTOM_COLOR_THEME && custom) return { palette: CUSTOM_COLOR_THEME, custom };
  if (isPresetColorTheme(stored)) return { palette: stored, custom };
  return { palette: DEFAULT_COLOR_THEME, custom };
}

function applyPaletteState({ palette, custom }: PaletteState) {
  const existingStyle = document.getElementById(CUSTOM_THEME_STYLE_ID);

  if (palette === CUSTOM_COLOR_THEME && custom) {
    const style =
      existingStyle instanceof HTMLStyleElement
        ? existingStyle
        : document.createElement("style");
    style.id = CUSTOM_THEME_STYLE_ID;
    style.textContent = customThemeCss(custom);
    if (!style.isConnected) document.head.appendChild(style);
    document.documentElement.setAttribute("data-palette", CUSTOM_COLOR_THEME);
    return;
  }

  existingStyle?.remove();
  document.documentElement.setAttribute("data-palette", palette);
}

/**
 * Mirrors the browser preference into cookies so the server can render the
 * correct palette on the very first request. This is what prevents the
 * default theme from flashing before hydration.
 */
function syncPaletteCookies({ palette, custom }: PaletteState) {
  const maxAge = 60 * 60 * 24 * 365;
  const write = (name: string, value: string) => {
    document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; samesite=lax`;
  };
  write(COLOR_THEME_COOKIE, palette);
  if (palette === CUSTOM_COLOR_THEME && custom) {
    write(CUSTOM_THEME_COOKIE, customThemeCookieValue(custom));
  } else {
    document.cookie = `${CUSTOM_THEME_COOKIE}=; path=/; max-age=0; samesite=lax`;
  }
}

/**
 * Keeps the `data-palette` attribute on <html> in sync with the chosen colour
 * theme, and injects the generated stylesheet for a custom theme. The
 * pre-paint script in the root layout applies the same state before hydration.
 */
export function PaletteProvider({ children }: { children: ReactNode }) {
  // On the client this reads the stored palette straight away; the server
  // render uses the default, and pickers wait for hydration before marking a
  // choice as selected.
  const [state, setState] = useState<PaletteState>(readPaletteState);

  useEffect(() => {
    applyPaletteState(state);
    syncPaletteCookies(state);
  }, [state]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (
        event.key !== null &&
        event.key !== COLOR_THEME_STORAGE_KEY &&
        event.key !== CUSTOM_THEME_STORAGE_KEY
      ) {
        return;
      }
      setState(readPaletteState());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setPalette = useCallback((next: PresetColorTheme) => {
    setState((current) => ({ palette: next, custom: current.custom }));
    try {
      window.localStorage.setItem(COLOR_THEME_STORAGE_KEY, next);
    } catch {
      // The palette still applies for this visit when storage is unavailable.
    }
  }, []);

  const saveCustomTheme = useCallback((theme: CustomTheme) => {
    setState({ palette: CUSTOM_COLOR_THEME, custom: theme });
    try {
      window.localStorage.setItem(CUSTOM_THEME_STORAGE_KEY, JSON.stringify(theme));
      window.localStorage.setItem(COLOR_THEME_STORAGE_KEY, CUSTOM_COLOR_THEME);
    } catch {
      // The palette still applies for this visit when storage is unavailable.
    }
  }, []);

  const value = useMemo(
    () => ({ ...state, setPalette, saveCustomTheme }),
    [state, setPalette, saveCustomTheme],
  );

  return <PaletteContext.Provider value={value}>{children}</PaletteContext.Provider>;
}

export function usePalette(): PaletteContextValue {
  const context = useContext(PaletteContext);
  if (!context) throw new Error("usePalette must be used inside PaletteProvider");
  return context;
}
