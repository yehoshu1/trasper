import { timingSafeEqual } from "node:crypto";

/** Constant-time comparison for shared secrets such as the cron token. */
export function secretsEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
