import { NextResponse } from "next/server";

/** Uptime check. Returns no tenant data, only that the app is answering. */
export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      time: new Date().toISOString(),
      version: process.env.APP_VERSION ?? "dev",
      revision: process.env.APP_REVISION ?? "dev",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
