import { cronAuthorised } from "@/lib/cron-auth";
import { runScheduledJobs } from "@/server/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Internal scheduled maintenance. Point a container timer or host cron at
 * this route with CRON_SECRET; it is safe to call repeatedly.
 */
export async function GET(request: Request): Promise<Response> {
  if (
    !cronAuthorised({
      secretEnv: process.env.CRON_SECRET,
      authorization: request.headers.get("authorization"),
      nodeEnv: process.env.NODE_ENV,
    })
  ) {
    return Response.json({ ok: false, error: "Unauthorised" }, { status: 401 });
  }
  try {
    const result = await runScheduledJobs();
    return Response.json({ ok: true, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Job run failed" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function POST(request: Request): Promise<Response> {
  return GET(request);
}
