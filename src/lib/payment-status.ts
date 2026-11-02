/**
 * Pro forma status is calculated, never typed: Unpaid when
 * nothing has been paid, Paid when the total is reached, Part-paid between.
 * Payments are append-only, so a reversal simply moves the sum back down.
 */
export type ProformaStatus = "unpaid" | "part_paid" | "paid" | "cancelled";

export function deriveStatus(totalMinor: bigint, paidMinor: bigint): ProformaStatus {
  if (paidMinor === 0n) return "unpaid";
  if (paidMinor >= totalMinor) return "paid";
  return "part_paid";
}
