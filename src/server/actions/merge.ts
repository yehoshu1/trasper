"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { mergeContactSchema, mergePassengerSchema } from "@/lib/schemas";
import { audit } from "@/server/audit";
import { prisma } from "@/server/db";
import { actionUser } from "@/server/guard";
import { actionError, actionOk, errorMessage, type ActionResult } from "@/server/actions/types";

/**
 * Merge duplicates without losing history .
 *
 * The survivor keeps its id; everything that referenced the loser is
 * re-pointed, then the loser is archived. Nothing is hard-deleted because a
 * document may already reference either side. Both ids are audited.
 */

export async function mergeContactAction(input: {
  survivorId: string;
  loserId: string;
}): Promise<ActionResult> {
  try {
    const user = await actionUser("manageContacts");
    const parsed = mergeContactSchema.safeParse(input);
    if (!parsed.success) return actionError("Choose two different customers");
    const { survivorId, loserId } = parsed.data;
    if (survivorId === loserId) return actionError("Choose two different customers");

    const [survivor, loser] = await Promise.all([
      prisma.contact.findUnique({ where: { id: survivorId }, include: { passengers: true } }),
      prisma.contact.findUnique({
        where: { id: loserId },
        include: {
          passengers: true,
          _count: { select: { quotations: true, activities: true } },
        },
      }),
    ]);
    if (!survivor) return actionError("The surviving customer was not found");
    if (!loser) return actionError("The duplicate customer was not found");
    if (survivor.archivedAt) return actionError("Unarchive the surviving customer first");
    if (loser.archivedAt) return actionError("That customer is already archived");

    await prisma.$transaction(async (tx) => {
      const quotations = await tx.quotation.updateMany({
        where: { contactId: loserId },
        data: { contactId: survivorId },
      });
      await tx.activity.updateMany({
        where: { contactId: loserId },
        data: { contactId: survivorId },
      });

      const existingPassengers = new Set(survivor.passengers.map((passenger) => passenger.id));
      for (const passenger of loser.passengers) {
        if (!existingPassengers.has(passenger.id)) {
          await tx.contact.update({
            where: { id: survivorId },
            data: { passengers: { connect: { id: passenger.id } } },
          });
        }
      }
      await tx.contact.update({
        where: { id: loserId },
        data: { passengers: { set: [] } },
      });

      const mergedNotes = [survivor.notes, loser.notes].filter(Boolean).join("\n\n");
      const updated = await tx.contact.update({
        where: { id: survivorId },
        data: {
          name: survivor.name,
          attention: survivor.attention ?? loser.attention,
          email: survivor.email ?? loser.email,
          phone: survivor.phone ?? loser.phone,
          city: survivor.city ?? loser.city,
          country: survivor.country ?? loser.country,
          poBox: survivor.poBox ?? loser.poBox,
          physicalAddress: survivor.physicalAddress ?? loser.physicalAddress,
          notes: mergedNotes || null,
          version: { increment: 1 },
        },
      });
      const archived = await tx.contact.update({
        where: { id: loserId },
        data: { archivedAt: new Date(), version: { increment: 1 } },
      });

      await audit(tx, {
        userId: user.id,
        action: "mergeContact",
        entity: "Contact",
        entityId: survivorId,
        before: { survivor, loser: { id: loserId, name: loser.name } },
        after: {
          survivorId,
          loserId,
          quotationsRePointed: quotations.count,
          passengersLinked: loser.passengers.length,
          mergedNotes: Boolean(mergedNotes),
          version: updated.version,
        },
      });
      await audit(tx, {
        userId: user.id,
        action: "mergedInto",
        entity: "Contact",
        entityId: loserId,
        before: { id: loserId, name: loser.name, archivedAt: null },
        after: { survivorId, survivorName: survivor.name, archivedAt: archived.archivedAt },
      });
    });

    revalidatePath("/customers");
    revalidatePath(`/customers/${survivorId}`);
    revalidatePath(`/customers/${loserId}`);
    return actionOk(`${loser.name} was merged into ${survivor.name} and archived`);
  } catch (error) {
    return actionError(errorMessage(error));
  }
}

