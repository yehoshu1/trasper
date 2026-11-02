/**
 * Small, dependency-free fixed-window rate limiter.
 *
 * The application calls Better Auth's server API directly from server actions,
 * which bypasses Better Auth's HTTP middleware and therefore its rate limiter.
 * This limiter is applied in the actions themselves.
 *
 * It is intentionally in-process: the documented deployment is a single Node
 * container behind Caddy. A restart clears the counters, which is acceptable
 * for staff-only login throttling; the database lockout in Better Auth's 2FA
 * plugin remains the durable second factor.
 */

export interface RateLimitRule {
  /** Maximum actions allowed in the window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  /** Seconds until the window resets; zero when allowed. */
  retryAfterSeconds: number;
  remaining: number;
}

interface Entry {
  count: number;
  resetAt: number;
}

const MAX_ENTRIES = 20_000;

export class FixedWindowRateLimiter {
  private readonly entries = new Map<string, Entry>();
  private readonly now: () => number;

  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  /** Check without counting. Used for failures-only rules such as sign-in. */
  peek(key: string, rule: RateLimitRule): RateLimitDecision {
    const now = this.now();
    const entry = this.entries.get(key);
    if (!entry || entry.resetAt <= now) {
      return { allowed: true, retryAfterSeconds: 0, remaining: rule.limit };
    }
    const remaining = Math.max(0, rule.limit - entry.count);
    return {
      allowed: remaining > 0,
      retryAfterSeconds: remaining > 0 ? 0 : Math.ceil((entry.resetAt - now) / 1000),
      remaining,
    };
  }

  /** Count one action and report whether it is allowed. */
  consume(key: string, rule: RateLimitRule): RateLimitDecision {
    const now = this.now();
    this.prune(now);
    const entry = this.entries.get(key);
    if (!entry || entry.resetAt <= now) {
      this.entries.set(key, { count: 1, resetAt: now + rule.windowMs });
      return { allowed: true, retryAfterSeconds: 0, remaining: Math.max(0, rule.limit - 1) };
    }
    if (entry.count >= rule.limit) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
        remaining: 0,
      };
    }
    entry.count += 1;
    return {
      allowed: true,
      retryAfterSeconds: 0,
      remaining: Math.max(0, rule.limit - entry.count),
    };
  }

  /** Count a failure but do not make the current attempt fail because of it. */
  recordFailure(key: string, rule: RateLimitRule): void {
    const now = this.now();
    this.prune(now);
    const entry = this.entries.get(key);
    if (!entry || entry.resetAt <= now) {
      this.entries.set(key, { count: 1, resetAt: now + rule.windowMs });
      return;
    }
    entry.count += 1;
  }

  reset(key: string): void {
    this.entries.delete(key);
  }

  /** Test helper: clear all counters. */
  clear(): void {
    this.entries.clear();
  }

  private prune(now: number): void {
    if (this.entries.size < MAX_ENTRIES / 2) return;
    for (const [key, entry] of this.entries) {
      if (entry.resetAt <= now) this.entries.delete(key);
    }
    // Unique-email reset/login attempts must not grow the map without bound.
    // Evict oldest insertion-order entries once the hard cap is reached.
    while (this.entries.size > MAX_ENTRIES) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }
}
