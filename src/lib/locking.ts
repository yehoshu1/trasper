/**
 * Optimistic locking.
 *
 * Every editable record carries a `version` that the editor sends back with
 * its save. The server compares it with the stored value inside the same
 * transaction that writes; a mismatch means somebody else saved first, so the
 * write is rejected and the user is offered a reload instead of silently
 * overwriting their colleague's work.
 */

export const STALE_VERSION_MESSAGE =
  "Someone else changed this record after you opened it. Reload to see their changes, then try again.";

export interface Versioned {
  version: number;
}

/** True when the editor's version is no longer the stored version. */
export function isStaleVersion(current: number, expected: number): boolean {
  return !Number.isFinite(expected) || current !== expected;
}

/** The next stored version after a successful save. */
export function nextVersion(current: number): number {
  return current + 1;
}

/**
 * Build the `where` clause for an atomic version-checked update. Prisma's
 * updateMany returns a count, so callers can detect that somebody saved
 * between the read and the write.
 */
export function versionedWhere(id: string, expected: number): { id: string; version: number } {
  return { id, version: expected };
}
