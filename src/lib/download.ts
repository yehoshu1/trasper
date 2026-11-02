/**
 * Safe Content-Disposition values.
 *
 * Document numbers and uploaded filenames end up in response headers. A CR/LF
 * or a quote in either must never be able to split the header (response
 * splitting) or produce an unusable filename. RFC 5987 `filename*` carries the
 * real UTF-8 name; the quoted `filename` fallback is deliberately ASCII.
 */

const CONTROL_OR_PATH = /[\u0000-\u001f\u007f/\\:*?"<>|]+/g;

/** Remove path separators, control characters and header-breaking quotes. */
export function safeDownloadFilename(input: string, fallback = "document"): string {
  const base = (input || "")
    .replace(/\\/g, "/")
    .split("/")
    .pop()
    ?.replace(CONTROL_OR_PATH, "-")
    .replace(/\s+/g, " ")
    .trim();
  const safe = (base ?? "").slice(0, 160);
  return safe || fallback;
}

export function contentDisposition(
  filename: string,
  disposition: "attachment" | "inline" = "attachment",
): string {
  const safe = safeDownloadFilename(filename);
  const ascii = safe.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `${disposition}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}
