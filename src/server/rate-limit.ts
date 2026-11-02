import { headers } from "next/headers";

import {
  FixedWindowRateLimiter,
  type RateLimitDecision,
  type RateLimitRule,
} from "@/lib/rate-limit";

/**
 * Process-wide counters for application-level throttling. Kept on globalThis
 * so Next's development hot reload does not reset a lockout mid-window.
 */
const globalForRateLimit = globalThis as unknown as {
  appRateLimiter?: FixedWindowRateLimiter;
};

export const rateLimiter =
  globalForRateLimit.appRateLimiter ?? new FixedWindowRateLimiter();

if (process.env.NODE_ENV !== "production") {
  globalForRateLimit.appRateLimiter = rateLimiter;
}

export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_EMAIL_LIMIT = 5;
export const LOGIN_IP_LIMIT = 30;
export const RESET_WINDOW_MS = 60 * 60 * 1000;
export const RESET_EMAIL_LIMIT = 3;
export const RESET_IP_LIMIT = 10;
export const AI_WINDOW_MS = 15 * 60 * 1000;
export const AI_LIMIT = 20;
export const SENSITIVE_WINDOW_MS = 15 * 60 * 1000;
export const SENSITIVE_LIMIT = 10;

export function consumeRateLimit(key: string, rule: RateLimitRule): RateLimitDecision {
  return rateLimiter.consume(key, rule);
}

export function peekRateLimit(key: string, rule: RateLimitRule): RateLimitDecision {
  return rateLimiter.peek(key, rule);
}

export function recordRateLimitFailure(key: string, rule: RateLimitRule): void {
  rateLimiter.recordFailure(key, rule);
}

export function resetRateLimit(key: string): void {
  rateLimiter.reset(key);
}

/**
 * Best-effort client address. Caddy sets X-Forwarded-For; if the app is
 * exposed directly the header is spoofable, which is why the per-account
 * limit remains the primary control.
 */
export async function clientAddress(): Promise<string> {
  const requestHeaders = await headers();
  const forwarded = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim();
  const real = requestHeaders.get("x-real-ip")?.trim();
  const address = forwarded || real || "unknown";
  return address.slice(0, 64);
}
