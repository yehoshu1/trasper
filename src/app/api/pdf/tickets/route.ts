import { PDFDocument } from "pdf-lib";
import { NextResponse } from "next/server";

import { contentDisposition } from "@/lib/download";
import { hasCapability } from "@/lib/permissions";
import { getCurrentUser, sessionNeedsTwoFactorEnrolment } from "@/server/auth";
import { prisma } from "@/server/db";
import { renderTicketPdf } from "@/server/pdf";
import { consumeRateLimit } from "@/server/rate-limit";
import { getSettings } from "@/server/settings";
import { buildTicketSnapshot, loadTicket } from "@/server/tickets";

export const dynamic = "force-dynamic";

const MAX_TICKETS = 100;

/**
 * GET /api/pdf/tickets renders every matching ticket into one PDF, one page per
 * passenger. The list page links here with its current search so a group can be
 * printed in one go.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  if (await sessionNeedsTwoFactorEnrolment(user)) {
    return NextResponse.json(
      { error: "Two-factor authentication enrolment is required" },
      { status: 403 },
    );
  }
  if (!hasCapability(user, "viewDocuments")) {
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  }
  const limit = consumeRateLimit(`pdf-tickets:${user.id}`, {
    limit: 30,
    windowMs: 60 * 60 * 1000,
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many document requests. Try again later." },
      { status: 429 },
    );
  }

  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").trim();
  const ids = (url.searchParams.get("ids") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => /^[A-Za-z0-9_-]{1,64}$/.test(id));

  const where = ids.length
    ? { id: { in: ids } }
    : query
      ? {
          OR: [
            { number: { contains: query.replace(/\s+/g, "") } },
            { secondaryNumber: { contains: query.replace(/\s+/g, "") } },
            { passengerName: { contains: query } },
            { contact: { name: { contains: query } } },
            { quotation: { number: { contains: query } } },
          ],
        }
      : {};

  const rows = await prisma.ticket.findMany({
    where,
    orderBy: { number: "asc" },
    take: MAX_TICKETS,
    select: { id: true },
  });

  if (rows.length === 0) {
    return NextResponse.json({ error: "No tickets match" }, { status: 404 });
  }

  const settings = await getSettings();
  const merged = await PDFDocument.create();
  for (const row of rows) {
    const ticket = await loadTicket(row.id);
    if (!ticket) continue;
    const snapshot = await buildTicketSnapshot(ticket, settings);
    const bytes = await renderTicketPdf(snapshot);
    const pdf = await PDFDocument.load(bytes);
    const pages = await merged.copyPages(pdf, pdf.getPageIndices());
    for (const page of pages) merged.addPage(page);
  }

  if (merged.getPageCount() === 0) {
    return NextResponse.json({ error: "Nothing to print" }, { status: 404 });
  }

  const bytes = await merged.save();
  const inline = url.searchParams.get("inline") === "1";
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": contentDisposition(
        rows.length === 1 ? "ticket.pdf" : "tickets.pdf",
        inline ? "inline" : "attachment",
      ),
      "Content-Length": bytes.length.toString(),
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
