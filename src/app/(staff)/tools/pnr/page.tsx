import { Card, PageHeader } from "@/components/ui";
import { PnrConverter } from "@/components/pnr-converter";
import { requireCapableUser } from "@/server/auth";

export const dynamic = "force-dynamic";

export default async function PnrConverterPage() {
  await requireCapableUser("manageQuotations");

  return (
    <div className="max-w-5xl">
      <PageHeader
        eyebrow="Tools"
        title="PNR converter"
        subtitle="Paste a booking-system PNR or a human itinerary and get one clean PNR block to paste into a quotation. The converter only reformats the text; it never guesses missing flights."
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card title="Convert" subtitle="Works with booking-system output and one-segment-per-line itineraries">
          <PnrConverter />
        </Card>

        <Card title="Itinerary format">
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            Each segment needs an airline and flight number, a date, two airport codes and two
            times. Use a pipe, comma or spaces between them.
          </p>
          <pre className="mt-3 overflow-x-auto rounded-md border border-border bg-muted/30 p-3 font-mono text-[11px] leading-relaxed text-foreground">
{`ET873 | 31 Oct 2026 | LLW - LUN | 06:20 - 09:10
ET874 | 07 Nov 2026 | LUN - LLW | 10:15 - 12:05
PAX: MORGAN/ALEX MR, MORGAN/SAM MS`}
          </pre>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            Also accepted: <span className="font-mono">31/10/2026</span>,{" "}
            <span className="font-mono">2026-10-31</span>, <span className="font-mono">0620 0910</span>,
            and an optional <span className="font-mono">+1</span> on overnight arrivals.
          </p>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            Every input and output is validated with Zod. Missing or contradictory fields are
            reported instead of being invented.
          </p>
        </Card>
      </div>
    </div>
  );
}
