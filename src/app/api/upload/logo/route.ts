import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

import { detectImageMime } from "@/lib/image-signature";
import { hasCapability } from "@/lib/permissions";
import { audit } from "@/server/audit";
import { getCurrentUser, sessionNeedsTwoFactorEnrolment } from "@/server/auth";
import { prisma, jsonSafe } from "@/server/db";
import { requestIsSameOrigin } from "@/server/http";
import { consumeRateLimit } from "@/server/rate-limit";
import { getSettings, saveSettings } from "@/server/settings";

export const dynamic = "force-dynamic";

const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
};

/** POST a logo image (type and size limited). Admin only. */
export async function POST(request: Request) {
  if (!requestIsSameOrigin(request)) {
    return NextResponse.json({ error: "Cross-origin upload rejected" }, { status: 403 });
  }
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  if (await sessionNeedsTwoFactorEnrolment(user)) {
    return NextResponse.json({ error: "Two-factor authentication enrolment is required" }, { status: 403 });
  }
  if (!hasCapability(user, "manageSettings")) {
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  }
  const limit = consumeRateLimit(`logo-upload:${user.id}`, { limit: 30, windowMs: 60 * 60 * 1000 });
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
  const airlineRaw = formData.get("airline");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Choose a file" }, { status: 400 });
  }
  if (!ALLOWED[file.type]) {
    return NextResponse.json({ error: "Use a PNG or JPEG image" }, { status: 415 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Image must be 2 MB or smaller" }, { status: 413 });
  }

  const airline =
    typeof airlineRaw === "string" && /^[A-Z0-9]{2,3}$/.test(airlineRaw.trim().toUpperCase())
      ? airlineRaw.trim().toUpperCase()
      : null;
  if (typeof airlineRaw === "string" && airlineRaw.trim() !== "" && !airline) {
    return NextResponse.json({ error: "Invalid airline code" }, { status: 400 });
  }
  const kindRaw = formData.get("kind");
  const kind = kindRaw === "letterhead" ? "letterhead" : "header";

  const dir = path.resolve(process.env.UPLOAD_DIR ?? "./uploads", airline ? "airlines" : "");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const stem = airline
    ? airline.toLowerCase()
    : kind === "letterhead"
      ? `letterhead-${Date.now()}-${randomUUID()}`
      : `header-${Date.now()}-${randomUUID()}`;
  const name = `${stem}${ALLOWED[file.type]}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.length > MAX_BYTES) {
    return NextResponse.json({ error: "Image must be 2 MB or smaller" }, { status: 413 });
  }
  if (detectImageMime(bytes) !== file.type) {
    return NextResponse.json(
      { error: "The file content is not a valid PNG or JPEG image" },
      { status: 415 },
    );
  }
  writeFileSync(path.join(dir, name), bytes, { mode: 0o600 });
  // Stored under /uploads so the browser can load it as a plain URL.
  const url = airline ? `/uploads/airlines/${name}` : `/uploads/${name}`;

  try {
    await prisma.$transaction(async (tx) => {
      if (airline) {
        await tx.airline.upsert({
          where: { iata: airline },
          create: { iata: airline, name: airline, logoPath: url },
          update: { logoPath: url },
        });
      } else {
        const before = await getSettings();
        const patch =
          kind === "letterhead"
            ? { companyLetterheadImage: url }
            : { companyHeaderImage: url };
        await saveSettings(tx, patch);
        await audit(tx, {
          userId: user.id,
          action: kind === "letterhead" ? "uploadLetterhead" : "uploadHeaderImage",
          entity: "Setting",
          entityId: kind === "letterhead" ? "company.letterheadImage" : "company.headerImage",
          before:
            kind === "letterhead"
              ? { companyLetterheadImage: before.companyLetterheadImage }
              : { companyHeaderImage: before.companyHeaderImage },
          after: patch,
        });
        return;
      }
      await audit(tx, {
        userId: user.id,
        action: "uploadLogo",
        entity: "Airline",
        entityId: airline,
        after: { logoPath: url, bytes: bytes.length },
      });
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save the image" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, url, savedTo: jsonSafe({ airline }) });
}
