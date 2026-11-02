import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  buildCustomTheme,
  colorThemeInitScript,
  COLOR_THEME_COOKIE,
  COLOR_THEME_IDS,
  COLOR_THEMES,
  contrastRatio,
  CUSTOM_COLOR_THEME,
  CUSTOM_THEME_COOKIE,
  CUSTOM_THEME_STORAGE_KEY,
  customThemeCookieValue,
  customThemeCss,
  DEFAULT_COLOR_THEME,
  hslTokenToHex,
  isColorTheme,
  isCustomTheme,
  isHexColour,
  isPresetColorTheme,
  parseCustomTheme,
  parseCustomThemeCookie,
  THEME_TOKEN_NAMES,
} from "../src/lib/themes";

function blocks(css: string, pattern: RegExp): string {
  const matches = [...css.matchAll(new RegExp(pattern.source, "g"))];
  assert.ok(matches.length > 0, `missing stylesheet block matching ${pattern}`);
  return matches.map((match) => match[1]).join("\n");
}

function tokenValue(css: string, name: string): string {
  const match = css.match(new RegExp(`${name}:\\s*([^;]+);`));
  assert.ok(match, `missing ${name}`);
  return match[1].trim();
}

function contrast(tokenA: string, tokenB: string): number {
  const a = hslTokenToHex(tokenA);
  const b = hslTokenToHex(tokenB);
  assert.ok(a && b, `not HSL tokens: ${tokenA} / ${tokenB}`);
  return contrastRatio(a, b);
}

