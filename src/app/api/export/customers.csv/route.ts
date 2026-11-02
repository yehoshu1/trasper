import { NextResponse } from "next/server";

import { contactsCsv } from "@/lib/contacts-csv";
import { contentDisposition } from "@/lib/download";
import { hasCapability } from "@/lib/permissions";
import { getCurrentUser, sessionNeedsTwoFactorEnrolment } from "@/server/auth";
import { prisma } from "@/server/db";
import { consumeRateLimit } from "@/server/rate-limit";

export const dynamic = "force-dynamic";

/** CSV export of every customer, for Admin and Accountant only. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  }
  if (await sessionNeedsTwoFactorEnrolment(user)) {
    return NextResponse.json({ error: "Two-factor authentication enrolment is required" }, { status: 403 });
  }
  if (!hasCapability(user, "exportContacts")) {
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  }
  const limit = consumeRateLimit(`contacts-export:${user.id}`, { limit: 60, windowMs: 60 * 60 * 1000 });
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many exports. Try again later." }, { status: 429 });
  }

  const contacts = await prisma.contact.findMany({ orderBy: { name: "asc" } });
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(contactsCsv(contacts), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": contentDisposition(`customers-${stamp}.csv`),
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
