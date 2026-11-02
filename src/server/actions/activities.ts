"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { appTimeZone, documentDateFromInput } from "@/lib/dates";
import { activitySchema } from "@/lib/schemas";
import { parseLocalWallClock } from "@/lib/time";
import { audit } from "@/server/audit";
import { prisma } from "@/server/db";
import { actionUser } from "@/server/guard";

function back(path: string, message?: string): never {
  redirect(`${path}${message ? `?error=${encodeURIComponent(message)}` : "?saved=1#history"}`);
}

/** Record a call, email, WhatsApp message, note or meeting. */
export async function createActivityAction(formData: FormData): Promise<void> {
  const idPattern = /^[A-Za-z0-9_-]{1,64}$/;
  const rawQuotationId = (formData.get("quotationId") || "").toString();
  const rawContactId = (formData.get("contactId") || "").toString();
  const quotationId = idPattern.test(rawQuotationId) ? rawQuotationId : "";
  const contactId = idPattern.test(rawContactId) ? rawContactId : "";
  const capability = quotationId ? "manageQuotations" : "manageContacts";
  const user = await actionUser(capability);

  const parsed = activitySchema.safeParse({
    quotationId: quotationId || undefined,
    contactId: contactId || undefined,
    type: formData.get("type"),
    body: formData.get("body"),
    occurredAt: formData.get("occurredAt"),
    nextFollowUpAt: formData.get("nextFollowUpAt") || "",
  });
  const fallbackPath = quotationId
    ? `/quotations/${quotationId}`
    : contactId
      ? `/customers/${contactId}`
      : "/dashboard";
  if (!parsed.success) back(fallbackPath, parsed.error.issues[0]?.message ?? "Check the activity");

  let occurredAt: Date;
  try {
    occurredAt = parseLocalWallClock(parsed.data.occurredAt, appTimeZone()).toUTC().toJSDate();
  } catch {
    back(fallbackPath, "Enter a valid date and time");
  }
  const nextFollowUpAt = parsed.data.nextFollowUpAt
    ? documentDateFromInput(parsed.data.nextFollowUpAt)
    : null;

  if (quotationId) {
    const quotation = await prisma.quotation.findUnique({ where: { id: quotationId } });
    if (!quotation) back("/quotations", "Quotation not found");
    if (!contactId) {
      await prisma.$transaction(async (tx) => {
        const activity = await tx.activity.create({
          data: {
            quotationId,
            contactId: quotation.contactId,
            type: parsed.data.type,
            body: parsed.data.body,
            occurredAt,
            nextFollowUpAt,
            userId: user.id,
          },
        });
        await audit(tx, {
          userId: user.id,
          action: "recordActivity",
          entity: "Quotation",
          entityId: quotationId,
          after: {
            activityId: activity.id,
            type: activity.type,
            occurredAt,
            nextFollowUpAt,
          },
        });
      });
    } else {
      await prisma.$transaction(async (tx) => {
        const activity = await tx.activity.create({
          data: {
            quotationId,
            contactId,
            type: parsed.data.type,
            body: parsed.data.body,
            occurredAt,
            nextFollowUpAt,
            userId: user.id,
          },
        });
        await audit(tx, {
          userId: user.id,
          action: "recordActivity",
          entity: "Quotation",
          entityId: quotationId,
          after: { activityId: activity.id, type: activity.type, occurredAt, nextFollowUpAt },
        });
      });
    }
  } else {
    const contact = contactId
      ? await prisma.contact.findUnique({ where: { id: contactId } })
      : null;
    if (!contact) back("/customers", "Customer not found");
    await prisma.$transaction(async (tx) => {
      const activity = await tx.activity.create({
        data: {
          contactId,
          type: parsed.data.type,
          body: parsed.data.body,
          occurredAt,
          nextFollowUpAt,
          userId: user.id,
        },
      });
      await audit(tx, {
        userId: user.id,
        action: "recordActivity",
        entity: "Contact",
        entityId: contactId,
        after: { activityId: activity.id, type: activity.type, occurredAt, nextFollowUpAt },
      });
    });
  }

  revalidatePath(fallbackPath);
  back(fallbackPath);
}
