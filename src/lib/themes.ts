/**
 * Colour themes for the staff application.
 *
 * A palette is a per-browser appearance preference, independent of the
 * light/dark switch in the top bar. Every theme keeps the existing layout and
 * surfaces; only the accent tokens, the page background tint and the table
 * hover wash change. The presets use a deep blue (#1e3a8a) and orange
 * (#f15f2c) as their default accents; each is a self-contained palette.
 */
export const COLOR_THEME_IDS = [
  "classic",
  "royal",
  "sunset",
  "sky",
  "midnight",
  "ember",
  "emerald",
  "coral",
  "gold",
  "violet",
  "rose",
] as const;

export type PresetColorTheme = (typeof COLOR_THEME_IDS)[number];

export const CUSTOM_COLOR_THEME = "custom";
export type ColorTheme = PresetColorTheme | typeof CUSTOM_COLOR_THEME;

export interface ColorThemeOption {
  id: PresetColorTheme;
  name: string;
  description: string;
}

export const DEFAULT_COLOR_THEME: PresetColorTheme = "classic";

/** localStorage keys; also used by the pre-paint script in the root layout. */
export const COLOR_THEME_STORAGE_KEY = "app-palette";
export const CUSTOM_THEME_STORAGE_KEY = "app-custom-theme";
export const CUSTOM_THEME_STYLE_ID = "app-custom-theme-style";

/**
 * Cookie mirrors of the browser preference. The root layout reads these on
 * the server so the first HTML already carries the chosen palette. Without
 * them the server always renders "classic" and hydration can briefly reset
 * the attribute before the client effect re-applies the saved theme.
 */
export const COLOR_THEME_COOKIE = "app-palette";
export const CUSTOM_THEME_COOKIE = "app-custom-theme";

export const COLOR_THEMES: readonly ColorThemeOption[] = [
  {
    id: "classic",
    name: "Classic",
    description: "The original neutral look, with a hint of teal.",
  },
  {
    id: "royal",
    name: "Royal Blue",
    description: "A deep royal blue, paired with a warm orange highlight.",
  },
  {
    id: "sunset",
    name: "Sunset Orange",
    description: "A warm sunset orange, finished with deep navy text.",
  },
  {
    id: "sky",
    name: "Sky",
    description: "A brighter flight-path blue with orange focus rings.",
  },
  {
    id: "midnight",
    name: "Midnight",
    description: "A darker navy for a calmer workspace, lifted by orange accents.",
  },
  {
    id: "ember",
    name: "Ember",
    description: "A warm burnt orange grounded by royal-blue highlights.",
  },
  {
    id: "emerald",
    name: "Emerald Coast",
    description: "Deep emerald with a warm amber highlight, like coastal water at sunset.",
  },
  {
    id: "coral",
    name: "Coral Reef",
    description: "Coral pink paired with a clear sky blue for a vivid complementary contrast.",
  },
  {
    id: "gold",
    name: "Golden Hour",
    description: "Warm gold set against a deep royal blue.",
  },
  {
    id: "violet",
    name: "Violet Sky",
    description: "Violet lifted by a bright lime highlight.",
  },
  {
    id: "rose",
    name: "Rose Quartz",
    description: "Dusky rose balanced by fresh teal.",
  },
];

export const THEME_TOKEN_NAMES = [
  "--background",
  "--sidebar",
  "--card",
  "--popover",
  "--muted",
  "--secondary",
  "--primary",
  "--primary-foreground",
  "--ring",
  "--accent",
  "--accent-foreground",
  "--sidebar-primary",
  "--sidebar-primary-foreground",
  "--sidebar-accent",
  "--sidebar-accent-foreground",
  "--sidebar-ring",
  "--table-row-hover",
  "--chart-1",
  "--chart-2",
  "--chart-3",
  "--chart-4",
  "--chart-5",
] as const;

export type ThemeTokenName = (typeof THEME_TOKEN_NAMES)[number];
export type ThemeTokens = Record<ThemeTokenName, string>;

export interface CustomThemeInput {
  name: string;
  primary: string;
  highlight: string;
}

export interface CustomTheme extends CustomThemeInput {
  light: ThemeTokens;
  dark: ThemeTokens;
}

export const DEFAULT_CUSTOM_THEME_INPUT: CustomThemeInput = {
  name: "My theme",
  primary: "#1e3a8a",
  highlight: "#f15f2c",
};

const HSL_TOKEN = /^[0-9]{1,3}(?:\.[0-9]+)? [0-9]{1,3}(?:\.[0-9]+)?% [0-9]{1,3}(?:\.[0-9]+)?%$/;
const HEX_COLOUR = /^#[0-9a-f]{6}$/i;

interface Hsl {
  h: number;
  s: number;
  l: number;
}

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function hexToRgb(hex: string): Rgb {
  return {
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16),
  };
}

