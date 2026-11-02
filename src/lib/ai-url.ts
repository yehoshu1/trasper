/**
 * The AI provider base URL is admin-controlled, but the server then makes an
 * outbound request to it with an API key. Restrict it to http(s), reject
 * embedded credentials, and in production refuse private/link-local targets
 * unless the operator deliberately opts in (for a local Ollama server).
 */

export interface AiUrlResult {
  ok: boolean;
  url?: string;
  error?: string;
}

const PRIVATE_HOST_PATTERNS: RegExp[] = [
  /^localhost$/i,
  /\.localhost$/i,
  /\.local$/i,
  /\.internal$/i,
  /\.(nip\.io|sslip\.io|localtest\.me|lvh\.me)$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./,
  /^0\./,
  /^\[?::1\]?$/,
  /^\[?f[cd][0-9a-f]{2}:/i,
  /^\[?fe[89ab][0-9a-f]:/i,
];

export function isPrivateOrLocalHost(hostname: string): boolean {
  return PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(hostname));
}

export function validateAiBaseUrl(
  raw: string,
  env: NodeJS.ProcessEnv = process.env,
): AiUrlResult {
  const value = raw.trim();
  if (!value) return { ok: false, error: "Enter the provider base URL" };
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, error: "Use a valid http:// or https:// URL" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, error: "The provider URL must use http:// or https://" };
  }
  if (url.username || url.password) {
    return { ok: false, error: "Do not embed credentials in the provider URL" };
  }
  const allowPrivate =
    env.AI_ALLOW_PRIVATE_BASE_URL === "1" ||
    (env.NODE_ENV !== "production" && isPrivateOrLocalHost(url.hostname));
  if (url.protocol === "http:" && env.NODE_ENV === "production" && !allowPrivate) {
    return { ok: false, error: "Use https:// for the provider URL in production" };
  }
  if (env.NODE_ENV === "production" && isPrivateOrLocalHost(url.hostname) && !allowPrivate) {
    return {
      ok: false,
      error:
        "Private and link-local provider URLs are blocked. Set AI_ALLOW_PRIVATE_BASE_URL=1 only for a deliberate local model server.",
    };
  }
  return { ok: true, url: url.toString().replace(/\/+$/, "") };
}
