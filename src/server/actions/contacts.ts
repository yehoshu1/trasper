"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import {
  contactSchema,
  contactUpdateSchema,
  passengerSchema,
  passengerUpdateSchema,
} from "@/lib/schemas";
import { parseContactCsv } from "@/lib/csv";
import { STALE_VERSION_MESSAGE } from "@/lib/locking";
import { audit } from "@/server/audit";
import { actionUser } from "@/server/guard";
import { prisma } from "@/server/db";
import { actionError, actionOk, errorMessage, type ActionResult } from "@/server/actions/types";

function fail(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

function saved(path: string): never {
  revalidatePath(path);
  redirect(`${path}?saved=1`);
}

export async function createContactAction(formData: FormData): Promise<void> {
  const user = await actionUser("manageContacts");
  const parsed = contactSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) fail("/customers/new", parsed.error.issues[0]?.message ?? "Check the form");
  const data = parsed.data;

  const possibleDuplicate = await prisma.contact.findFirst({
    where: {
      archivedAt: null,
      OR: [
        { name: { equals: data.name } },
        ...(data.email ? [{ email: { equals: data.email } }] : []),
        ...(data.phone ? [{ phone: { equals: data.phone } }] : []),
      ],
    },
  });

  const created = await prisma.$transaction(async (tx) => {
    const contact = await tx.contact.create({
      data: {
        name: data.name,
        type: data.type,
        attention: data.attention,
        poBox: data.poBox,
        city: data.city,
        country: data.country,
        physicalAddress: data.physicalAddress,
        email: data.email || undefined,
        phone: data.phone,
        notes: data.notes,
      },
    });
    await audit(tx, {
      userId: user.id,
      action: "createContact",
      entity: "Contact",
      entityId: contact.id,
      after: contact,
    });
    return contact;
  });

  revalidatePath("/customers");
  redirect(`/customers/${created.id}${possibleDuplicate ? "?duplicate=1" : ""}`);
}

export async function updateContactAction(formData: FormData): Promise<void> {
  const user = await actionUser("manageContacts");
  const parsed = contactUpdateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) fail("/customers", parsed.error.issues[0]?.message ?? "Check the form");

  const before = await prisma.contact.findUnique({ where: { id: parsed.data.id } });
  if (!before) fail("/customers", "Customer not found");

  const data = parsed.data;
  let updated;
  try {
    updated = await prisma.$transaction(async (tx) => {
      const claimed = await tx.contact.updateMany({
        where: { id: data.id, version: data.version },
        data: {
          name: data.name,
          type: data.type,
          attention: data.attention,
          poBox: data.poBox,
          city: data.city,
          country: data.country,
          physicalAddress: data.physicalAddress,
          email: data.email || null,
          phone: data.phone,
          notes: data.notes,
          version: { increment: 1 },
        },
      });
      if (claimed.count === 0) throw new Error(STALE_VERSION_MESSAGE);
      const contact = await tx.contact.findUniqueOrThrow({ where: { id: data.id } });
      await audit(tx, {
        userId: user.id,
        action: "updateContact",
        entity: "Contact",
        entityId: contact.id,
        before,
        after: contact,
      });
      return contact;
    });
  } catch (error) {
    fail(`/customers/${data.id}/edit`, errorMessage(error));
  }
  saved(`/customers/${updated.id}`);
}

export async function archiveContactAction(formData: FormData): Promise<void> {
  const user = await actionUser("manageContacts");
  const id = z.string().min(1).max(64).safeParse(formData.get("id"));
  if (!id.success) fail("/customers", "Invalid customer");
  const before = await prisma.contact.findUnique({ where: { id: id.data } });
  if (!before) fail("/customers", "Customer not found");
  await prisma.$transaction(async (tx) => {
    const contact = await tx.contact.update({
      where: { id: before.id },
      data: { archivedAt: new Date(), version: { increment: 1 } },
    });
    await audit(tx, {
      userId: user.id,
      action: "archiveContact",
      entity: "Contact",
      entityId: contact.id,
      before: { archivedAt: before.archivedAt },
      after: { archivedAt: contact.archivedAt },
    });
  });
  saved(`/customers/${before.id}`);
}

