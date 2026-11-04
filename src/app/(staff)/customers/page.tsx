import Link from "next/link";

import { CustomersTable, type CustomerTableRow } from "@/components/list-tables";
import { Alert, EmptyState, PageHeader } from "@/components/ui";
import { hasCapability } from "@/lib/permissions";
import { parseSavedView } from "@/lib/saved-views";
import { requireCapableUser } from "@/server/auth";
import { prisma } from "@/server/db";

export const dynamic = "force-dynamic";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; archived?: string; saved?: string; deleted?: string; error?: string }>;
}) {
  const user = await requireCapableUser("viewContacts");
  const params = await searchParams;
  const initialSearch = (params.q ?? "").trim();
  const showArchived = params.archived === "1";

  const savedView = await prisma.savedTableView.findUnique({
    where: { userId_listKey: { userId: user.id, listKey: "customers" } },
  });

  const contacts = await prisma.contact.findMany({
    where: { archivedAt: showArchived ? { not: null } : null },
    include: {
      _count: { select: { passengers: true, quotations: true } },
    },
    orderBy: { name: "asc" },
    take: 1000,
  });

  const archivedCount = await prisma.contact.count({ where: { archivedAt: { not: null } } });

  const rows: CustomerTableRow[] = contacts.map((contact) => ({
    id: contact.id,
    name: contact.name,
    type: contact.type,
    attention: contact.attention ?? "",
    email: contact.email ?? "",
    phone: contact.phone ?? "",
    city: contact.city ?? "",
    country: contact.country ?? "",
    passengerCount: contact._count.passengers,
    quotationCount: contact._count.quotations,
  }));

  return (
    <div>
      <PageHeader
        eyebrow="Customers"
        title={showArchived ? "Archived customers" : "Customers"}
        subtitle="Paying customers. Search by name, city, email or phone; passengers are managed separately."
        actions={
          <>
            {hasCapability(user, "manageContacts") ? (
              <>
                <Link href="/customers/import" className="btn-secondary">
                  Import CSV
                </Link>
                <Link href="/customers/new" className="btn-primary">
                  New customer
                </Link>
              </>
            ) : null}
            {hasCapability(user, "exportContacts") ? (
              <a href="/api/export/customers.csv" className="btn-secondary">
                Export CSV
              </a>
            ) : null}
          </>
        }
      />

      {params.error ? <Alert tone="error">{params.error}</Alert> : null}
      {params.saved ? <Alert tone="success">Saved.</Alert> : null}
      {params.deleted ? <Alert tone="success">Customer deleted.</Alert> : null}

      <div className="mb-4 flex justify-end">
        <div className="flex gap-1 rounded-lg border border-border bg-card p-1 text-xs font-semibold">
          <Link
            href="/customers"
            className={`rounded-md px-3 py-1.5 ${!showArchived ? "bg-secondary text-secondary-foreground" : "text-muted-foreground"}`}
          >
            Active
          </Link>
          <Link
            href="/customers?archived=1"
            className={`rounded-md px-3 py-1.5 ${showArchived ? "bg-secondary text-secondary-foreground" : "text-muted-foreground"}`}
          >
            Archived{archivedCount > 0 ? ` (${archivedCount})` : ""}
          </Link>
        </div>
      </div>

      {contacts.length === 0 ? (
        <EmptyState title={showArchived ? "No archived customers" : "No customers yet"}>
          {hasCapability(user, "manageContacts") ? (
            <Link href="/customers/new" className="font-semibold">
              Create the first customer
            </Link>
          ) : (
            "Customers will appear here once an agent adds them."
          )}
        </EmptyState>
      ) : (
        <CustomersTable
          rows={rows}
          initialSearch={initialSearch}
          initialView={parseSavedView(savedView?.state)}
        />
      )}
    </div>
  );
}
