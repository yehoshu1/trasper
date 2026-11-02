import { existsSync, lstatSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

import { getSettings } from "@/server/settings";

export const dynamic = "force-dynamic";

const SAFE = /^[A-Za-z0-9._-]+$/;

/**
 * The company logo is public branding and must be visible on the sign-in
 * screen, where there is no session. Every other upload stays staff-only.
 */
export async function GET() {
  const settings = await getSettings();
  const logo = settings.companyHeaderImage || settings.companyLetterheadImage;
  const prefix = "/uploads/";
  if (!logo.startsWith(prefix)) return new NextResponse(null, { status: 404 });

  const relative = logo.slice(prefix.length);
  if (
    relative.startsWith("attachments/") ||
    !relative.split("/").every((segment) => SAFE.test(segment) && segment !== "." && segment !== "..")
  ) {
    return new NextResponse(null, { status: 404 });
  }

  const dir = path.resolve(process.env.UPLOAD_DIR ?? "./uploads");
  const file = path.join(dir, relative);
  if (!file.startsWith(`${dir}${path.sep}`) || !existsSync(file)) {
    return new NextResponse(null, { status: 404 });
  }
  const stats = lstatSync(file);
  if (stats.isSymbolicLink() || !stats.isFile() || stats.size > 2 * 1024 * 1024) {
    return new NextResponse(null, { status: 404 });
  }

  const extension = path.extname(relative).toLowerCase();
  const type =
    extension === ".png"
      ? "image/png"
      : extension === ".jpg" || extension === ".jpeg"
        ? "image/jpeg"
        : extension === ".webp"
          ? "image/webp"
          : "application/octet-stream";

  // Buffer the logo rather than handing Next a Node stream cast as a
  // ReadableStream; the 2 MB cap above keeps this small and reliable.
  const body = await readFile(file);

  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": type,
      "Content-Length": stats.size.toString(),
      "Cache-Control": "public, max-age=60",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
