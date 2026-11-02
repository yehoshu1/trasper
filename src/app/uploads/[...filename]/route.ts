import { existsSync, lstatSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

import { getCurrentUser } from "@/server/auth";

export const dynamic = "force-dynamic";

const SAFE = /^[A-Za-z0-9._-]+$/;

/**
 * Serve a stored image. Signed-in staff only; the folder is outside public/.
 * A catch-all so both `/uploads/header.png` and `/uploads/airlines/et.png`
 * resolve, with every segment validated to block traversal.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ filename: string[] }> },
) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse(null, { status: 401 });

  const { filename } = await params;
  if (
    !filename?.length ||
    !filename.every((segment) => SAFE.test(segment) && segment !== "." && segment !== "..")
  ) {
    return new NextResponse(null, { status: 400 });
  }
  // Attachments may contain supplier costs. They have their own route with
  // document/cost capability checks; never expose them as plain images.
  if (filename[0] === "attachments") {
    return new NextResponse(null, { status: 404 });
  }
  const relative = filename.join("/");

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

  // Buffer the image rather than handing Next a Node stream cast as a
  // ReadableStream; the 2 MB cap above keeps this small and reliable.
  const body = await readFile(file);

  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": type,
      "Content-Length": stats.size.toString(),
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
