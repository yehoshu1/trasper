#!/usr/bin/env node
/**
 * Container/host timer for scheduled maintenance. Calls the guarded internal
 * route; the route itself is idempotent, so overlapping runs are harmless.
 *
 *   CRON_URL=http://app:3000 CRON_SECRET=… npm run cron
 */
const base = process.env.CRON_URL ?? process.env.APP_URL ?? "http://127.0.0.1:3000";
const secret = process.env.CRON_SECRET ?? "";
const intervalSeconds = Number(process.env.CRON_INTERVAL_SECONDS ?? 900);

async function runOnce() {
  const url = new URL("/api/cron", base);
  try {
    const response = await fetch(url, {
      headers: secret ? { authorization: `Bearer ${secret}` } : {},
    });
    const body = await response.text();
    if (!response.ok) {
      console.error(`[cron] ${new Date().toISOString()} HTTP ${response.status}: ${body}`);
      return;
    }
    console.log(`[cron] ${new Date().toISOString()} ${body}`);
  } catch (error) {
    console.error(`[cron] ${new Date().toISOString()} failed:`, error instanceof Error ? error.message : error);
  }
}

await runOnce();
if (intervalSeconds > 0) {
  setInterval(runOnce, intervalSeconds * 1000);
}