export async function deleteContactAction(formData: FormData): Promise<void> {
  const user = await actionUser("manageContacts");
  const id = z.string().min(1).max(64).safeParse(formData.get("id"));
  if (!id.success) fail("/customers", "Invalid customer");
  const before = await prisma.contact.findUnique({ where: { id: id.data } });
  if (!before) fail("/customers", "Customer not found");

  await prisma
    .$transaction(async (tx) => {
      // Re-check inside the transaction. A customer with a quotation or
      // itinerary is history and must be archived, never hard-deleted.
      const [quotations, itineraries] = await Promise.all([
        tx.quotation.count({ where: { contactId: before.id } }),
        tx.itinerary.count({ where: { contactId: before.id } }),
      ]);
      if (quotations > 0 || itineraries > 0) {
        throw new Error("This customer has documents. Archive it instead.");
      }
      await tx.contact.update({
        where: { id: before.id },
        data: { passengers: { set: [] } },
      });
      await tx.contact.delete({ where: { id: before.id } });
      await audit(tx, {
        userId: user.id,
        action: "deleteContact",
        entity: "Contact",
        entityId: before.id,
        before: {
          name: before.name,
          type: before.type,
          email: before.email,
          phone: before.phone,
          archivedAt: before.archivedAt,
        },
        after: null,
      });
    })
    .catch((error) => fail(`/customers/${before.id}`, errorMessage(error)));

  revalidatePath("/customers");
  redirect("/customers?deleted=1");
}

export async function unarchiveContactAction(formData: FormData): Promise<void> {
  const user = await actionUser("manageContacts");
  const id = z.string().min(1).max(64).safeParse(formData.get("id"));
  if (!id.success) fail("/customers", "Invalid customer");
  const before = await prisma.contact.findUnique({ where: { id: id.data } });
  if (!before) fail("/customers", "Customer not found");
  await prisma.$transaction(async (tx) => {
    const contact = await tx.contact.update({
      where: { id: before.id },
      data: { archivedAt: null, version: { increment: 1 } },
    });
    await audit(tx, {
      userId: user.id,
      action: "unarchiveContact",
      entity: "Contact",
      entityId: contact.id,
      before: { archivedAt: before.archivedAt },
      after: { archivedAt: null },
    });
  });
  saved(`/customers/${before.id}`);
}

export async function linkPassengerAction(formData: FormData): Promise<void> {
  const user = await actionUser("manageContacts");
  const schema = z.object({
    contactId: z.string().min(1).max(64),
    passengerId: z.string().min(1).max(64),
  });
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) fail("/customers", "Choose a passenger");
  const { contactId, passengerId } = parsed.data;
  const contact = await prisma.contact.findUnique({ where: { id: contactId } });
  if (!contact) fail("/customers", "Customer not found");
  await prisma.$transaction(async (tx) => {
    await tx.contact.update({
      where: { id: contactId },
      data: { passengers: { connect: { id: passengerId } }, version: { increment: 1 } },
    });
    await audit(tx, {
      userId: user.id,
      action: "linkPassenger",
      entity: "Contact",
      entityId: contactId,
      after: { passengerId },
    });
  });
  revalidatePath(`/customers/${contactId}`);
  redirect(`/customers/${contactId}?saved=1`);
}

export async function unlinkPassengerAction(formData: FormData): Promise<void> {
  const user = await actionUser("manageContacts");
  const schema = z.object({
    contactId: z.string().min(1).max(64),
    passengerId: z.string().min(1).max(64),
  });
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) fail("/customers", "Invalid link");
  const { contactId, passengerId } = parsed.data;
  await prisma.$transaction(async (tx) => {
    await tx.contact.update({
      where: { id: contactId },
      data: { passengers: { disconnect: { id: passengerId } }, version: { increment: 1 } },
    });
    await audit(tx, {
      userId: user.id,
      action: "unlinkPassenger",
      entity: "Contact",
      entityId: contactId,
      before: { passengerId },
    });
  });
  revalidatePath(`/customers/${contactId}`);
  redirect(`/customers/${contactId}?saved=1`);
}

export async function createPassengerAction(formData: FormData): Promise<void> {
  const user = await actionUser("manageContacts");
  const rawContactId = formData.get("contactId")?.toString() ?? "";
  const contactId = /^[A-Za-z0-9_-]{1,64}$/.test(rawContactId) ? rawContactId : "";
  const parsed = passengerSchema.safeParse({
    title: formData.get("title") ?? "",
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    type: formData.get("type"),
  });
  if (!parsed.success) {
    fail(contactId ? `/customers/${contactId}` : "/passengers", parsed.error.issues[0]?.message ?? "Check the form");
  }
  const created = await prisma.$transaction(async (tx) => {
    const passenger = await tx.passenger.create({
      data: {
        title: parsed.data.title,
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        type: parsed.data.type,
        contacts: contactId ? { connect: { id: contactId } } : undefined,
      },
    });
    await audit(tx, {
      userId: user.id,
      action: "createPassenger",
      entity: "Passenger",
      entityId: passenger.id,
      after: passenger,
    });
    return passenger;
  });
  const path = contactId ? `/customers/${contactId}` : "/passengers";
  revalidatePath(path);
  redirect(`${path}?saved=1&passenger=${created.id}`);
}

