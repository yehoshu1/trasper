import { scoreFollowUp, type FollowUpScore } from "@/lib/followups";
import { prisma } from "@/server/db";

/** Sent quotations ranked by explainable urgency; no AI required. */
export async function prioritisedFollowUps(limit = 8, now: Date = new Date()): Promise<FollowUpScore[]> {
  const quotations = await prisma.quotation.findMany({
    where: { status: "sent" },
    include: {
      contact: { select: { name: true } },
      options: { select: { ticketingDeadline: true }, orderBy: { ticketingDeadline: "asc" }, take: 1 },
      activities: {
        select: { occurredAt: true, nextFollowUpAt: true },
        orderBy: { occurredAt: "desc" },
        take: 1,
      },
    },
    take: 200,
  });

  return quotations
    .map((quotation) =>
      scoreFollowUp(
        {
          quotationId: quotation.id,
          number: quotation.number,
          customerName: quotation.contact.name,
          sentAt: quotation.sentAt ?? quotation.createdAt,
          validUntil: quotation.validUntil,
          ticketingDeadline: quotation.options[0]?.ticketingDeadline ?? null,
          lastActivityAt: quotation.activities[0]?.occurredAt ?? null,
          nextFollowUpAt: quotation.activities[0]?.nextFollowUpAt ?? null,
        },
        now,
      ),
    )
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
