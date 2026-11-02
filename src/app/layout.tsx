import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { cookies, headers } from "next/headers";
import Script from "next/script";

import { PaletteProvider } from "@/components/palette-provider";
import { ThemeProvider } from "@/components/theme-provider";
import {
  COLOR_THEME_COOKIE,
  colorThemeInitScript,
  CUSTOM_COLOR_THEME,
  CUSTOM_THEME_COOKIE,
  CUSTOM_THEME_STYLE_ID,
  customThemeCss,
  DEFAULT_COLOR_THEME,
  isColorTheme,
  parseCustomThemeCookie,
} from "@/lib/themes";
import "./globals.css";

export const metadata: Metadata = {
  title: "Trasper — Travel Quotations",
  description: "Staff quotation, itinerary and pro forma system",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [requestHeaders, cookieStore] = await Promise.all([headers(), cookies()]);
  const nonce = requestHeaders.get("x-nonce") ?? undefined;
  const storedPalette = cookieStore.get(COLOR_THEME_COOKIE)?.value;
  const selectedPalette = isColorTheme(storedPalette) ? storedPalette : DEFAULT_COLOR_THEME;
  const customTheme =
    selectedPalette === CUSTOM_COLOR_THEME
      ? parseCustomThemeCookie(cookieStore.get(CUSTOM_THEME_COOKIE)?.value)
      : null;
  // A custom palette without a valid cookie falls back to classic rather than
  // rendering an empty token set.
  const palette =
    selectedPalette === CUSTOM_COLOR_THEME && !customTheme
      ? DEFAULT_COLOR_THEME
      : selectedPalette;
  const customCss = palette === CUSTOM_COLOR_THEME && customTheme ? customThemeCss(customTheme) : null;

  return (
    <html
      lang="en-GB"
      className={GeistSans.variable}
      data-palette={palette}
      suppressHydrationWarning
    >
      <body>
        {customCss ? (
          <style
            id={CUSTOM_THEME_STYLE_ID}
            dangerouslySetInnerHTML={{ __html: customCss }}
          />
        ) : null}
        <Script
          id="app-palette"
          strategy="beforeInteractive"
          nonce={nonce}
          dangerouslySetInnerHTML={{ __html: colorThemeInitScript() }}
        />
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
          nonce={nonce}
        >
          <PaletteProvider>{children}</PaletteProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