export async function updatePassengerAction(formData: FormData): Promise<void> {
  const user = await actionUser("manageContacts");
  const parsed = passengerUpdateSchema.safeParse({
    id: formData.get("id"),
    version: formData.get("version"),
    title: formData.get("title") ?? "",
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    type: formData.get("type"),
  });
  if (!parsed.success) {
    const id = z.string().min(1).max(64).safeParse(formData.get("id"));
    fail(
      id.success ? `/passengers/${id.data}/edit` : "/passengers",
      parsed.error.issues[0]?.message ?? "Check the form",
    );
  }
  const before = await prisma.passenger.findUnique({ where: { id: parsed.data.id } });
  if (!before) fail("/passengers", "Passenger not found");

  try {
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.passenger.updateMany({
        where: { id: parsed.data.id, version: parsed.data.version },
        data: {
          title: parsed.data.title,
          firstName: parsed.data.firstName,
          lastName: parsed.data.lastName,
          type: parsed.data.type,
          version: { increment: 1 },
        },
      });
      if (claimed.count === 0) throw new Error(STALE_VERSION_MESSAGE);
      const passenger = await tx.passenger.findUniqueOrThrow({ where: { id: parsed.data.id } });
      await audit(tx, {
        userId: user.id,
        action: "updatePassenger",
        entity: "Passenger",
        entityId: passenger.id,
        before,
        after: passenger,
      });
    });
  } catch (error) {
    fail(`/passengers/${parsed.data.id}/edit`, errorMessage(error));
  }
  saved(`/passengers/${parsed.data.id}`);
}

export async function archivePassengerAction(formData: FormData): Promise<void> {
  const user = await actionUser("manageContacts");
  const id = z.string().min(1).max(64).safeParse(formData.get("id"));
  if (!id.success) fail("/passengers", "Invalid passenger");
  const before = await prisma.passenger.findUnique({ where: { id: id.data } });
  if (!before) fail("/passengers", "Passenger not found");
  await prisma.$transaction(async (tx) => {
    const passenger = await tx.passenger.update({
      where: { id: before.id },
      data: { archivedAt: new Date(), version: { increment: 1 } },
    });
    await audit(tx, {
      userId: user.id,
      action: "archivePassenger",
      entity: "Passenger",
      entityId: passenger.id,
      before: { archivedAt: before.archivedAt },
      after: { archivedAt: passenger.archivedAt },
    });
  });
  saved(`/passengers/${id.data}`);
}

export async function deletePassengerAction(formData: FormData): Promise<void> {
  const user = await actionUser("manageContacts");
  const id = z.string().min(1).max(64).safeParse(formData.get("id"));
  if (!id.success) fail("/passengers", "Invalid passenger");
  const before = await prisma.passenger.findUnique({ where: { id: id.data } });
  if (!before) fail("/passengers", "Passenger not found");

  await prisma
    .$transaction(async (tx) => {
      // A passenger priced on a quotation is part of that document's history.
      const fares = await tx.fareLine.count({ where: { passengerId: before.id } });
      if (fares > 0) throw new Error("This passenger is priced on a quotation. Archive it instead.");
      await tx.passenger.update({
        where: { id: before.id },
        data: { contacts: { set: [] } },
      });
      await tx.passenger.delete({ where: { id: before.id } });
      await audit(tx, {
        userId: user.id,
        action: "deletePassenger",
        entity: "Passenger",
        entityId: before.id,
        before: {
          title: before.title,
          firstName: before.firstName,
          lastName: before.lastName,
          type: before.type,
          archivedAt: before.archivedAt,
        },
        after: null,
      });
    })
    .catch((error) => fail(`/passengers/${before.id}`, errorMessage(error)));

  revalidatePath("/passengers");
  redirect("/passengers?deleted=1");
}

export async function unarchivePassengerAction(formData: FormData): Promise<void> {
  const user = await actionUser("manageContacts");
  const id = z.string().min(1).max(64).safeParse(formData.get("id"));
  if (!id.success) fail("/passengers", "Invalid passenger");
  const before = await prisma.passenger.findUnique({ where: { id: id.data } });
  if (!before) fail("/passengers", "Passenger not found");
  await prisma.$transaction(async (tx) => {
    const passenger = await tx.passenger.update({
      where: { id: before.id },
      data: { archivedAt: null, version: { increment: 1 } },
    });
    await audit(tx, {
      userId: user.id,
      action: "unarchivePassenger",
      entity: "Passenger",
      entityId: passenger.id,
      before: { archivedAt: before.archivedAt },
      after: { archivedAt: null },
    });
  });
  saved(`/passengers/${id.data}`);
}