function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;

  let hue = 0;
  if (delta !== 0) {
    if (max === red) hue = ((green - blue) / delta) % 6;
    else if (max === green) hue = (blue - red) / delta + 2;
    else hue = (red - green) / delta + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
  }

  const lightness = (max + min) / 2;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));

  return { h: hue, s: saturation * 100, l: lightness * 100 };
}

function hslToRgb({ h, s, l }: Hsl): Rgb {
  const saturation = clamp(s, 0, 100) / 100;
  const lightness = clamp(l, 0, 100) / 100;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const section = h / 60;
  const x = chroma * (1 - Math.abs((section % 2) - 1));
  const m = lightness - chroma / 2;

  let red = 0;
  let green = 0;
  let blue = 0;
  if (section < 1) [red, green, blue] = [chroma, x, 0];
  else if (section < 2) [red, green, blue] = [x, chroma, 0];
  else if (section < 3) [red, green, blue] = [0, chroma, x];
  else if (section < 4) [red, green, blue] = [0, x, chroma];
  else if (section < 5) [red, green, blue] = [x, 0, chroma];
  else [red, green, blue] = [chroma, 0, x];

  return {
    r: Math.round((red + m) * 255),
    g: Math.round((green + m) * 255),
    b: Math.round((blue + m) * 255),
  };
}

