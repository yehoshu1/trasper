/**
 * Role checks. Roles are rows in the Role table; the built-in matrix is the
 * fallback and the seed for a fresh database. Every capability is enforced on
 * the server — hiding a button is never the control.
 */

export const ROLES = ["admin", "agent", "accountant", "viewer"] as const;
export type Role = (typeof ROLES)[number];

export const CAPABILITIES = [
  "manageUsers",
  "manageSettings",
  "manageContacts",
  "viewContacts",
  "manageQuotations",
  "manageDocuments",
  "recordPayments",
  "viewDocuments",
  "viewCosts",
  "viewAudit",
  "viewPaymentLedger",
  "viewReports",
  "exportContacts",
] as const;
export type Capability = (typeof CAPABILITIES)[number];

export const CAPABILITY_LABELS: Record<Capability, string> = {
  manageUsers: "Manage users and roles",
  manageSettings: "Manage company settings",
  manageContacts: "Create and edit customers and passengers",
  viewContacts: "View customers",
  manageQuotations: "Create, edit and revise quotations",
  manageDocuments: "Issue and cancel itineraries and pro formas",
  recordPayments: "Record and reverse payments",
  viewDocuments: "View quotations, itineraries and pro formas",
  viewCosts: "See costs, markup, VAT and profit",
  viewAudit: "View the audit log",
  viewPaymentLedger: "View the payment ledger",
  viewReports: "View reports and export CSV",
  exportContacts: "Export customers",
};

const MATRIX: Record<Role, Capability[]> = {
  admin: [...CAPABILITIES],
  agent: [
    "manageContacts",
    "viewContacts",
    "manageQuotations",
    "manageDocuments",
    "viewDocuments",
    "viewCosts",
  ],
  accountant: [
    "viewContacts",
    "manageDocuments",
    "recordPayments",
    "viewDocuments",
    "viewCosts",
    "viewAudit",
    "viewPaymentLedger",
    "viewReports",
    "exportContacts",
  ],
  viewer: ["viewDocuments"],
};

export type CapabilitySubject =
  | string
  | { role: string; capabilities?: readonly Capability[] };

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

export function isCapability(value: string): value is Capability {
  return (CAPABILITIES as readonly string[]).includes(value);
}

export function parseCapabilities(raw: string | null | undefined): Capability[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is Capability => typeof value === "string" && isCapability(value));
  } catch {
    return [];
  }
}

/** Built-in capability set for a role key (empty for custom/unknown roles). */
export function capabilitiesFor(role: string): Capability[] {
  return isRole(role) ? [...MATRIX[role]] : [];
}

export function hasCapability(subject: CapabilitySubject, capability: Capability): boolean {
  if (typeof subject === "object" && Array.isArray(subject.capabilities)) {
    return subject.capabilities.includes(capability);
  }
  const role = typeof subject === "string" ? subject : subject.role;
  return capabilitiesFor(role).includes(capability);
}

export class PermissionError extends Error {
  constructor(message = "You do not have permission to do that") {
    super(message);
    this.name = "PermissionError";
  }
}

/** Throws unless the subject has the capability. Use this in every action. */
export function requireCapability(subject: CapabilitySubject, capability: Capability): void {
  if (!hasCapability(subject, capability)) throw new PermissionError();
}

export function canViewCosts(subject: CapabilitySubject): boolean {
  return hasCapability(subject, "viewCosts");
}

/**
 * Remove every cost, rate, margin and profit field from a quotation option
 * before it is returned to a role that cannot see costs.
 */
export function redactOption<T extends Record<string, unknown>>(option: T): Omit<T, "rateMicro" | "marginValue"> {
  const {
    rateMicro: _rateMicro,
    marginValue: _marginValue,
    ...safe
  } = option;
  return safe as Omit<T, "rateMicro" | "marginValue">;
}

export interface CostBearingLine {
  costMinor?: bigint;
  convertedCostMinor?: bigint;
  markupShareMinor?: bigint;
  vatShareMinor?: bigint;
  taxShareMinor?: bigint;
  priceMinor?: bigint;
}

/** Strip internal components from a priced line for a viewer. */
export function redactPricedLine<T extends CostBearingLine>(line: T): Pick<T, "priceMinor"> {
  return { priceMinor: line.priceMinor } as Pick<T, "priceMinor">;
}

const COST_KEYS = new Set([
  "rateMicro",
  "marginValue",
  "costMinor",
  "markupMinor",
  "vatMinor",
  "taxesMinor",
  "profitMinor",
  "convertedCostMinor",
  "costTotalMinor",
  "totalMinorBeforeRounding",
  "cost",
  "markup",
  "profit",
  // Secrets must never be rendered in an audit/diff view, even to a role
  // that is allowed to read the audit log.
  "aiApiKeyCipher",
  "apiKey",
  "apiKeyCipher",
  "ciphertext",
  "secret",
  "token",
  "backupCodes",
]);

/**
 * Remove internal cost, rate and margin fields from arbitrary audit/diff data
 * for a role that may not see them. Used by history and diff views so the
 * existing redaction rule covers presentation over old snapshots too.
 */
export function redactAuditValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactAuditValue);
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (COST_KEYS.has(key)) continue;
      result[key] = redactAuditValue(item);
    }
    return result;
  }
  return value;
}
