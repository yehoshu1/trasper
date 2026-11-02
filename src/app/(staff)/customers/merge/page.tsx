import { Button } from "@/components/ui/button";

import Link from "next/link";

import { Alert, Card, Field, PageHeader } from "@/components/ui";
import { SelectField } from "@/components/ui/select";
import { requireCapableUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { mergeContactFormAction } from "@/server/actions/merge";

export const dynamic = "force-dynamic";

export default async function MergeCustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireCapableUser("manageContacts");
  const query = await searchParams;
  const contacts = await prisma.contact.findMany({
    where: { archivedAt: null },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      city: true,
      _count: { select: { quotations: true, passengers: true } },
    },
    orderBy: { name: "asc" },
    take: 1000,
  });

  const duplicateGroups = new Map<string, typeof contacts>();
  for (const contact of contacts) {
    const keys = [
      `n:${contact.name.trim().toLowerCase()}`,
      contact.email ? `e:${contact.email.toLowerCase()}` : null,
      contact.phone ? `p:${contact.phone.replace(/\s/g, "")}` : null,
    ].filter((key): key is string => Boolean(key));
    for (const key of keys) {
      const group = duplicateGroups.get(key) ?? [];
      if (!group.some((entry) => entry.id === contact.id)) group.push(contact);
      duplicateGroups.set(key, group);
    }
  }
  const possibleDuplicates = [...duplicateGroups.entries()]
    .filter(([, group]) => group.length > 1)
    .slice(0, 20);

  return (
    <div className="max-w-4xl">
      <PageHeader
        eyebrow="Customers"
        title="Merge duplicates"
        subtitle="Choose the record to keep. Quotations, passengers, activities, email links and notes move to it, then the duplicate is archived — never deleted."
        actions={<Link href="/customers" className="btn-secondary">Back to customers</Link>}
      />
      {query.error ? <Alert tone="error">{query.error}</Alert> : null}

      <Card title="Merge two customers">
        <form action={mergeContactFormAction} className="grid gap-4 sm:grid-cols-2">
          <Field label="Keep this customer" htmlFor="survivorId">
            <SelectField
              id="survivorId"
              name="survivorId"
              required
              placeholder="Choose the survivor"
              options={[
                { value: "", label: "Choose the survivor" },
                ...contacts.map((contact) => ({
                  value: contact.id,
                  label: contact.email ? `${contact.name} · ${contact.email}` : contact.name,
                })),
              ]}
            />
          </Field>
          <Field label="Archive this duplicate" htmlFor="loserId">
            <SelectField
              id="loserId"
              name="loserId"
              required
              placeholder="Choose the duplicate"
              options={[
                { value: "", label: "Choose the duplicate" },
                ...contacts.map((contact) => ({
                  value: contact.id,
                  label: contact.email ? `${contact.name} · ${contact.email}` : contact.name,
                })),
              ]}
            />
          </Field>
          <div className="sm:col-span-2">
            <Button variant="default" type="submit">
              Merge and archive duplicate
            </Button>
            <p className="mt-2 text-xs text-muted-foreground">
              Both ids are written to the audit log. Issued documents keep their frozen snapshots.
            </p>
          </div>
        </form>
      </Card>

      {possibleDuplicates.length > 0 ? (
        <div className="mt-6">
          <Card title="Possible duplicates" subtitle="Matching name, email or phone">
            <ul className="space-y-3">
              {possibleDuplicates.map(([key, group]) => (
                <li key={key} className="rounded-lg border border-border p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {key.startsWith("e:") ? "Email" : key.startsWith("p:") ? "Phone" : "Name"}
                  </p>
                  <ul className="mt-1 space-y-1 text-sm">
                    {group.map((contact) => (
                      <li key={contact.id} className="flex flex-wrap items-center justify-between gap-2">
                        <Link href={`/customers/${contact.id}`} className="font-semibold">
                          {contact.name}
                        </Link>
                        <span className="text-xs text-muted-foreground">
                          {[contact.email, contact.phone, contact.city].filter(Boolean).join(" · ")}
                          {" · "}
                          {contact._count.quotations} quotation{contact._count.quotations === 1 ? "" : "s"}
                        </span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
