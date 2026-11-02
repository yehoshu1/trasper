"use client";

import { GeistSans } from "geist/font/sans";
import { useEffect } from "react";

import { ErrorState, errorReference } from "@/components/error-state";

import "./globals.css";

/**
 * Last-resort boundary for failures in the root layout. It replaces the root
 * layout, so it must provide its own document, styles and font.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  useEffect(() => {
    console.error("Global application error", error);
  }, [error]);

  return (
    <html lang="en-GB" className={GeistSans.variable} data-palette="classic">
      <body>
        <title>Something went wrong — Trasper</title>
        <ErrorState
          fullHeight
          code="500"
          title="Something went wrong"
          description="The workspace could not be loaded. Try again; if the problem continues, check the server logs or contact your administrator."
          reference={errorReference(error)}
          actions={
            <>
              <button type="button" className="btn-primary" onClick={() => retry()}>
                Try again
              </button>
              <button type="button" className="btn-secondary" onClick={() => window.location.assign("/")}>
                Reload the app
              </button>
            </>
          }
        />
      </body>
    </html>
  );
}