function hslToHex(hsl: Hsl): string {
  const { r, g, b } = hslToRgb(hsl);
  return `#${[r, g, b].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const [red, green, blue] = [r, g, b].map((value) => {
    const channel = value / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

export function contrastRatio(foreground: string, background: string): number {
  const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background));
  const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

export function isHexColour(value: string): boolean {
  return HEX_COLOUR.test(value.trim());
}

export function isHslToken(value: string): boolean {
  return HSL_TOKEN.test(value);
}

/** Converts a token value back to hex; used by tests to check text contrast. */
export function hslTokenToHex(value: string): string | null {
  if (!isHslToken(value)) return null;
  const [h, s, l] = value.replace(/%/g, "").split(" ").map(Number);
  return hslToHex({ h, s, l });
}

function token(hsl: Hsl): string {
  return `${round(clamp(hsl.h, 0, 360))} ${round(clamp(hsl.s, 0, 100))}% ${round(clamp(hsl.l, 0, 100))}%`;
}

function readableForeground(background: string): string {
  const white = "#ffffff";
  const ink = "#0b1533";
  return contrastRatio(background, white) >= contrastRatio(background, ink)
    ? "0 0% 100%"
    : "224 65% 12%";
}

/**
 * Nudges a seed colour's lightness only as far as needed for either white or
 * the deep-navy foreground to reach 4.5:1. Most colours need no change.
 */
function ensureReadablePrimary(input: Hsl): Hsl {
  let candidate = { ...input };
  for (let step = 0; step < 40; step += 1) {
    const hex = hslToHex(candidate);
    const whiteRatio = contrastRatio(hex, "#ffffff");
    const inkRatio = contrastRatio(hex, "#0b1533");
    if (whiteRatio >= 4.5 || inkRatio >= 4.5) return candidate;
    candidate = {
      ...candidate,
      l: clamp(candidate.l + (whiteRatio >= inkRatio ? -1 : 1), 0, 100),
    };
  }
  return candidate;
}

function tokenSet(primary: string, highlight: string, dark: boolean): ThemeTokens {
  const base = rgbToHsl(hexToRgb(primary));
  const accent = rgbToHsl(hexToRgb(highlight));

  const primaryHsl: Hsl = ensureReadablePrimary(
    dark ? { h: base.h, s: base.s, l: Math.max(base.l, 65) } : base,
  );
  const ringHsl: Hsl = dark
    ? { h: accent.h, s: accent.s, l: Math.max(accent.l, 62) }
    : { h: accent.h, s: accent.s, l: clamp(accent.l, 30, 60) };
  const accentLightness = dark ? 18 : 96;
  const accentForegroundLightness = dark ? 88 : 28;
  const sidebarAccentLightness = dark ? 17 : 93;
  const sidebarAccentForegroundLightness = dark ? 90 : 24;
  const backgroundLightness = dark ? 6.5 : 98.5;
  const tableHoverLightness = dark ? 15 : 94.5;

  return {
    "--background": token({
      h: base.h,
      s: clamp(base.s * (dark ? 0.35 : 0.45), 8, dark ? 45 : 60),
      l: backgroundLightness,
    }),
    "--sidebar": token({
      h: base.h,
      s: clamp(base.s * (dark ? 0.4 : 0.35), 6, 40),
      l: dark ? 7.2 : 97,
    }),
    "--card": token({
      h: base.h,
      s: clamp(base.s * 0.25, 4, 28),
      l: dark ? 8.2 : 99.4,
    }),
    "--popover": token({
      h: base.h,
      s: clamp(base.s * 0.25, 4, 28),
      l: dark ? 9.2 : 99.7,
    }),
    "--muted": token({
      h: base.h,
      s: clamp(base.s * 0.45, 8, 45),
      l: dark ? 15 : 96.8,
    }),
    "--secondary": token({
      h: base.h,
      s: clamp(base.s * 0.4, 8, 40),
      l: dark ? 14.8 : 95.4,
    }),
    "--primary": token(primaryHsl),
    "--primary-foreground": readableForeground(hslToHex(primaryHsl)),
    "--ring": token(ringHsl),
    "--accent": token({
      h: base.h,
      s: clamp(base.s * 0.8, 20, 100),
      l: accentLightness,
    }),
    "--accent-foreground": token({
      h: base.h,
      s: clamp(base.s, 30, 90),
      l: accentForegroundLightness,
    }),
    "--sidebar-primary": token(primaryHsl),
    "--sidebar-primary-foreground": readableForeground(hslToHex(primaryHsl)),
    "--sidebar-accent": token({
      h: base.h,
      s: clamp(base.s * 0.8, 20, 100),
      l: sidebarAccentLightness,
    }),
    "--sidebar-accent-foreground": token({
      h: base.h,
      s: clamp(base.s, 30, 90),
      l: sidebarAccentForegroundLightness,
    }),
    "--sidebar-ring": token(ringHsl),
    "--table-row-hover": token({
      h: base.h,
      s: clamp(base.s * (dark ? 0.45 : 0.7), 12, dark ? 55 : 70),
      l: tableHoverLightness,
    }),
    "--chart-1": token({
      h: base.h,
      s: clamp(base.s, 45, 90),
      l: dark ? 68 : clamp(base.l, 38, 58),
    }),
    "--chart-2": token({
      h: accent.h,
      s: clamp(accent.s, 60, 95),
      l: dark ? 68 : clamp(accent.l, 42, 60),
    }),
    "--chart-3": token({ h: (base.h + 45) % 360, s: 65, l: dark ? 65 : 48 }),
    "--chart-4": token({ h: (base.h + 180) % 360, s: 65, l: dark ? 68 : 52 }),
    "--chart-5": token({ h: (base.h + 305) % 360, s: 70, l: dark ? 66 : 50 }),
  };
}

export function buildCustomTheme(input: CustomThemeInput): CustomTheme {
  if (!isHexColour(input.primary) || !isHexColour(input.highlight)) {
    throw new Error("Custom themes need six-digit hex colours");
  }
  const name = input.name.trim().slice(0, 40) || DEFAULT_CUSTOM_THEME_INPUT.name;
  const primary = input.primary.trim().toLowerCase();
  const highlight = input.highlight.trim().toLowerCase();
  return {
    name,
    primary,
    highlight,
    light: tokenSet(primary, highlight, false),
    dark: tokenSet(primary, highlight, true),
  };
}

function isThemeTokens(value: unknown): value is ThemeTokens {
  if (!value || typeof value !== "object") return false;
  const tokens = value as Record<string, unknown>;
  return THEME_TOKEN_NAMES.every(
    (name) => typeof tokens[name] === "string" && isHslToken(tokens[name]),
  );
}

/**
 * Rebuilds a saved custom theme from its two seed colours. Tokens saved by an
 * older build are ignored so a token added later (such as the sidebar tint)
 * is generated for existing custom themes too.
 */
export function parseCustomTheme(value: unknown): CustomTheme | null {
  if (!value || typeof value !== "object") return null;
  const theme = value as Record<string, unknown>;
  if (
    typeof theme.name !== "string" ||
    theme.name.trim().length === 0 ||
    typeof theme.primary !== "string" ||
    !isHexColour(theme.primary) ||
    typeof theme.highlight !== "string" ||
    !isHexColour(theme.highlight)
  ) {
    return null;
  }
  return buildCustomTheme({
    name: theme.name,
    primary: theme.primary,
    highlight: theme.highlight,
  });
}

/** Parse the compact custom-theme cookie used for server-side prepaint. */
export function parseCustomThemeCookie(raw: string | null | undefined): CustomTheme | null {
  if (!raw) return null;
  try {
    const text = raw.trim().startsWith("%7B") ? decodeURIComponent(raw) : raw;
    return parseCustomTheme(JSON.parse(text));
  } catch {
    return null;
  }
}

/** Store only the seed colours; tokens are rebuilt by parseCustomTheme. */
export function customThemeCookieValue(theme: CustomTheme): string {
  return JSON.stringify({
    name: theme.name,
    primary: theme.primary,
    highlight: theme.highlight,
  });
}

export function isCustomTheme(value: unknown): value is CustomTheme {
  if (!value || typeof value !== "object") return false;
  const theme = value as Record<string, unknown>;
  return (
    typeof theme.name === "string" &&
    theme.name.trim().length > 0 &&
    theme.name.length <= 40 &&
    typeof theme.primary === "string" &&
    isHexColour(theme.primary) &&
    typeof theme.highlight === "string" &&
    isHexColour(theme.highlight) &&
    isThemeTokens(theme.light) &&
    isThemeTokens(theme.dark)
  );
}

export function tokenDeclarations(tokens: ThemeTokens): string {
  return THEME_TOKEN_NAMES.map((name) => `${name}:${tokens[name]};`).join("");
}

export function customThemeCss(theme: CustomTheme): string {
  return [
    `[data-palette="${CUSTOM_COLOR_THEME}"]{${tokenDeclarations(theme.light)}}`,
    `[data-palette="${CUSTOM_COLOR_THEME}"].dark,.dark [data-palette="${CUSTOM_COLOR_THEME}"]{${tokenDeclarations(theme.dark)}}`,
  ].join("");
}

export function themeTokensToCssProperties(tokens: ThemeTokens): Record<string, string> {
  const style: Record<string, string> = {};
  for (const name of THEME_TOKEN_NAMES) style[name] = tokens[name];
  return style;
}

export function isPresetColorTheme(value: unknown): value is PresetColorTheme {
  return typeof value === "string" && (COLOR_THEME_IDS as readonly string[]).includes(value);
}

export function isColorTheme(value: unknown): value is ColorTheme {
  return value === CUSTOM_COLOR_THEME || isPresetColorTheme(value);
}

/**
 * Runs before first paint. It writes the saved palette onto <html> so the
 * selected accents are visible immediately, and injects the saved custom
 * theme's token sheet when that theme is active. Bad or removed values fall
 * back to the classic palette rather than leaving the app without tokens.
 */
export function colorThemeInitScript(): string {
  const presetIds = JSON.stringify(COLOR_THEME_IDS);
  const tokenNames = JSON.stringify(THEME_TOKEN_NAMES);
  const hslPattern = String.raw`/^[0-9]{1,3}(\.[0-9]+)? [0-9]{1,3}(\.[0-9]+)?% [0-9]{1,3}(\.[0-9]+)?%$/`;

  return [
    "(function(){try{",
    `var c="";var m=document.cookie.match(/(?:^|; )${COLOR_THEME_COOKIE}=([^;]*)/);if(m){try{c=decodeURIComponent(m[1])}catch(e){c=m[1]}}`,
    `var s=localStorage.getItem(${JSON.stringify(COLOR_THEME_STORAGE_KEY)});if(!s)s=c;`,
    `var raw=localStorage.getItem(${JSON.stringify(CUSTOM_THEME_STORAGE_KEY)});`,
    "var custom=null;try{custom=raw?JSON.parse(raw):null}catch(e){}",
    `var names=${tokenNames};var re=${hslPattern};`,
    "var build=function(t){if(!t)return\"\";var out=\"\";for(var i=0;i<names.length;i++){var v=t[names[i]];if(typeof v===\"string\"&&re.test(v)){out+=names[i]+\":\"+v+\";\"}}return out};",
    "var valid=custom&&custom.light&&custom.dark;",
    `var old=document.getElementById(${JSON.stringify(CUSTOM_THEME_STYLE_ID)});`,
    `if(s===${JSON.stringify(CUSTOM_COLOR_THEME)}&&valid){`,
    "if(old){old.remove()}",
    `var css='[data-palette="${CUSTOM_COLOR_THEME}"]{'+build(custom.light)+'}[data-palette="${CUSTOM_COLOR_THEME}"].dark,.dark [data-palette="${CUSTOM_COLOR_THEME}"]{'+build(custom.dark)+'}';`,
    "var style=document.createElement(\"style\");",
    `style.id=${JSON.stringify(CUSTOM_THEME_STYLE_ID)};style.textContent=css;document.head.appendChild(style);`,
    `document.documentElement.setAttribute("data-palette",${JSON.stringify(CUSTOM_COLOR_THEME)});`,
    `}else if(s===${JSON.stringify(CUSTOM_COLOR_THEME)}){`,
    // The server may already have injected the custom stylesheet from the cookie.
    `document.documentElement.setAttribute("data-palette",${JSON.stringify(CUSTOM_COLOR_THEME)});`,
    `}else{if(old){old.remove()}var presets=${presetIds};if(presets.indexOf(s)<0){s=${JSON.stringify(DEFAULT_COLOR_THEME)}}document.documentElement.setAttribute("data-palette",s)}}catch(e){}})();`,
  ].join("");
}
