"use server";

import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import {
  MAX_ATTACHMENT_BYTES,
  validateAttachment,
  attachmentStorageName,
} from "@/lib/attachments";
import { audit } from "@/server/audit";
import { uploadRoot } from "@/server/attachments";
import { prisma } from "@/server/db";
import { actionUser } from "@/server/guard";
import { consumeRateLimit } from "@/server/rate-limit";

function redirectBack(quotationId: string, proformaId: string, message?: string): never {
  if (quotationId) {
    redirect(`/quotations/${quotationId}${message ? `?error=${encodeURIComponent(message)}` : "?saved=1"}`);
  }
  redirect(`/proformas/${proformaId}${message ? `?error=${encodeURIComponent(message)}` : "?saved=1"}`);
}

const idPattern = /^[A-Za-z0-9_-]{1,64}$/;

function formId(formData: FormData, name: string): string {
  const value = String(formData.get(name) ?? "");
  return idPattern.test(value) ? value : "";
}

export async function uploadAttachmentAction(formData: FormData): Promise<void> {
  const user = await actionUser("manageDocuments");
  const quotationId = formId(formData, "quotationId");
  const proformaId = formId(formData, "proformaId");
  if (!quotationId && !proformaId) {
    redirect("/quotations?error=Choose%20a%20document%20first");
  }
  const limit = consumeRateLimit(`attachment-upload:${user.id}`, {
    limit: 100,
    windowMs: 60 * 60 * 1000,
  });
  if (!limit.allowed) {
    redirectBack(quotationId, proformaId, "Too many uploads. Try again later.");
  }
  if (quotationId && proformaId) {
    redirectBack(quotationId, proformaId, "Attach the file to one document only");
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    redirectBack(quotationId, proformaId, "Choose a file to attach");
  }
  const validation = validateAttachment({ name: file.name, type: file.type, size: file.size });
  if (!validation.ok) redirectBack(quotationId, proformaId, validation.error ?? "Invalid file");

  if (quotationId) {
    const quotation = await prisma.quotation.findUnique({ where: { id: quotationId } });
    if (!quotation) redirect("/quotations?error=Quotation%20not%20found");
  }
  if (proformaId) {
    const proforma = await prisma.proforma.findUnique({ where: { id: proformaId } });
    if (!proforma) redirect("/proformas?error=Pro%20forma%20not%20found");
  }

  const id = randomUUID();
  const filename = attachmentStorageName(file.name, id);
  const root = uploadRoot();
  await mkdir(root, { recursive: true, mode: 0o700 });
  const storedPath = path.join(root, filename);
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.length > MAX_ATTACHMENT_BYTES) {
    redirectBack(quotationId, proformaId, "Files must be 10 MB or smaller");
  }
  await writeFile(storedPath, bytes, { mode: 0o600, flag: "wx" });

  try {
    await prisma.$transaction(async (tx) => {
      const attachment = await tx.attachment.create({
        data: {
          quotationId: quotationId || null,
          proformaId: proformaId || null,
          filename,
          originalName: validation.safeName ?? "attachment",
          mimeType: file.type,
          sizeBytes: bytes.length,
          storedPath: filename,
          uploadedById: user.id,
        },
      });
      await audit(tx, {
        userId: user.id,
        action: "uploadAttachment",
        entity: quotationId ? "Quotation" : "Proforma",
        entityId: quotationId || proformaId,
        after: {
          attachmentId: attachment.id,
          originalName: attachment.originalName,
          mimeType: attachment.mimeType,
          sizeBytes: attachment.sizeBytes,
        },
      });
    });
  } catch (error) {
    await unlink(storedPath).catch(() => undefined);
    throw error;
  }

  revalidatePath(`/quotations/${quotationId}`);
  revalidatePath(`/proformas/${proformaId}`);
  redirectBack(quotationId, proformaId);
}

export async function archiveAttachmentAction(formData: FormData): Promise<void> {
  const user = await actionUser("manageDocuments");
  const id = z.string().min(1).max(64).safeParse(formData.get("id"));
  if (!id.success) redirect("/quotations?error=Invalid%20attachment");
  const before = await prisma.attachment.findUnique({ where: { id: id.data } });
  if (!before) redirect("/quotations?error=Attachment%20not%20found");
  await prisma.$transaction(async (tx) => {
    const attachment = await tx.attachment.update({
      where: { id: before.id },
      data: { archivedAt: new Date() },
    });
    await audit(tx, {
      userId: user.id,
      action: "archiveAttachment",
      entity: "Attachment",
      entityId: attachment.id,
      before: { archivedAt: before.archivedAt },
      after: { archivedAt: attachment.archivedAt },
    });
  });
  if (before.quotationId) revalidatePath(`/quotations/${before.quotationId}`);
  if (before.proformaId) revalidatePath(`/proformas/${before.proformaId}`);
  redirectBack(before.quotationId ?? "", before.proformaId ?? "");
}
