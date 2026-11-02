import { Button } from "@/components/ui/button";

import Link from "next/link";

import { Alert, Card, Field, PageHeader } from "@/components/ui";
import { SelectField } from "@/components/ui/select";
import { requireCapableUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { mergePassengerFormAction } from "@/server/actions/merge";

export const dynamic = "force-dynamic";

export default async function MergePassengersPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireCapableUser("manageContacts");
  const query = await searchParams;
  const passengers = await prisma.passenger.findMany({
    where: { archivedAt: null },
    select: {
      id: true,
      title: true,
      firstName: true,
      lastName: true,
      type: true,
      _count: { select: { contacts: true, fares: true } },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    take: 1000,
  });

  const groups = new Map<string, typeof passengers>();
  for (const passenger of passengers) {
    const key = `${passenger.firstName.trim().toLowerCase()}|${passenger.lastName.trim().toLowerCase()}`;
    const group = groups.get(key) ?? [];
    group.push(passenger);
    groups.set(key, group);
  }
  const possibleDuplicates = [...groups.entries()].filter(([, group]) => group.length > 1).slice(0, 20);

  return (
    <div className="max-w-4xl">
      <PageHeader
        eyebrow="Passengers"
        title="Merge passengers"
        subtitle="Fares are re-pointed to the surviving passenger and the duplicate is archived. If both are priced in the same option the merge is blocked, because the money would change."
        actions={<Link href="/passengers" className="btn-secondary">Back to passengers</Link>}
      />
      {query.error ? <Alert tone="error">{query.error}</Alert> : null}

      <Card title="Merge two passengers">
        <form action={mergePassengerFormAction} className="grid gap-4 sm:grid-cols-2">
          <Field label="Keep this passenger" htmlFor="survivorId">
            <SelectField
              id="survivorId"
              name="survivorId"
              required
              placeholder="Choose the survivor"
              options={[
                { value: "", label: "Choose the survivor" },
                ...passengers.map((passenger) => ({
                  value: passenger.id,
                  label: `${[passenger.title, passenger.firstName, passenger.lastName].filter(Boolean).join(" ")} (${passenger.type})`,
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
                ...passengers.map((passenger) => ({
                  value: passenger.id,
                  label: `${[passenger.title, passenger.firstName, passenger.lastName].filter(Boolean).join(" ")} (${passenger.type})`,
                })),
              ]}
            />
          </Field>
          <div className="sm:col-span-2">
            <Button variant="default" type="submit">
              Merge and archive duplicate
            </Button>
            <p className="mt-2 text-xs text-muted-foreground">Both ids are written to the audit log.</p>
          </div>
        </form>
      </Card>

      {possibleDuplicates.length > 0 ? (
        <div className="mt-6">
          <Card title="Possible duplicates" subtitle="Same first and last name">
            <ul className="space-y-2">
              {possibleDuplicates.map(([key, group]) => (
                <li key={key} className="rounded-lg border border-border p-3 text-sm">
                  {group.map((passenger) => (
                    <span key={passenger.id} className="mr-3">
                      <Link href={`/passengers/${passenger.id}`} className="font-semibold">
                        {passenger.firstName} {passenger.lastName}
                      </Link>
                      <span className="text-xs text-muted-foreground">
                        {" "}· {passenger._count.fares} fare{passenger._count.fares === 1 ? "" : "s"}
                      </span>
                    </span>
                  ))}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
