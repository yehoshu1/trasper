import { jsonSafe } from "@/server/db";

/**
 * One helper wraps every write. The log is append-only: the app has no edit
 * or delete action for AuditLog. BigInt values are stored as strings in the
 * before/after JSON.
 */

interface AuditWriter {
  auditLog: {
    create: (args: {
      data: {
        userId: string | null;
        action: string;
        entity: string;
        entityId: string;
        diff: string;
      };
    }) => Promise<unknown>;
  };
}

export interface AuditEntry {
  userId?: string | null;
  action: string;
  entity: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
}

export async function audit(
  tx: AuditWriter,
  entry: AuditEntry,
): Promise<void> {
  await tx.auditLog.create({
    data: {
      userId: entry.userId ?? null,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId,
      diff: jsonSafe({
        before: entry.before ?? null,
        after: entry.after ?? null,
      }),
    },
  });
}

export interface AuditDiff {
  before: unknown;
  after: unknown;
}

export function parseAuditDiff(diff: string): AuditDiff {
  try {
    const parsed = JSON.parse(diff) as Partial<AuditDiff>;
    return { before: parsed.before ?? null, after: parsed.after ?? null };
  } catch {
    return { before: null, after: null };
  }
}
