import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

import { detectImageMime } from "@/lib/image-signature";
import { audit } from "@/server/audit";
import { getCurrentUser, sessionNeedsTwoFactorEnrolment } from "@/server/auth";
import { prisma } from "@/server/db";
import { requestIsSameOrigin } from "@/server/http";
import { consumeRateLimit } from "@/server/rate-limit";

export const dynamic = "force-dynamic";

const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
};

/** POST a profile photo for the signed-in user (PNG, JPEG or WebP, max 2 MB). */
export async function POST(request: Request) {
  if (!requestIsSameOrigin(request)) {
    return NextResponse.json({ error: "Cross-origin upload rejected" }, { status: 403 });
  }
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  if (await sessionNeedsTwoFactorEnrolment(user)) {
    return NextResponse.json({ error: "Two-factor authentication enrolment is required" }, { status: 403 });
  }
  const limit = consumeRateLimit(`avatar-upload:${user.id}`, { limit: 10, windowMs: 60 * 60 * 1000 });
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many uploads. Try again later." }, { status: 429 });
  }

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BYTES + 64 * 1024) {
    return NextResponse.json({ error: "Image must be 2 MB or smaller" }, { status: 413 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Send the image as multipart form data" }, { status: 400 });
  }
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Choose a file" }, { status: 400 });
  }
  if (!ALLOWED[file.type]) {
    return NextResponse.json({ error: "Use a PNG, JPEG or WebP image" }, { status: 415 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Image must be 2 MB or smaller" }, { status: 413 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.length > MAX_BYTES) {
    return NextResponse.json({ error: "Image must be 2 MB or smaller" }, { status: 413 });
  }
  if (detectImageMime(bytes) !== file.type) {
    return NextResponse.json(
      { error: "The file content is not a valid PNG, JPEG or WebP image" },
      { status: 415 },
    );
  }

  const dir = path.resolve(process.env.UPLOAD_DIR ?? "./uploads", "avatars");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const name = `${user.id}-${randomUUID()}${ALLOWED[file.type]}`;
  writeFileSync(path.join(dir, name), bytes, { mode: 0o600, flag: "wx" });
  const url = `/uploads/avatars/${name}`;

  try {
    await prisma.$transaction(async (tx) => {
      const before = await tx.user.findUnique({ where: { id: user.id }, select: { image: true } });
      await tx.user.update({ where: { id: user.id }, data: { image: url } });
      await audit(tx, {
        userId: user.id,
        action: "updateAvatar",
        entity: "User",
        entityId: user.id,
        before,
        after: { image: url },
      });
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save the photo" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, url });
}
