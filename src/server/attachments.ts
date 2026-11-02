import path from "node:path";

/** Persistent volume folder for supplier confirmations, tickets and notes. */
export function uploadRoot(): string {
  const base = process.env.UPLOAD_DIR ?? "./uploads";
  return path.resolve(process.cwd(), base, "attachments");
}
