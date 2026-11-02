"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const PDFViewer = dynamic(
  () => import("@embedpdf/react-pdf-viewer").then((module) => module.PDFViewer),
  {
    ssr: false,
    loading: () => (
      <div className="grid place-items-center rounded-lg border border-dashed border-border bg-card p-16 text-sm text-muted-foreground">
        Rendering the PDF…
      </div>
    ),
  },
);

/**
 * Shows the real generated PDF with EmbedPDF so page breaks are visible
 * exactly as they will print. The PDF is fetched as a blob first so a
 * rendering error can be shown as a message instead of raw JSON.
 */
export function PdfPreview({
  src,
  height = "78vh",
  title = "Document preview",
}: {
  src: string;
  height?: string;
  title?: string;
}) {
  const [result, setResult] = useState<{ src: string; url?: string; error?: string }>({ src });

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;

    fetch(src, { headers: { accept: "application/pdf" } })
      .then(async (response) => {
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? `Could not render the PDF (${response.status})`);
        }
        const blob = await response.blob();
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setResult({ src, url: objectUrl });
      })
      .catch((caught: unknown) => {
        if (active) {
          setResult({
            src,
            error: caught instanceof Error ? caught.message : "Could not render the PDF",
          });
        }
      });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src]);

  const current = result.src === src ? result : { src };
  const { url, error } = current;

  if (error) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-8 text-center text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
        <p className="font-semibold">The preview cannot be built yet</p>
        <p className="mt-1">{error}</p>
        <p className="mt-2 text-xs text-amber-800 dark:text-amber-300">
          Complete the missing fields (for example a fare line or an airport code) and try again.
        </p>
      </div>
    );
  }

  if (!url) {
    return (
      <div className="grid place-items-center rounded-lg border border-dashed border-border bg-card p-16 text-sm text-muted-foreground">
        Rendering the PDF…
      </div>
    );
  }

  const wasmUrl =
    typeof window === "undefined"
      ? "/pdfium/pdfium.wasm"
      : new URL("/pdfium/pdfium.wasm", window.location.origin).toString();

  return (
    <div
      className="w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
      style={{ height }}
      aria-label={title}
    >
      <PDFViewer
        key={url}
        config={{
          src: url,
          // Render on the main thread: the worker build loads its bootstrap
          // from blob: URLs, which the strict script-src policy blocks.
          worker: false,
          // Self-hosted PDFium: the default fetches the WASM binary and fonts
          // from public CDNs, which a strict CSP must not allow.
          wasmUrl,
          fontFallback: null,
          fonts: { ui: null, signature: null },
          stamp: { defaultLibrary: false, manifests: [] },
        }}
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  );
}
