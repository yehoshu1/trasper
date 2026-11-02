import { isWeakSecret } from "./security-env";
import { secretsEqual } from "./secrets";

export const MIN_CRON_SECRET_LENGTH = 16;

/**
 * Guards the scheduled internal route.
 *
 * The shared secret is configured in CRON_SECRET and must arrive as an
 * `Authorization: Bearer …` header. Query-string secrets are deliberately not
 * accepted: URLs end up in proxy logs, browser history and Referer headers.
 *
 * In production a missing, short or example secret fails closed. Development
 * may leave it unset so a fresh checkout can exercise the route.
 */
export function cronAuthorised(input: {
  secretEnv?: string;
  authorization?: string | null;
  nodeEnv?: string;
}): boolean {
  const expected = input.secretEnv?.trim() ?? "";
  if (!expected) return input.nodeEnv === "development" || input.nodeEnv === "test";
  if (expected.length < MIN_CRON_SECRET_LENGTH || isWeakSecret(expected)) return false;

  const bearer = input.authorization?.startsWith("Bearer ")
    ? input.authorization.slice("Bearer ".length).trim()
    : null;
  return Boolean(bearer) && secretsEqual(expected, bearer as string);
}
