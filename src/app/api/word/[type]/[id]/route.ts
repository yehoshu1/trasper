import { NextResponse } from "next/server";

import { contentDisposition } from "@/lib/download";
import { parseFrozenTotals, parseSnapshot, type ProformaSnapshot, type QuotationSnapshot } from "@/lib/documents";
import { hasCapability } from "@/lib/permissions";
import { getCurrentUser, sessionNeedsTwoFactorEnrolment } from "@/server/auth";
import { prisma } from "@/server/db";
import { buildQuotationSnapshot } from "@/server/documents";
import { loadQuotation } from "@/server/quotations";
import { getSettings } from "@/server/settings";
import { consumeRateLimit } from "@/server/rate-limit";
import { buildProformaDocx, buildQuotationDocx } from "@/server/word";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Internal Word export. Gated to roles that already see cost and markup, so a
 * viewer can never obtain it. This is not a customer deliverable.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ type: string; id: string }> },
): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  if (await sessionNeedsTwoFactorEnrolment(user)) {
    return NextResponse.json({ error: "Two-factor authentication enrolment is required" }, { status: 403 });
  }
  if (!hasCapability(user, "viewCosts") || !hasCapability(user, "viewDocuments")) {
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  }
  const limit = consumeRateLimit(`word-render:${user.id}`, { limit: 60, windowMs: 60 * 60 * 1000 });
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many document requests. Try again later." }, { status: 429 });
  }

  const { type, id } = await params;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    let buffer: Buffer;
    let filename: string;
    if (type === "quotation") {
      const quotation = await loadQuotation(id);
      if (!quotation) return NextResponse.json({ error: "Not found" }, { status: 404 });
      const settings = await getSettings();
      const snapshot =
        parseSnapshot<QuotationSnapshot>(quotation.snapshot) ??
        (await buildQuotationSnapshot(quotation, settings));
      buffer = await buildQuotationDocx(snapshot);
      filename = `internal-quotation-${snapshot.number}.docx`;
    } else if (type === "proforma") {
      const proforma = await prisma.proforma.findUnique({
        where: { id },
        include: {
          quotation: {
            include: {
              options: { select: { id: true, frozenTotals: true } },
            },
          },
        },
      });
      if (!proforma) return NextResponse.json({ error: "Not found" }, { status: 404 });
      const snapshot = parseSnapshot<ProformaSnapshot>(proforma.snapshot);
      if (!snapshot) return NextResponse.json({ error: "No frozen snapshot" }, { status: 409 });
      const option = proforma.quotation.options.find((entry) => entry.id === proforma.optionId);
      buffer = await buildProformaDocx(snapshot, parseFrozenTotals(option?.frozenTotals));
      filename = `internal-proforma-${snapshot.number}.docx`;
    } else {
      return NextResponse.json({ error: "Unknown document type" }, { status: 404 });
    }

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": contentDisposition(filename),
        "Content-Length": buffer.length.toString(),
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Word export failed" },
      { status: 422 },
    );
  }
}
