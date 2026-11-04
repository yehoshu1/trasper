import Link from "next/link";

import { PassengersTable, type PassengerTableRow } from "@/components/list-tables";
import { PassengerForm } from "@/components/passenger-form";
import { Alert, Card, EmptyState, PageHeader } from "@/components/ui";
import { requireCapableUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { createPassengerAction } from "@/server/actions/contacts";

export const dynamic = "force-dynamic";

export default async function PassengersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; archived?: string; saved?: string; deleted?: string; error?: string }>;
}) {
  await requireCapableUser("manageContacts");
  const params = await searchParams;
  const initialSearch = (params.q ?? "").trim();
  const showArchived = params.archived === "1";

  const passengers = await prisma.passenger.findMany({
    where: { archivedAt: showArchived ? { not: null } : null },
    include: {
      _count: { select: { contacts: true, fares: true } },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    take: 1000,
  });

  const archivedCount = await prisma.passenger.count({ where: { archivedAt: { not: null } } });

  const rows: PassengerTableRow[] = passengers.map((passenger) => ({
    id: passenger.id,
    name: [passenger.title, passenger.firstName, passenger.lastName].filter(Boolean).join(" "),
    firstName: passenger.firstName,
    lastName: passenger.lastName,
    type: passenger.type,
    contactCount: passenger._count.contacts,
    fareCount: passenger._count.fares,
    archived: passenger.archivedAt ? "archived" : "",
  }));

  return (
    <div>
      <PageHeader
        eyebrow="Passengers"
        title={showArchived ? "Archived passengers" : "Passengers"}
        subtitle="Travellers are separate records, linked to one or more paying customers. Edit any passenger from the list."
        actions={<Link href="/passengers/merge" className="btn-secondary">Merge duplicates</Link>}
      />

      {params.error ? <Alert tone="error">{params.error}</Alert> : null}
      {params.saved ? <Alert tone="success">Saved.</Alert> : null}
      {params.deleted ? <Alert tone="success">Passenger deleted.</Alert> : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <div className="mb-4 flex justify-end">
            <div className="flex gap-1 rounded-lg border border-border bg-card p-1 text-xs font-semibold">
              <Link
                href="/passengers"
                className={`rounded-md px-3 py-1.5 ${!showArchived ? "bg-secondary text-secondary-foreground" : "text-muted-foreground"}`}
              >
                Active
              </Link>
              <Link
                href="/passengers?archived=1"
                className={`rounded-md px-3 py-1.5 ${showArchived ? "bg-secondary text-secondary-foreground" : "text-muted-foreground"}`}
              >
                Archived{archivedCount > 0 ? ` (${archivedCount})` : ""}
              </Link>
            </div>
          </div>

          {passengers.length === 0 ? (
            <EmptyState title={showArchived ? "No archived passengers" : "No passengers yet"}>
              Add the first traveller using the form beside this list.
            </EmptyState>
          ) : (
            <PassengersTable rows={rows} initialSearch={initialSearch} />
          )}
        </div>

        <Card title="Add a passenger" subtitle="Link them to a customer afterwards">
          <PassengerForm
            action={createPassengerAction}
            submitLabel="Create passenger"
            cancelHref="/passengers"
            compact
          />
        </Card>
      </div>
    </div>
  );
}