export async function mergePassengerAction(input: {
  survivorId: string;
  loserId: string;
}): Promise<ActionResult> {
  try {
    const user = await actionUser("manageContacts");
    const parsed = mergePassengerSchema.safeParse(input);
    if (!parsed.success) return actionError("Choose two different passengers");
    const { survivorId, loserId } = parsed.data;
    if (survivorId === loserId) return actionError("Choose two different passengers");

    const [survivor, loser] = await Promise.all([
      prisma.passenger.findUnique({
        where: { id: survivorId },
        include: { contacts: true },
      }),
      prisma.passenger.findUnique({
        where: { id: loserId },
        include: {
          contacts: true,
          fares: { select: { id: true, optionId: true } },
          _count: { select: { fares: true } },
        },
      }),
    ]);
    if (!survivor) return actionError("The surviving passenger was not found");
    if (!loser) return actionError("The duplicate passenger was not found");
    if (survivor.archivedAt) return actionError("Unarchive the surviving passenger first");
    if (loser.archivedAt) return actionError("That passenger is already archived");

    // Two priced passengers in one option cannot silently become one line:
    // the money would change. Leave that merge to a human editing the fares.
    const survivorFares = await prisma.fareLine.findMany({
      where: { passengerId: survivorId },
      select: { optionId: true },
    });
    const survivorOptionIds = new Set(survivorFares.map((fare) => fare.optionId));
    const conflict = loser.fares.some((fare) => survivorOptionIds.has(fare.optionId));
    if (conflict) {
      return actionError(
        "Both passengers are priced in the same option. Edit those fare lines before merging.",
      );
    }

    await prisma.$transaction(async (tx) => {
      const fares = await tx.fareLine.updateMany({
        where: { passengerId: loserId },
        data: { passengerId: survivorId },
      });
      const existingContacts = new Set(survivor.contacts.map((contact) => contact.id));
      for (const contact of loser.contacts) {
        if (!existingContacts.has(contact.id)) {
          await tx.passenger.update({
            where: { id: survivorId },
            data: { contacts: { connect: { id: contact.id } } },
          });
        }
      }
      await tx.passenger.update({
        where: { id: loserId },
        data: { contacts: { set: [] }, archivedAt: new Date(), version: { increment: 1 } },
      });
      await tx.passenger.update({
        where: { id: survivorId },
        data: { version: { increment: 1 } },
      });
      await audit(tx, {
        userId: user.id,
        action: "mergePassenger",
        entity: "Passenger",
        entityId: survivorId,
        before: { survivorId, survivor: survivor.firstName + " " + survivor.lastName },
        after: {
          loserId,
          loser: loser.firstName + " " + loser.lastName,
          faresRePointed: fares.count,
          contactsLinked: loser.contacts.length,
        },
      });
      await audit(tx, {
        userId: user.id,
        action: "mergedInto",
        entity: "Passenger",
        entityId: loserId,
        before: { id: loserId, archivedAt: null },
        after: { survivorId, archivedAt: new Date() },
      });
    });

    revalidatePath("/passengers");
    revalidatePath(`/passengers/${survivorId}`);
    revalidatePath(`/passengers/${loserId}`);
    return actionOk("Passenger merged and the duplicate archived");
  } catch (error) {
    return actionError(errorMessage(error));
  }
}

export async function mergeContactFormAction(formData: FormData): Promise<void> {
  const result = await mergeContactAction({
    survivorId: String(formData.get("survivorId") ?? ""),
    loserId: String(formData.get("loserId") ?? ""),
  });
  if (!result.ok) {
    redirect(`/customers/merge?error=${encodeURIComponent(result.error ?? "Could not merge")}`);
  }
  redirect(`/customers/${formData.get("survivorId")}?merged=1`);
}

export async function mergePassengerFormAction(formData: FormData): Promise<void> {
  const result = await mergePassengerAction({
    survivorId: String(formData.get("survivorId") ?? ""),
    loserId: String(formData.get("loserId") ?? ""),
  });
  if (!result.ok) {
    redirect(`/passengers/merge?error=${encodeURIComponent(result.error ?? "Could not merge")}`);
  }
  redirect(`/passengers/${formData.get("survivorId")}?merged=1`);
}
