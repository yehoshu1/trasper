export interface ActionResult {
  ok: boolean;
  error?: string;
  message?: string;
  id?: string;
  warning?: string;
  /** True when a save was rejected because a newer version exists. */
  stale?: boolean;
}

export const actionOk = (message?: string, id?: string): ActionResult => ({
  ok: true,
  message,
  id,
});

export const actionError = (error: string): ActionResult => ({ ok: false, error });

export const actionStale = (message: string): ActionResult => ({ ok: false, error: message, stale: true });

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Something went wrong";
}
