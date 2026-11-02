/**
 * Attachment validation. Type and size are checked on
 * the server before anything is written; downloads re-check the role.
 */

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_ATTACHMENT_NAME_LENGTH = 255;

export const ALLOWED_ATTACHMENT_TYPES: Record<string, string[]> = {
  "application/pdf": [".pdf"],
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/webp": [".webp"],
  "text/plain": [".txt", ".log"],
  "text/csv": [".csv"],
  "message/rfc822": [".eml"],
  "application/msword": [".doc"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "application/vnd.ms-excel": [".xls"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
  "application/zip": [".zip"],
};

export interface AttachmentValidation {
  ok: boolean;
  error?: string;
  safeName?: string;
  extension?: string;
}

export function safeAttachmentName(original: string): string {
  const base = original.replace(/\\/g, "/").split("/").pop() ?? "attachment";
  const cleaned = base
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(-120);
  return cleaned || "attachment";
}

export function validateAttachment(input: {
  name: string;
  type: string;
  size: number;
}): AttachmentValidation {
  if (!input.name.trim()) return { ok: false, error: "Choose a file" };
  if (input.name.length > MAX_ATTACHMENT_NAME_LENGTH) {
    return { ok: false, error: "The file name is too long" };
  }
  if (/[\u0000-\u001f\u007f]/.test(input.name)) {
    return { ok: false, error: "The file name contains invalid characters" };
  }
  if (input.size <= 0) return { ok: false, error: "The file is empty" };
  if (input.size > MAX_ATTACHMENT_BYTES) {
    return { ok: false, error: `Files must be 10 MB or smaller` };
  }
  const safeName = safeAttachmentName(input.name);
  const dot = safeName.lastIndexOf(".");
  const extension = dot >= 0 ? safeName.slice(dot).toLowerCase() : "";
  const allowedExtensions = ALLOWED_ATTACHMENT_TYPES[input.type];
  if (!allowedExtensions) {
    return { ok: false, error: `That file type (${input.type || "unknown"}) is not allowed` };
  }
  if (!allowedExtensions.includes(extension)) {
    return {
      ok: false,
      error: `The file extension ${extension || "(none)"} does not match its type ${input.type}`,
    };
  }
  return { ok: true, safeName, extension };
}

export function attachmentStorageName(original: string, id: string): string {
  return `${id}-${safeAttachmentName(original)}`;
}
