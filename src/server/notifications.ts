import { DateTime } from "luxon";

import { appTimeZone } from "@/lib/dates";
import { hasCapability, type Capability } from "@/lib/permissions";
import { prisma } from "@/server/db";
import { getSettings } from "@/server/settings";

/**
 * In-app notifications derived from data, not stored .
 * Every query is read-only, so the bell can never drift from the records.
 */

export type NotificationKind = "ticketing" | "expiring" | "overdue" | "followUp";

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  detail: string;
  href: string;
  at: string;
  tone: "info" | "warning" | "error";
}

export async function loadNotifications(
  user?: { role: string; capabilities?: readonly Capability[] },
  now: Date = new Date(),
): Promise<AppNotification[]> {
  const settings = await getSettings();
  const canSeeCosts = !user || hasCapability(user, "viewCosts");
  const canSeeCustomers = !user || hasCapability(user, "viewContacts");
  const soon = DateTime.fromJSDate(now).setZone(appTimeZone()).plus({ days: 3 }).toJSDate();
  const deadlineCutoff = DateTime.fromJSDate(now).plus({ hours: settings.ticketingWarningHours }).toJSDate();
  const endOfToday = DateTime.fromJSDate(now).setZone(appTimeZone()).endOf("day").toJSDate();

  const [deadlines, expiring, overdue, followUps] = await Promise.all([
    prisma.quoteOption.findMany({
      where: {
        ticketingDeadline: { gte: now, lte: deadlineCutoff },
        quotation: { status: "sent" },
      },
      include: { quotation: { select: { id: true, number: true, contact: { select: { name: true } } } } },
      orderBy: { ticketingDeadline: "asc" },
      take: 50,
    }),
    prisma.quotation.findMany({
      where: { status: "sent", validUntil: { gte: now, lte: soon } },
      include: { contact: { select: { name: true } } },
      orderBy: { validUntil: "asc" },
      take: 50,
    }),
    prisma.proforma.findMany({
      where: { status: { notIn: ["cancelled", "draft"] }, dueDate: { lt: now } },
      include: {
        quotation: { select: { contact: { select: { name: true } } } },
        payments: { select: { amountMinor: true } },
      },
      orderBy: { dueDate: "asc" },
      take: 100,
    }),
    prisma.activity.findMany({
      where: { nextFollowUpAt: { lte: endOfToday } },
      include: { quotation: { select: { id: true, number: true } }, contact: { select: { id: true, name: true } } },
      orderBy: { nextFollowUpAt: "asc" },
      take: 50,
    }),
  ]);

  const notifications: AppNotification[] = [];

  for (const option of deadlines) {
    notifications.push({
      id: `ticketing-${option.id}`,
      kind: "ticketing",
      title: `Ticketing deadline for ${option.quotation.number}`,
      detail: `${option.quotation.contact.name} · ${option.label} · ${DateTime.fromJSDate(option.ticketingDeadline!)
        .setZone(appTimeZone())
        .toFormat("dd LLL yyyy, HH:mm")}`,
      href: `/quotations/${option.quotation.id}`,
      at: option.ticketingDeadline!.toISOString(),
      tone: "error",
    });
  }

  for (const quotation of expiring) {
    notifications.push({
      id: `expiring-${quotation.id}`,
      kind: "expiring",
      title: `${quotation.number} expires soon`,
      detail: `${quotation.contact.name} · valid until ${DateTime.fromJSDate(quotation.validUntil)
        .setZone(appTimeZone())
        .toFormat("dd LLL yyyy")}`,
      href: `/quotations/${quotation.id}`,
      at: quotation.validUntil.toISOString(),
      tone: "warning",
    });
  }

  for (const proforma of overdue) {
    if (!canSeeCosts) continue;
    const paid = proforma.payments.reduce((sum, payment) => sum + payment.amountMinor, 0n);
    if (proforma.totalMinor - paid <= 0n) continue;
    notifications.push({
      id: `overdue-${proforma.id}`,
      kind: "overdue",
      title: `${proforma.number} is past due`,
      detail: `${proforma.quotation.contact.name} · due ${DateTime.fromJSDate(proforma.dueDate!)
        .setZone(appTimeZone())
        .toFormat("dd LLL yyyy")}`,
      href: `/proformas/${proforma.id}`,
      at: proforma.dueDate!.toISOString(),
      tone: "error",
    });
  }

  for (const activity of followUps) {
    if (!canSeeCustomers) continue;
    notifications.push({
      id: `followup-${activity.id}`,
      kind: "followUp",
      title: "Follow-up due",
      detail: `${activity.quotation?.number ?? activity.contact?.name ?? "Activity"} · ${activity.body.slice(0, 100)}`,
      href: activity.quotationId
        ? `/quotations/${activity.quotationId}`
        : `/customers/${activity.contactId}`,
      at: activity.nextFollowUpAt!.toISOString(),
      tone: "info",
    });
  }

  return notifications.sort((a, b) => a.at.localeCompare(b.at));
}
