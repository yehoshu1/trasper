import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert, Card, Field, PageHeader } from "@/components/ui";
import { SelectField } from "@/components/ui/select";
import { ItinerarySegmentFields } from "@/components/itinerary-segments";
import { requireCapableUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { createStandaloneItineraryFormAction } from "@/server/actions/itineraries";

export const dynamic = "force-dynamic";

export default async function NewItineraryPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireCapableUser("manageDocuments");
  const query = await searchParams;
  const [contacts, passengers, branches] = await Promise.all([
    prisma.contact.findMany({
      where: { archivedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, city: true, country: true },
    }),
    prisma.passenger.findMany({
      where: { archivedAt: null },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: { id: true, title: true, firstName: true, lastName: true, type: true },
    }),
    prisma.branch.findMany({ where: { active: true }, orderBy: { code: "asc" } }),
  ]);

  return (
    <div className="max-w-4xl">
      <PageHeader
        eyebrow="Itineraries"
        title="New standalone itinerary"
        subtitle="Create an itinerary without a quotation or prices. Add the flights by hand, or paste a PNR or itinerary text to read them."
        actions={
          <Link href="/itineraries" className="btn-secondary">
            Back to itineraries
          </Link>
        }
      />

      {query.error ? <Alert tone="error">{query.error}</Alert> : null}

      <form action={createStandaloneItineraryFormAction} className="space-y-6">
        <Card title="Customer and reference">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Customer" htmlFor="contactId" className="sm:col-span-2">
              <SelectField
                id="contactId"
                name="contactId"
                placeholder="Choose a customer"
                options={contacts.map((contact) => ({
                  value: contact.id,
                  label: [contact.name, contact.city, contact.country].filter(Boolean).join(" · "),
                }))}
              />
            </Field>
            <Field label="Reference" htmlFor="referenceNo" hint="Optional customer or booking reference">
              <Input id="referenceNo" name="referenceNo" maxLength={80} />
            </Field>
            <Field label="Booking reference (PNR)" htmlFor="pnr" hint="Optional short record locator printed on the itinerary">
              <Input id="pnr" name="pnr" maxLength={80} className="font-mono uppercase" />
            </Field>
            <Field label="Issue branch" htmlFor="branch" hint="Two digits, used in the itinerary number">
              <SelectField
                id="branch"
                name="branch"
                defaultValue={branches[0]?.code ?? "01"}
                options={branches.map((branch) => ({
                  value: branch.code,
                  label: `${branch.code} — ${branch.name}`,
                }))}
              />
            </Field>
          </div>
        </Card>

        <Card title="Flights and passengers">
          <div className="space-y-4">
            <ItinerarySegmentFields />

            <Field
              label="Or paste a PNR or itinerary"
              htmlFor="pnrText"
              hint="Optional when flights are added above. Pasted booking-system output is read and never guessed; it is ignored when manual flights are present."
            >
              <Textarea
                id="pnrText"
                name="pnrText"
                rows={7}
                className="font-mono text-xs"
                placeholder="Paste PNR or itinerary lines here"
              />
            </Field>

            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Passengers
              </p>
              <p className="mb-2 text-[11px] text-muted-foreground">
                Optional. Leave blank when the passenger names are still to be advised.
              </p>
              {passengers.length === 0 ? (
                <p className="rounded-md border border-dashed border-border px-3 py-3 text-xs text-muted-foreground">
                  No active passengers yet. Add them under Passengers first.
                </p>
              ) : (
                <div className="max-h-72 overflow-y-auto rounded-md border border-border p-2">
                  <ul className="grid gap-1 sm:grid-cols-2">
                    {passengers.map((passenger) => (
                      <li key={passenger.id}>
                        <label className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-muted/50">
                          <input
                            type="checkbox"
                            name="passengerIds"
                            value={passenger.id}
                            className="h-4 w-4 rounded border-input"
                          />
                          <span>
                            {[passenger.title, passenger.firstName, passenger.lastName]
                              .filter(Boolean)
                              .join(" ")}
                            <span className="ml-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                              {passenger.type}
                            </span>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <Field label="Travel notes" htmlFor="notes" hint="Leave blank to use the standard itinerary notes">
              <Textarea id="notes" name="notes" rows={3} maxLength={4000} />
            </Field>
          </div>
        </Card>

        <div className="flex items-center gap-2">
          <Button variant="default" type="submit">
            Create itinerary
          </Button>
          <Link href="/itineraries" className="btn-secondary">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
