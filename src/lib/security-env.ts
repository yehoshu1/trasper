/**
 * Fail-closed environment checks for the security-critical settings.
 *
 * A secret that is still the example value from .env.example is not a secret:
 * it is published in the repository. Production must also never fall back to
 * the development signing key.
 */

export const DEVELOPMENT_AUTH_SECRET =
  "development-only-auth-secret-not-for-production";

const PLACEHOLDER_SECRETS = new Set([
  "change-me-to-a-long-random-string",
  "change-me",
  "changeme",
  "change-me-please",
  "your-secret-here",
  "development-only-auth-secret-not-for-production",
  "ci-only-secret-not-used-outside-actions",
]);

/** True when a value is empty, a published example, or obviously repetitive. */
export function isWeakSecret(value: string | null | undefined): boolean {
  const secret = (value ?? "").trim();
  if (!secret) return true;
  if (PLACEHOLDER_SECRETS.has(secret.toLowerCase())) return true;
  if (/^(change[-_ ]?me|replace[-_ ]?me|your[-_ ]?secret)/i.test(secret)) return true;
  // "aaaaaaaa…" and "123456789…" are not meaningful secrets.
  if (/^(.)\1{15,}$/.test(secret)) return true;
  return false;
}

/**
 * Resolve the Better Auth signing secret.
 *
 * Production requires an explicit 32+ character secret that is not an example
 * value. Development may fall back to a known key so a fresh checkout runs,
 * but the fallback is never used outside development/test.
 */
export function resolveAuthSecret(env: NodeJS.ProcessEnv = process.env): string {
  const devLike = env.NODE_ENV === "development" || env.NODE_ENV === "test";
  const configured = (env.BETTER_AUTH_SECRET ?? env.AUTH_SECRET ?? "").trim();

  if (!devLike) {
    if (configured.length < 32) {
      throw new Error(
        "AUTH_SECRET (or BETTER_AUTH_SECRET) must be at least 32 characters outside development",
      );
    }
    if (isWeakSecret(configured)) {
      throw new Error(
        "AUTH_SECRET is still an example value. Generate one with: openssl rand -base64 48",
      );
    }
    return configured;
  }

  if (configured.length >= 32 && !isWeakSecret(configured)) return configured;
  return DEVELOPMENT_AUTH_SECRET;
}

/**
 * Resolve the public application origin. Password-reset links, trusted origins
 * and secure-cookie decisions all depend on it, so a production deployment
 * must configure a valid absolute URL.
 */
export function resolveAppUrl(env: NodeJS.ProcessEnv = process.env): string {
  const devLike = env.NODE_ENV === "development" || env.NODE_ENV === "test";
  const production = env.NODE_ENV === "production";
  const raw = (env.BETTER_AUTH_URL ?? env.APP_URL ?? "").trim();
  if (!raw) {
    if (!devLike) {
      throw new Error("APP_URL must be set to the public https:// URL outside development");
    }
    return "http://localhost:3000";
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("APP_URL must be an absolute http(s) URL, for example https://quotes.example.com");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("APP_URL must use http:// or https://");
  }
  if (production && url.protocol === "http:" && url.hostname !== "localhost") {
    throw new Error("APP_URL must use https:// in production (session cookies are Secure)");
  }
  return url.origin;
}
