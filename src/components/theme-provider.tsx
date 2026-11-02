"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";

export function ThemeProvider({ children, ...props }: ComponentProps<typeof NextThemesProvider>) {
  // next-themes renders its FOUC-prevention <script> from inside this client
  // component. React 19 (Next 16) warns about client-created <script> tags.
  // Keep the server copy runnable (no flash) and make the client copy an
  // inert JSON data block so React ignores it.
  const scriptType = typeof window === "undefined" ? "text/javascript" : "application/json";

  return (
    <NextThemesProvider {...props} scriptProps={{ ...props.scriptProps, type: scriptType }}>
      {children}
    </NextThemesProvider>
  );
}
