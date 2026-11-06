import Link from "next/link";

import { TicketImportForm } from "@/components/ticket-import-form";
import { Alert, Card, PageHeader } from "@/components/ui";
import { requireCapableUser } from "@/server/auth";
import { prisma } from "@/server/db";

export const dynamic = "force-dynamic";

export default async function NewTicketPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireCapableUser("manageDocuments");
  const params = await searchParams;
  const [contacts, quotations] = await Promise.all([
    prisma.contact.findMany({
      where: { archivedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
      take: 1000,
    }),
    prisma.quotation.findMany({
      where: { contact: { archivedAt: null } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        number: true,
        status: true,
        contact: { select: { name: true } },
      },
      take: 500,
    }),
  ]);

  return (
    <div className="max-w-5xl">
      <PageHeader
        eyebrow="Tickets"
        title="Import electronic tickets"
        subtitle="Paste the airline ticket block, the *HTE electronic ticket list, or both."
        actions={
          <Link href="/tickets" className="btn-secondary">
            Back to tickets
          </Link>
        }
      />
      {params.error ? <Alert tone="error">{params.error}</Alert> : null}

      <Card
        title="Ticket text"
        subtitle="Deterministic parser: only 13-digit airline ticket numbers are accepted."
      >
        <TicketImportForm
          contacts={contacts}
          quotations={quotations.map((quotation) => ({
            id: quotation.id,
            number: quotation.number,
            contactName: quotation.contact.name,
            status: quotation.status,
          }))}
        />
      </Card>
    </div>
  );
}
