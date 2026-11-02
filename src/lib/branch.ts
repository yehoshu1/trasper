/**
 * Branch codes identify the office a document is issued from. They are two
 * digits (01, 02, ...) and appear in the quotation number.
 */
export const DEFAULT_BRANCH = "01";

export const BRANCH_PATTERN = /^\d{2}$/;

export function isBranchCode(value: string): boolean {
  return BRANCH_PATTERN.test(value);
}

/** Trim and keep a branch code as stored. */
export function normaliseBranch(value: string | null | undefined): string {
  const trimmed = (value ?? "").trim();
  return isBranchCode(trimmed) ? trimmed : DEFAULT_BRANCH;
}
