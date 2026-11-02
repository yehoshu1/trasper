import { lstatSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

import { ALLOWED_ATTACHMENT_TYPES, MAX_ATTACHMENT_BYTES } from "@/lib/attachments";
import { contentDisposition } from "@/lib/download";
import { hasCapability } from "@/lib/permissions";
import { getCurrentUser, sessionNeedsTwoFactorEnrolment } from "@/server/auth";
import { prisma } from "@/server/db";
import { consumeRateLimit } from "@/server/rate-limit";
import { uploadRoot } from "@/server/attachments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  if (await sessionNeedsTwoFactorEnrolment(user)) {
    return NextResponse.json({ error: "Two-factor authentication enrolment is required" }, { status: 403 });
  }
  // Attachments can contain supplier costs, so they follow the cost capability.
  if (!hasCapability(user, "viewDocuments") || !hasCapability(user, "viewCosts")) {
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  }
  const limit = consumeRateLimit(`attachment-download:${user.id}`, { limit: 200, windowMs: 60 * 60 * 1000 });
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many downloads. Try again later." }, { status: 429 });
  }

  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const attachment = await prisma.attachment.findUnique({ where: { id } });
  if (!attachment || attachment.archivedAt) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const filename = path.basename(attachment.storedPath);
  const root = uploadRoot();
  const filePath = path.join(root, filename);
  if (!filePath.startsWith(`${root}${path.sep}`)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const stats = lstatSync(filePath);
    if (stats.isSymbolicLink() || !stats.isFile() || stats.size > MAX_ATTACHMENT_BYTES) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const bytes = await readFile(filePath);
    // Never echo an arbitrary client-supplied MIME type back to the browser.
    const mimeType = ALLOWED_ATTACHMENT_TYPES[attachment.mimeType]
      ? attachment.mimeType
      : "application/octet-stream";
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": mimeType,
        "Content-Disposition": contentDisposition(attachment.originalName),
        "Content-Length": bytes.length.toString(),
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "The stored file is missing" }, { status: 410 });
  }
}