describe("colour themes", () => {
  it("offers the logo presets plus five complementary themes", () => {
    assert.ok(COLOR_THEME_IDS.length >= 11);
    assert.equal(new Set(COLOR_THEME_IDS).size, COLOR_THEME_IDS.length);
    assert.equal(DEFAULT_COLOR_THEME, COLOR_THEME_IDS[0]);
    assert.equal(COLOR_THEMES.length, COLOR_THEME_IDS.length);
    assert.deepEqual(
      COLOR_THEMES.map((theme) => theme.id),
      [...COLOR_THEME_IDS],
    );
    for (const theme of COLOR_THEMES) {
      assert.ok(theme.name.length > 0);
      assert.ok(theme.description.length > 0);
    }
    for (const id of [
      "emerald",
      "coral",
      "gold",
      "violet",
      "rose",
    ] as const) {
      assert.ok(COLOR_THEME_IDS.includes(id), `${id} should be a preset`);
    }
    assert.ok(COLOR_THEMES.some((theme) => theme.name === "Emerald Coast"));
  });

  it("only accepts known palette ids", () => {
    for (const id of COLOR_THEME_IDS) assert.equal(isPresetColorTheme(id), true);
    assert.equal(isPresetColorTheme(CUSTOM_COLOR_THEME), false);
    assert.equal(isColorTheme(CUSTOM_COLOR_THEME), true);
    assert.equal(isColorTheme("unknown"), false);
    assert.equal(isColorTheme(null), false);
  });

  it("prepaints presets and generated customs from local storage", () => {
    const script = colorThemeInitScript();
    for (const id of COLOR_THEME_IDS) assert.ok(script.includes(JSON.stringify(id)));
    assert.ok(script.includes(JSON.stringify(CUSTOM_THEME_STORAGE_KEY)));
    assert.ok(script.includes(CUSTOM_COLOR_THEME));
    assert.ok(script.includes('setAttribute("data-palette"'));
    assert.ok(script.includes(COLOR_THEME_COOKIE), "prepaint script should use the palette cookie");
  });

  it("round-trips a custom theme through its compact cookie", () => {
    const theme = buildCustomTheme({ name: "Cookie theme", primary: "#0f766e", highlight: "#f59e0b" });
    const raw = customThemeCookieValue(theme);
    assert.ok(raw.length < 200, "cookie should only store the seed colours");
    const parsed = parseCustomThemeCookie(raw);
    assert.ok(parsed);
    assert.equal(parsed.name, theme.name);
    assert.equal(parsed.primary, theme.primary);
    assert.equal(parsed.highlight, theme.highlight);
    assert.deepEqual(parsed.light, theme.light);
    assert.equal(parseCustomThemeCookie("not json"), null);
    assert.equal(parseCustomThemeCookie(null), null);
    assert.ok(CUSTOM_THEME_COOKIE.length > 0);
  });

  it("defines every accent, background, sidebar and table-hover token in CSS", () => {
    const css = readFileSync("src/app/globals.css", "utf8");

    for (const id of COLOR_THEME_IDS) {
      const light = blocks(css, new RegExp(`\\[data-palette="${id}"\\]\\s*\\{([^}]*)\\}`));
      const dark = blocks(
        css,
        new RegExp(
          `\\[data-palette="${id}"\\]\\.dark,\\s*\\.dark \\[data-palette="${id}"\\]\\s*\\{([^}]*)\\}`,
        ),
      );
      for (const token of THEME_TOKEN_NAMES) {
        assert.ok(light.includes(`${token}:`), `${id} light mode is missing ${token}`);
        assert.ok(dark.includes(`${token}:`), `${id} dark mode is missing ${token}`);
      }
    }
  });

  it("uses the themed table-row hover instead of a neutral wash", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    assert.ok(css.includes("background-color: hsl(var(--table-row-hover) / 0.5)"));
    assert.ok(css.includes(".theme-row-hover"));
  });

  it("keeps text contrast on tinted surfaces for every palette", () => {
    const css = readFileSync("src/app/globals.css", "utf8");

    for (const id of COLOR_THEME_IDS) {
      const light = blocks(css, new RegExp(`\\[data-palette="${id}"\\]\\s*\\{([^}]*)\\}`));
      const dark = blocks(
        css,
        new RegExp(
          `\\[data-palette="${id}"\\]\\.dark,\\s*\\.dark \\[data-palette="${id}"\\]\\s*\\{([^}]*)\\}`,
        ),
      );

      const modes = [
        ["light", light, "0 0% 44%", "0 0% 3.9%"],
        ["dark", dark, "0 0% 63.9%", "0 0% 98%"],
      ] as const;
      for (const [mode, body, mutedForeground, surfaceForeground] of modes) {
        assert.ok(
          contrast(tokenValue(body, "--primary"), tokenValue(body, "--primary-foreground")) >= 4.5,
          `${id} ${mode} primary text contrast is too low`,
        );
        assert.ok(
          contrast(tokenValue(body, "--card"), surfaceForeground) >= 4.5,
          `${id} ${mode} card text contrast is too low`,
        );
        assert.ok(
          contrast(tokenValue(body, "--muted"), mutedForeground) >= 4.5,
          `${id} ${mode} muted text contrast is too low`,
        );
      }
    }
  });

  it("themes the chart series while keeping payment statuses semantic", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    const charts = readFileSync("src/components/dashboard-charts.tsx", "utf8");

    for (const token of ["--chart-1", "--chart-2", "--chart-3", "--chart-4", "--chart-5"]) {
      assert.ok(css.includes(`${token}:`), `${token} is missing from the stylesheet`);
    }
    for (const token of ["--status-paid", "--status-part-paid", "--status-unpaid", "--status-cancelled"]) {
      assert.ok(css.includes(`${token}:`), `${token} is missing from the stylesheet`);
      assert.ok(charts.includes(`var(${token})`), `${token} is not used by the dashboard`);
    }

    const custom = buildCustomTheme({ name: "Charts", primary: "#0f766e", highlight: "#f59e0b" });
    const chartColours = new Set(
      ["--chart-1", "--chart-2", "--chart-3", "--chart-4", "--chart-5"].map(
        (token) => custom.light[token as keyof typeof custom.light],
      ),
    );
    assert.ok(chartColours.size >= 4, "custom chart series should stay distinguishable");
  });

  it("builds a custom theme with tinted surfaces and readable text", () => {
    const theme = buildCustomTheme({
      name: "  Island hopper  ",
      primary: "#1E3A8A",
      highlight: "#F15F2C",
    });

    assert.equal(theme.name, "Island hopper");
    assert.equal(theme.primary, "#1e3a8a");
    assert.equal(theme.highlight, "#f15f2c");
    assert.equal(isCustomTheme(theme), true);

    const modes = [
      [theme.light, "0 0% 44%", "0 0% 3.9%"],
      [theme.dark, "0 0% 63.9%", "0 0% 98%"],
    ] as const;
    for (const [tokens, mutedForeground, surfaceForeground] of modes) {
      for (const name of THEME_TOKEN_NAMES) {
        assert.match(tokens[name], /^[0-9.]+ [0-9.]+% [0-9.]+%$/);
      }
      assert.ok(
        contrast(tokens["--primary"], tokens["--primary-foreground"]) >= 4.5,
        "primary button text is not readable",
      );
      assert.ok(contrast(tokens["--card"], surfaceForeground) >= 4.5, "card text contrast is too low");
      assert.ok(contrast(tokens["--muted"], mutedForeground) >= 4.5, "muted text contrast is too low");
    }

    const midTone = buildCustomTheme({ name: "Grey", primary: "#777777", highlight: "#ff00ff" });
    for (const tokens of [midTone.light, midTone.dark]) {
      const primary = hslTokenToHex(tokens["--primary"]);
      const foreground = hslTokenToHex(tokens["--primary-foreground"]);
      assert.ok(primary && foreground);
      assert.ok(
        contrastRatio(primary, foreground) >= 4.5,
        `mid-tone primary text is not readable: ${contrastRatio(primary, foreground)}`,
      );
    }

    // The background and table hover carry the primary hue, not a neutral wash.
    assert.notEqual(theme.light["--background"], "0 0% 100%");
    assert.notEqual(theme.light["--table-row-hover"], "240 4.8% 95.9%");
    assert.notEqual(theme.light["--background"], theme.dark["--background"]);
  });

  it("rebuilds saved custom themes so new tokens such as the sidebar tint are included", () => {
    const migrated = parseCustomTheme({
      name: "Old theme",
      primary: "#123456",
      highlight: "#abcdef",
      light: { "--primary": "old token" },
      dark: {},
    });
    assert.ok(migrated);
    assert.equal(migrated.name, "Old theme");
    assert.ok(migrated.light["--sidebar"].length > 0);
    assert.notEqual(migrated.light["--sidebar"], "0 0% 98%");
    assert.equal(parseCustomTheme({ name: "Bad", primary: "red", highlight: "#abcdef" }), null);
  });

  it("rejects malformed custom themes instead of injecting them", () => {
    assert.equal(isCustomTheme(null), false);
    assert.equal(isCustomTheme({ name: "Bad" }), false);
    const theme = buildCustomTheme({ name: "Valid", primary: "#1e3a8a", highlight: "#f15f2c" });
    assert.equal(isCustomTheme({ ...theme, light: { ...theme.light, "--primary": "red;}" } }), false);
    assert.equal(isHexColour("#abc"), false);
    assert.equal(isHexColour("#aabbcc"), true);
  });

  it("serialises both light and dark custom tokens into the generated stylesheet", () => {
    const theme = buildCustomTheme({ name: "Mine", primary: "#0f766e", highlight: "#f59e0b" });
    const css = customThemeCss(theme);
    assert.ok(css.includes(`[data-palette="${CUSTOM_COLOR_THEME}"]{`));
    assert.ok(css.includes(`[data-palette="${CUSTOM_COLOR_THEME}"].dark`));
    for (const name of THEME_TOKEN_NAMES) {
      assert.ok(css.includes(`${name}:${theme.light[name]};`));
      assert.ok(css.includes(`${name}:${theme.dark[name]};`));
    }
  });
});
