/**
 * Bank-account selection rules.
 *
 * Exactly one active account may be the default. Selection never depends on
 * the browser: the server resolves the chosen id, falls back to the default
 * at send/issue time, and snapshots the details into the frozen document.
 */

export interface SelectableBankAccount {
  id: string;
  label: string;
  currency: string;
  isDefault: boolean;
  isArchived: boolean;
  sortOrder: number;
}

/** Validate the one-default invariant for a set of live accounts. */
export function defaultAccountIds(accounts: Pick<SelectableBankAccount, "id" | "isDefault" | "isArchived">[]): string[] {
  return accounts.filter((account) => account.isDefault && !account.isArchived).map((account) => account.id);
}

export function hasExactlyOneDefault(
  accounts: Pick<SelectableBankAccount, "id" | "isDefault" | "isArchived">[],
): boolean {
  return defaultAccountIds(accounts).length === 1;
}

/**
 * Resolve the account whose details print on a document. An explicitly chosen,
 * active account wins; otherwise the active default; otherwise the first
 * active account in display order.
 */
export function chooseBankAccount<T extends SelectableBankAccount>(
  accounts: T[],
  requestedId: string | null | undefined,
): T | null {
  const active = accounts.filter((account) => !account.isArchived);
  if (requestedId) {
    const requested = active.find((account) => account.id === requestedId);
    if (requested) return requested;
  }
  return (
    active.find((account) => account.isDefault) ??
    [...active].sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))[0] ??
    null
  );
}

export function sortBankAccounts<T extends Pick<SelectableBankAccount, "label" | "sortOrder">>(accounts: T[]): T[] {
  return [...accounts].sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));
}