/** Preview an import without writing anything. */
export async function previewContactsCsvAction(csv: string): Promise<{
  ok: boolean;
  error?: string;
  columns: string[];
  unknownHeaders: string[];
  rows: { line: number; name: string; email: string; city: string; errors: string[]; duplicate: boolean }[];
  validCount: number;
}> {
  try {
    await actionUser("manageContacts");
    const parsed = parseContactCsv(csv);
    if (parsed.truncated) {
      return {
        ok: false,
        error: "The file has too many rows. Import at most 5,000 customers at a time.",
        columns: Object.keys(parsed.columns),
        unknownHeaders: parsed.unknownHeaders,
        rows: [],
        validCount: 0,
      };
    }
    if (!parsed.columns.name) {
      return {
        ok: false,
        error: "The file needs a Name column",
        columns: Object.keys(parsed.columns),
        unknownHeaders: parsed.unknownHeaders,
        rows: [],
        validCount: 0,
      };
    }

    const existing = await prisma.contact.findMany({
      select: { name: true, email: true, phone: true },
    });
    const keys = new Set<string>();
    for (const contact of existing) {
      keys.add(contact.name.trim().toLowerCase());
      if (contact.email) keys.add(`e:${contact.email.toLowerCase()}`);
      if (contact.phone) keys.add(`p:${contact.phone.replace(/\s/g, "")}`);
    }

    const rows = parsed.rows.map((row) => {
      const values = row.values;
      const duplicate = Boolean(
        (values.name && keys.has(values.name.trim().toLowerCase())) ||
          (values.email && keys.has(`e:${values.email.toLowerCase()}`)) ||
          (values.phone && keys.has(`p:${values.phone.replace(/\s/g, "")}`)),
      );
      return {
        line: row.line,
        name: values.name ?? "",
        email: values.email ?? "",
        city: values.city ?? "",
        errors: row.errors,
        duplicate,
      };
    });

    return {
      ok: true,
      columns: Object.keys(parsed.columns),
      unknownHeaders: parsed.unknownHeaders,
      rows,
      validCount: rows.filter((row) => row.errors.length === 0).length,
    };
  } catch (error) {
    return {
      ok: false,
      error: errorMessage(error),
      columns: [],
      unknownHeaders: [],
      rows: [],
      validCount: 0,
    };
  }
}

export async function importContactsCsvAction(csv: string, includeDuplicates: boolean): Promise<ActionResult> {
  try {
    const user = await actionUser("manageContacts");
    const parsed = parseContactCsv(csv);
    if (parsed.truncated) {
      return actionError("The file has too many rows. Import at most 5,000 customers at a time.");
    }
    if (!parsed.columns.name) return actionError("The file needs a Name column");

    const existing = await prisma.contact.findMany({ select: { name: true, email: true, phone: true } });
    const keys = new Set<string>();
    for (const contact of existing) {
      keys.add(contact.name.trim().toLowerCase());
      if (contact.email) keys.add(`e:${contact.email.toLowerCase()}`);
      if (contact.phone) keys.add(`p:${contact.phone.replace(/\s/g, "")}`);
    }

    let imported = 0;
    let skipped = 0;
    for (const row of parsed.rows) {
      if (row.errors.length > 0) {
        skipped += 1;
        continue;
      }
      const values = row.values;
      const duplicate = Boolean(
        (values.name && keys.has(values.name.trim().toLowerCase())) ||
          (values.email && keys.has(`e:${values.email.toLowerCase()}`)) ||
          (values.phone && keys.has(`p:${values.phone.replace(/\s/g, "")}`)),
      );
      if (duplicate && !includeDuplicates) {
        skipped += 1;
        continue;
      }
      await prisma.$transaction(async (tx) => {
        const contact = await tx.contact.create({
          data: {
            name: values.name ?? "",
            type: (values.type ?? "").toLowerCase() === "individual" ? "individual" : "organisation",
            attention: values.attention,
            poBox: values.poBox,
            city: values.city,
            country: values.country,
            physicalAddress: values.physicalAddress,
            email: values.email,
            phone: values.phone,
            notes: values.notes,
          },
        });
        await audit(tx, {
          userId: user.id,
          action: "importContact",
          entity: "Contact",
          entityId: contact.id,
          after: contact,
        });
      });
      imported += 1;
    }
    revalidatePath("/customers");
    return actionOk(`Imported ${imported} contact${imported === 1 ? "" : "s"}; skipped ${skipped}.`);
  } catch (error) {
    return actionError(errorMessage(error));
  }
}
