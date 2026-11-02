/**
 * Deterministic follow-up prioritisation.
 * The score is explainable and never uses AI; an optional AI sentence can sit
 * on top, but this is what drives the order.
 */

export interface FollowUpInput {
  quotationId: string;
  number: string;
  customerName: string;
  sentAt: Date;
  validUntil: Date;
  ticketingDeadline?: Date | null;
  lastActivityAt?: Date | null;
  nextFollowUpAt?: Date | null;
}

export interface FollowUpScore extends FollowUpInput {
  score: number;
  reasons: string[];
  nextAction: string;
  daysToExpiry: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function daysBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / DAY_MS;
}

export function scoreFollowUp(input: FollowUpInput, now: Date): FollowUpScore {
  let score = 20;
  const reasons: string[] = [];
  const daysToExpiry = Math.ceil(daysBetween(now, input.validUntil));

  if (daysToExpiry <= 0) {
    score += 45;
    reasons.push("The validity date has passed");
  } else if (daysToExpiry <= 3) {
    score += 30;
    reasons.push(`Expires in ${daysToExpiry} day${daysToExpiry === 1 ? "" : "s"}`);
  } else if (daysToExpiry <= 7) {
    score += 12;
    reasons.push("Expires within a week");
  }

  if (input.ticketingDeadline) {
    const hours = daysBetween(now, input.ticketingDeadline) * 24;
    if (hours <= 0) {
      score += 40;
      reasons.push("The ticketing deadline has passed");
    } else if (hours <= 48) {
      score += 35;
      reasons.push(`Ticketing deadline in ${Math.max(1, Math.round(hours))} hours`);
    }
  }

  const idleDays = daysBetween(input.lastActivityAt ?? input.sentAt, now);
  if (idleDays >= 7) {
    score += Math.min(20, Math.floor(idleDays));
    reasons.push(`No activity for ${Math.floor(idleDays)} days`);
  }

  if (input.nextFollowUpAt && input.nextFollowUpAt <= now) {
    score += 20;
    reasons.push("A follow-up is due");
  }

  const nextAction =
    daysToExpiry <= 0
      ? "Confirm whether the customer still wants the trip; offer a revised quotation"
      : input.ticketingDeadline && daysBetween(now, input.ticketingDeadline) * 24 <= 48
        ? "Call now about ticketing before the deadline"
        : input.nextFollowUpAt && input.nextFollowUpAt <= now
          ? "Make the planned follow-up call"
          : idleDays >= 7
            ? "Send a short check-in email"
            : "Wait for the customer's reply";

  return { ...input, score: Math.min(100, score), reasons, nextAction, daysToExpiry };
}
