import { Button } from "@/components/ui/button";

import { Input } from "@/components/ui/input";

import Link from "next/link";
import { notFound } from "next/navigation";

import { ConfirmButton } from "@/components/confirm-button";
import { Alert, Card, EmptyState, PageHeader, StatusBadge } from "@/components/ui";
import { formatDate } from "@/lib/dates";
import { requireCapableUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { archivePassengerAction, deletePassengerAction, unarchivePassengerAction } from "@/server/actions/contacts";

export const dynamic = "force-dynamic";

export default async function PassengerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  await requireCapableUser("manageContacts");
  const { id } = await params;
  const query = await searchParams;

  const passenger = await prisma.passenger.findUnique({
    where: { id },
    include: {
      contacts: { orderBy: { name: "asc" } },
      fares: {
        include: {
          option: {
            include: {
              quotation: { include: { contact: true } },
            },
          },
        },
      },
    },
  });
  if (!passenger) notFound();
  const canDelete = passenger.fares.length === 0;

  const quotations = new Map<
    string,
    { id: string; number: string; status: string; issueDate: Date; contactName: string; optionLabel: string }
  >();
  for (const fare of passenger.fares) {
    quotations.set(fare.option.quotation.id, {
      id: fare.option.quotation.id,
      number: fare.option.quotation.number,
      status: fare.option.quotation.status,
      issueDate: fare.option.quotation.issueDate,
      contactName: fare.option.quotation.contact.name,
      optionLabel: fare.option.label,
    });
  }

  return (
    <div className="max-w-5xl">
      <PageHeader
        eyebrow="Passenger"
        title={[passenger.title, passenger.firstName, passenger.lastName].filter(Boolean).join(" ")}
        subtitle={`${passenger.type} · added ${formatDate(passenger.createdAt)}`}
        actions={<Link href={`/passengers/${passenger.id}/edit`} className="btn-secondary">Edit</Link>}
      />

      {passenger.archivedAt ? (
        <Alert tone="warning" title="Archived passenger">
          This passenger is archived and should not be added to new documents.
        </Alert>
      ) : null}
      {query.error ? <Alert tone="error">{query.error}</Alert> : null}
      {query.saved ? <Alert tone="success">Saved.</Alert> : null}

      <div className="grid gap-6 md:grid-cols-2">
        <Card title="Paying customers">
          {passenger.contacts.length === 0 ? (
            <EmptyState title="Not linked to a customer">
              Link this passenger from a customer page.
            </EmptyState>
          ) : (
            <ul className="divide-y divide-border">
              {passenger.contacts.map((contact) => (
                <li key={contact.id} className="flex items-center justify-between gap-2 py-2">
                  <Link href={`/customers/${contact.id}`} className="font-semibold text-foreground">
                    {contact.name}
                  </Link>
                  <span className="text-xs capitalize text-muted-foreground">{contact.type}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Documents" subtitle="Quotations that include this passenger">
          {quotations.size === 0 ? (
            <p className="text-sm text-muted-foreground">This passenger has not been quoted yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {[...quotations.values()].map((quotation) => (
                <li key={quotation.id} className="flex items-center justify-between gap-2 py-2">
                  <div>
                    <Link href={`/quotations/${quotation.id}`} className="font-semibold text-foreground">
                      {quotation.number} · {quotation.optionLabel}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {quotation.contactName} · {formatDate(quotation.issueDate)}
                    </p>
                  </div>
                  <StatusBadge status={quotation.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-6">
        <div className="flex flex-wrap items-center gap-2">
          {passenger.archivedAt ? (
            <form action={unarchivePassengerAction}>
              <Input type="hidden" name="id" value={passenger.id} />
              <Button variant="secondary" type="submit">Unarchive passenger</Button>
            </form>
          ) : (
            <form action={archivePassengerAction}>
              <Input type="hidden" name="id" value={passenger.id} />
              <ConfirmButton message="Archive this passenger? Existing documents stay unchanged.">
                Archive passenger
              </ConfirmButton>
            </form>
          )}
          {canDelete ? (
            <form action={deletePassengerAction}>
              <Input type="hidden" name="id" value={passenger.id} />
              <ConfirmButton
                variant="destructive"
                message="Permanently delete this passenger? Customer links are removed. This cannot be undone."
              >
                Delete passenger
              </ConfirmButton>
            </form>
          ) : null}
        </div>
        {!canDelete ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Passengers priced on a quotation can only be archived.
          </p>
        ) : null}
      </div>
    </div>
  );
}
