import { NextResponse } from "next/server";

import { contentDisposition } from "@/lib/download";
import {
  parseSnapshot,
  type ItinerarySnapshot,
  type ProformaSnapshot,
  type QuotationSnapshot,
} from "@/lib/documents";
import { hasCapability } from "@/lib/permissions";
import { getCurrentUser, sessionNeedsTwoFactorEnrolment } from "@/server/auth";
import { prisma } from "@/server/db";
import { buildQuotationSnapshot } from "@/server/documents";
import { paidTotalForProforma } from "@/server/payments";
import { consumeRateLimit } from "@/server/rate-limit";
import {
  renderItineraryPdf,
  renderProformaPdf,
  renderQuotationPdf,
  renderTicketPdf,
} from "@/server/pdf";
import { loadQuotation } from "@/server/quotations";
import { getSettings } from "@/server/settings";
import { buildTicketSnapshot, loadTicket } from "@/server/tickets";

export const dynamic = "force-dynamic";

/**
 * GET /api/pdf/[type]/[id] renders a document to PDF after checking the user
 * may see it. The PDF is produced from the same frozen snapshot as the print
 * preview, with pdf-lib, so no browser is needed on the server.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ type: string; id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  if (await sessionNeedsTwoFactorEnrolment(user)) {
    return NextResponse.json({ error: "Two-factor authentication enrolment is required" }, { status: 403 });
  }
  if (!hasCapability(user, "viewDocuments")) {
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  }
  const limit = consumeRateLimit(`pdf-render:${user.id}`, { limit: 120, windowMs: 60 * 60 * 1000 });
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many document requests. Try again later." }, { status: 429 });
  }

  const { type, id } = await params;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const settings = await getSettings();
  let pdf: Uint8Array;
  let number: string;

  try {
    if (type === "quotation") {
      const quotation = await loadQuotation(id);
      if (!quotation) return NextResponse.json({ error: "Not found" }, { status: 404 });
      const snapshot =
        parseSnapshot<QuotationSnapshot>(quotation.snapshot) ??
        (await buildQuotationSnapshot(quotation, settings));
      number = snapshot.number;
      pdf = await renderQuotationPdf(snapshot);
    } else if (type === "itinerary") {
      const itinerary = await prisma.itinerary.findUnique({ where: { id } });
      if (!itinerary) return NextResponse.json({ error: "Not found" }, { status: 404 });
      const snapshot = parseSnapshot<ItinerarySnapshot>(itinerary.snapshot);
      if (!snapshot) {
        return NextResponse.json({ error: "This itinerary has no saved snapshot" }, { status: 409 });
      }
      number = itinerary.number;
      pdf = await renderItineraryPdf(snapshot);
    } else if (type === "ticket") {
      const ticket = await loadTicket(id);
      if (!ticket) return NextResponse.json({ error: "Not found" }, { status: 404 });
      const snapshot = await buildTicketSnapshot(ticket, settings);
      number = snapshot.number;
      pdf = await renderTicketPdf(snapshot);
    } else if (type === "proforma") {
      const proforma = await prisma.proforma.findUnique({
        where: { id },
        include: { payments: { orderBy: { createdAt: "asc" } } },
      });
      if (!proforma) return NextResponse.json({ error: "Not found" }, { status: 404 });
      const snapshot = parseSnapshot<ProformaSnapshot>(proforma.snapshot);
      if (!snapshot) {
        return NextResponse.json({ error: "This pro forma has no saved snapshot" }, { status: 409 });
      }
      number = proforma.number;
      const paid = await paidTotalForProforma(proforma.id);
      pdf = await renderProformaPdf(snapshot, {
        paidMinor: paid.toString(),
        payments: proforma.payments.map((payment) => ({
          paidOn: payment.paidOn.toISOString().slice(0, 10),
          amountMinor: payment.amountMinor.toString(),
          method: payment.method,
          reference: payment.reference ?? undefined,
          reversal: Boolean(payment.reversesId),
        })),
      });
    } else {
      return NextResponse.json({ error: "Unknown document type" }, { status: 404 });
    }
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "The document could not be rendered",
      },
      { status: 422 },
    );
  }

  const filename = `${type}-${number}.pdf`;
  const inline = new URL(request.url).searchParams.get("inline") === "1";
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": contentDisposition(filename, inline ? "inline" : "attachment"),
      "Content-Length": pdf.length.toString(),
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
