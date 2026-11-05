import { Button } from "@/components/ui/button";

import { Input } from "@/components/ui/input";

import Link from "next/link";
import { notFound } from "next/navigation";

import { ConfirmButton } from "@/components/confirm-button";
import { HistoryPanel } from "@/components/history-panel";
import { PassengerForm } from "@/components/passenger-form";
import { Alert, Card, EmptyState, Money, PageHeader, StatusBadge } from "@/components/ui";
import { SelectField } from "@/components/ui/select";
import { formatDate } from "@/lib/dates";
import { hasCapability } from "@/lib/permissions";
import { requireCapableUser } from "@/server/auth";
import { prisma } from "@/server/db";
import {
  archiveContactAction,
  createPassengerAction,
  deleteContactAction,
  linkPassengerAction,
  unarchiveContactAction,
  unlinkPassengerAction,
} from "@/server/actions/contacts";
import { displayQuotationTotal, quotationInclude } from "@/server/quotations";
import { getSettings } from "@/server/settings";

export const dynamic = "force-dynamic";

export default async function CustomerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; duplicate?: string; merged?: string; error?: string }>;
}) {
  const user = await requireCapableUser("viewContacts");
  const { id } = await params;
  const query = await searchParams;
  const settings = await getSettings();

  const contact = await prisma.contact.findUnique({
    where: { id },
    include: {
      passengers: { orderBy: [{ lastName: "asc" }, { firstName: "asc" }] },
      quotations: { orderBy: { createdAt: "desc" }, include: quotationInclude },
    },
  });
  if (!contact) notFound();

  const quotationIds = contact.quotations.map((quotation) => quotation.id);
  const [itineraries, proformas] = await Promise.all([
    prisma.itinerary.findMany({
      where: {
        OR: [
          { contactId: contact.id },
          { quotationId: { in: quotationIds } },
        ],
      },
      orderBy: { issuedAt: "desc" },
    }),
    prisma.proforma.findMany({
      where: { quotationId: { in: quotationIds } },
      orderBy: { createdAt: "desc" },
      include: { payments: true },
    }),
  ]);

  const linkedIds = contact.passengers.map((passenger) => passenger.id);
  const availablePassengers = await prisma.passenger.findMany({
    where: { archivedAt: null, id: { notIn: linkedIds } },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    take: 200,
  });

  const balance = proformas
    .filter((proforma) => proforma.status !== "cancelled")
    .reduce((sum, proforma) => {
      const paid = proforma.payments.reduce((total, payment) => total + payment.amountMinor, 0n);
      return sum + (proforma.totalMinor - paid);
    }, 0n);

  const canManage = hasCapability(user, "manageContacts");
  const canDelete = contact.quotations.length === 0 && itineraries.length === 0;

  return (
    <div>
      <PageHeader
        eyebrow="Customer"
        title={contact.name}
        subtitle={[contact.attention, contact.city, contact.country].filter(Boolean).join(" · ")}
        actions={
          <>
            {hasCapability(user, "manageQuotations") && !contact.archivedAt ? (
              <Link href={`/quotations/new?contactId=${contact.id}`} className="btn-secondary">
                Quote this customer
              </Link>
            ) : null}
            {canManage ? (
              <>
                <Link href="/customers/merge" className="btn-secondary">
                  Merge duplicate
                </Link>
                <Link href={`/customers/${contact.id}/edit`} className="btn-secondary">
                  Edit
                </Link>
              </>
            ) : null}
          </>
        }
      />

      {contact.archivedAt ? (
        <Alert tone="warning" title="Archived customer">
          This customer is archived and cannot receive new quotations. Existing documents remain
          readable.
        </Alert>
      ) : null}
      {query.duplicate ? (
        <Alert tone="warning" title="Possible duplicate">
          Another customer may share this name, email or phone. Check the customer list before adding
          documents.
        </Alert>
      ) : null}
      {query.error ? <Alert tone="error">{query.error}</Alert> : null}
      {query.saved ? <Alert tone="success">Saved.</Alert> : null}
      {query.merged ? <Alert tone="success">The duplicate customer was merged into this record.</Alert> : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <Card title="Details">
            <dl className="grid gap-3 text-sm [&_dd]:break-words sm:grid-cols-2">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Type</dt>
                <dd className="capitalize text-foreground">{contact.type}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Attention</dt>
                <dd className="text-foreground">{contact.attention ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Email</dt>
                <dd className="text-foreground">{contact.email ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Phone</dt>
                <dd className="text-foreground">{contact.phone ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">P.O. Box</dt>
                <dd className="text-foreground">{contact.poBox ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">City / country</dt>
                <dd className="text-foreground">
                  {[contact.city, contact.country].filter(Boolean).join(", ") || "—"}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Physical address</dt>
                <dd className="text-foreground">{contact.physicalAddress ?? "—"}</dd>
              </div>
              {contact.notes ? (
                <div className="sm:col-span-2">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Internal notes</dt>
                  <dd className="whitespace-pre-line text-foreground">{contact.notes}</dd>
                </div>
              ) : null}
            </dl>
            {canManage ? (
              <div className="mt-4 border-t border-border/70 pt-3">
                <div className="flex flex-wrap items-center gap-2">
                  {contact.archivedAt ? (
                    <form action={unarchiveContactAction}>
                      <Input type="hidden" name="id" value={contact.id} />
                      <Button variant="secondary" type="submit">
                        Unarchive customer
                      </Button>
                    </form>
                  ) : (
                    <form action={archiveContactAction}>
                      <Input type="hidden" name="id" value={contact.id} />
                      <ConfirmButton message="Archive this customer? Existing documents stay readable.">
                        Archive customer
                      </ConfirmButton>
                    </form>
                  )}
                  {canDelete ? (
                    <form action={deleteContactAction}>
                      <Input type="hidden" name="id" value={contact.id} />
                      <ConfirmButton
                        variant="destructive"
                        message="Permanently delete this customer? Linked passengers are kept, but the customer link is removed. This cannot be undone."
                      >
                        Delete customer
                      </ConfirmButton>
                    </form>
                  ) : null}
                </div>
                {!canDelete ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    This customer has {contact.quotations.length} quotation
                    {contact.quotations.length === 1 ? "" : "s"} and {itineraries.length} itinerar
                    {itineraries.length === 1 ? "y" : "ies"}, so it can only be archived.
                  </p>
                ) : null}
              </div>
            ) : null}
          </Card>

          <Card
            title={`Passengers (${contact.passengers.length})`}
            subtitle="Travellers linked to this paying customer"
          >
            {contact.passengers.length === 0 ? (
              <EmptyState title="No passengers linked" />
            ) : (
              <ul className="divide-y divide-border">
                {contact.passengers.map((passenger) => (
                  <li key={passenger.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <div>
                      <Link href={`/passengers/${passenger.id}`} className="font-semibold text-foreground">
                        {[passenger.title, passenger.firstName, passenger.lastName].filter(Boolean).join(" ")}
                      </Link>
                      <p className="text-xs capitalize text-muted-foreground">
                        {passenger.type}
                        {passenger.archivedAt ? " · archived" : ""}
                      </p>
                    </div>
                    {canManage ? (
                      <div className="flex items-center gap-1">
                        <Link
                          href={`/passengers/${passenger.id}/edit`}
                          className="btn-ghost px-2 py-1 text-xs"
                        >
                          Edit
                        </Link>
                        <form action={unlinkPassengerAction} className="flex items-center gap-2">
                          <Input type="hidden" name="contactId" value={contact.id} />
                          <Input type="hidden" name="passengerId" value={passenger.id} />
                          <Button variant="ghost" type="submit" className="px-2 py-1 text-xs">
                            Unlink
                          </Button>
                        </form>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}

            {canManage && !contact.archivedAt ? (
              <div className="mt-5 space-y-4 border-t border-border/70 pt-4">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Add a new passenger</h3>
                  <div className="mt-2">
                    <PassengerForm
                      action={createPassengerAction}
                      contactId={contact.id}
                      submitLabel="Add passenger"
                      cancelHref={`/customers/${contact.id}`}
                      compact
                    />
                  </div>
                </div>
                {availablePassengers.length > 0 ? (
                  <form action={linkPassengerAction} className="flex flex-wrap items-end gap-2">
                    <Input type="hidden" name="contactId" value={contact.id} />
                    <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Link an existing passenger
                      <SelectField
                        name="passengerId"
                        className="mt-1 min-w-[240px]"
                        required
                        placeholder="Choose a passenger"
                        options={[
                          { value: "", label: "Choose a passenger" },
                          ...availablePassengers.map((passenger) => ({
                            value: passenger.id,
                            label: `${[passenger.firstName, passenger.lastName].join(" ")} (${passenger.type})`,
                          })),
                        ]}
                      />
                    </label>
                    <Button variant="secondary" type="submit">
                      Link
                    </Button>
                  </form>
                ) : null}
              </div>
            ) : null}
          </Card>

          <Card title={`Quotations (${contact.quotations.length})`}>
            {contact.quotations.length === 0 ? (
              <EmptyState title="No quotations for this customer" />
            ) : (
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Number</th>
                      <th>Status</th>
                      <th>Issued</th>
                      <th>Valid until</th>
                      <th className="text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contact.quotations.map((quotation) => (
                      <tr key={quotation.id}>
                        <td>
                          <Link href={`/quotations/${quotation.id}`} className="font-semibold">
                            {quotation.number}
                          </Link>
                          {quotation.referenceNo ? (
                            <p className="text-xs text-muted-foreground">{quotation.referenceNo}</p>
                          ) : null}
                        </td>
                        <td><StatusBadge status={quotation.status} /></td>
                        <td className="text-muted-foreground">{formatDate(quotation.issueDate)}</td>
                        <td className="text-muted-foreground">{formatDate(quotation.validUntil)}</td>
                        <td className="text-right">
                          <Money
                            amountMinor={displayQuotationTotal(quotation, settings)}
                            currency={quotation.currency}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Balance">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Outstanding on pro formas
            </p>
            <p className="mt-1 text-2xl font-bold text-foreground">
              <Money amountMinor={balance} currency={settings.baseCurrency} className="[word-spacing:-0.15em]" />
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {proformas.filter((proforma) => proforma.status !== "cancelled").length} active pro
              forma{proformas.filter((proforma) => proforma.status !== "cancelled").length === 1 ? "" : "s"}
            </p>
          </Card>

          <Card title={`Pro formas (${proformas.length})`}>
            {proformas.length === 0 ? (
              <p className="text-sm text-muted-foreground">None issued yet.</p>
            ) : (
              <ul className="space-y-3">
                {proformas.map((proforma) => {
                  const paid = proforma.payments.reduce((sum, payment) => sum + payment.amountMinor, 0n);
                  return (
                    <li key={proforma.id} className="flex items-start justify-between gap-2 border-b border-border/70 pb-2 last:border-0">
                      <div>
                        <Link href={`/proformas/${proforma.id}`} className="font-semibold">
                          {proforma.number}
                        </Link>
                        <p className="text-xs text-muted-foreground">Due {proforma.dueDate ? formatDate(proforma.dueDate) : "—"}</p>
                      </div>
                      <div className="text-right">
                        <StatusBadge status={proforma.status} />
                        <p className="mt-1 text-xs text-muted-foreground">
                          <Money amountMinor={proforma.totalMinor - paid} currency={proforma.currency} /> due
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card title={`Itineraries (${itineraries.length})`}>
            {itineraries.length === 0 ? (
              <p className="text-sm text-muted-foreground">None issued yet.</p>
            ) : (
              <ul className="space-y-2">
                {itineraries.map((itinerary) => (
                  <li key={itinerary.id}>
                    <Link href={`/itineraries/${itinerary.id}`} className="font-semibold">
                      {itinerary.number}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      Issued {formatDate(itinerary.issuedAt)}
                      {itinerary.supersededAt ? " · superseded" : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      {canManage || hasCapability(user, "viewAudit") ? (
        <div className="mt-8">
          <HistoryPanel
            entity="Contact"
            entityId={contact.id}
            contactId={contact.id}
            canAddActivity={canManage}
            canViewAudit={hasCapability(user, "viewAudit")}
            canSeeCosts={hasCapability(user, "viewCosts")}
          />
        </div>
      ) : null}
    </div>
  );
}
