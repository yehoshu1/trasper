import { NextResponse } from "next/server";

import { contentDisposition } from "@/lib/download";
import { hasCapability } from "@/lib/permissions";
import { buildReportCsv } from "@/lib/report-csv";
import { resolveReportRange } from "@/lib/reports";
import { getCurrentUser, sessionNeedsTwoFactorEnrolment } from "@/server/auth";
import { loadReport, reportCsvFilename } from "@/server/reports";
import { consumeRateLimit } from "@/server/rate-limit";
import { getSettings } from "@/server/settings";

export const dynamic = "force-dynamic";

/** GET /api/reports/export?period=&from=&to=&grain= */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  if (await sessionNeedsTwoFactorEnrolment(user)) {
    return NextResponse.json({ error: "Two-factor authentication enrolment is required" }, { status: 403 });
  }
  if (!hasCapability(user, "viewReports")) {
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  }
  const limit = consumeRateLimit(`report-export:${user.id}`, { limit: 60, windowMs: 60 * 60 * 1000 });
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many exports. Try again later." }, { status: 429 });
  }

  const url = new URL(request.url);
  const range = resolveReportRange({
    period: url.searchParams.get("period") ?? undefined,
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
    grain: url.searchParams.get("grain") ?? undefined,
  });
  const data = await loadReport(range, {
    includeProfit: hasCapability(user, "viewCosts"),
  });
  const settings = await getSettings();
  const csv = buildReportCsv(data, settings.companyName);

  return new NextResponse(`\uFEFF${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": contentDisposition(reportCsvFilename(range)),
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
