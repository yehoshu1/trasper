import Link from "next/link";
import { notFound } from "next/navigation";

import { PdfPreview } from "@/components/pdf-preview";
import { requireCapableUser } from "@/server/auth";
import { loadTicket } from "@/server/tickets";
import { formatTicketNumber } from "@/lib/tickets/parse";

export const dynamic = "force-dynamic";

export default async function TicketPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireCapableUser("viewDocuments");
  const { id } = await params;
  const ticket = await loadTicket(id);
  if (!ticket) notFound();

  return (
    <div>
      <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href={`/tickets/${ticket.id}`} className="text-sm font-semibold text-foreground">
            ← Back to ticket
          </Link>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatTicketNumber(ticket.number)} · {ticket.passengerName}
          </p>
        </div>
        <Link href={`/api/pdf/ticket/${ticket.id}`} className="btn-primary">
          Download PDF
        </Link>
      </div>
      <PdfPreview
        src={`/api/pdf/ticket/${ticket.id}?inline=1`}
        title={`Ticket ${formatTicketNumber(ticket.number)} preview`}
        height="calc(100vh - 230px)"
      />
    </div>
  );
}
