import { NextResponse } from "next/server";

import { getCurrentUser, sessionNeedsTwoFactorEnrolment } from "@/server/auth";
import { globalSearch } from "@/server/search";
import { consumeRateLimit } from "@/server/rate-limit";

export const dynamic = "force-dynamic";

/** Role-filtered global search used by the command palette. */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  }
  if (await sessionNeedsTwoFactorEnrolment(user)) {
    return NextResponse.json({ error: "Two-factor authentication enrolment is required" }, { status: 403 });
  }

  const limit = consumeRateLimit(`search:${user.id}`, { limit: 300, windowMs: 60 * 1000 });
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many searches. Try again shortly." }, { status: 429 });
  }
  const query = new URL(request.url).searchParams.get("q") ?? "";
  const results = await globalSearch(user, query);
  return NextResponse.json(results, {
    headers: { "Cache-Control": "no-store" },
  });
}
