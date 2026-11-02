import { csvCell } from "@/lib/csv";
import { contentDisposition } from "@/lib/download";
import { minorToDecimalString } from "@/lib/money";
import { loadAgedDebtors } from "@/server/aged-debtors";
import { requireCapableUser } from "@/server/auth";
import { consumeRateLimit } from "@/server/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const user = await requireCapableUser("viewReports");
  const limit = consumeRateLimit(`aged-debtors:${user.id}`, { limit: 60, windowMs: 60 * 60 * 1000 });
  if (!limit.allowed) {
    return new Response("Too many exports. Try again later.", { status: 429 });
  }
  const report = await loadAgedDebtors();
  const header = ["Pro forma", "Customer", "Due", "Age (days)", "Bucket", "Balance", "Currency"];
  const rows = report.list.map((row) => [
    row.number,
    row.customerName,
    row.dueDate,
    String(row.ageDays),
    row.bucket,
    minorToDecimalString(row.balanceMinor, row.currency),
    row.currency,
  ]);
  const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": contentDisposition(`aged-debtors-${new Date().toISOString().slice(0, 10)}.csv`),
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
