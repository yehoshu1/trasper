import { Button } from "@/components/ui/button";

import { Input } from "@/components/ui/input";

import Link from "next/link";

import { EmptyState, PageHeader, StatusBadge } from "@/components/ui";
import { formatDate } from "@/lib/dates";
import { requireUser } from "@/server/auth";
import { globalSearch } from "@/server/search";

export const dynamic = "force-dynamic";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await requireUser();
  const { q } = await searchParams;
  const query = (q ?? "").trim();
  const results = await globalSearch(user, query);
  const { quotations, itineraries, proformas, customers, passengers, total } = results;

  return (
    <div className="max-w-4xl">
      <PageHeader
        eyebrow="Search"
        title="Global search"
        subtitle="By document number, reference, customer, passenger or PNR."
      />

      <form className="mb-6 flex flex-wrap gap-2" method="get">
        <Input
          type="search"
          name="q"
          defaultValue={query}
          autoFocus
          placeholder="QT-2026-0001, REF123, Chirwa, ABC123" className="max-w-lg"
          aria-label="Search"
        />
        <Button variant="default" type="submit">
          Search
        </Button>
      </form>

      {!query ? (
        <EmptyState title="Type to search" />
      ) : total === 0 ? (
        <EmptyState title={`Nothing found for “${query}”`}>
          Try a shorter term, a document number, a customer surname or a PNR.
        </EmptyState>
      ) : (
        <div className="space-y-6">
          {quotations.length > 0 ? (
            <section>
              <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Quotations ({quotations.length})
              </h2>
              <ul className="card divide-y divide-border">
                {quotations.map((quotation) => (
                  <li key={quotation.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <div>
                      <Link href={`/quotations/${quotation.id}`} className="font-semibold text-foreground">
                        {quotation.number}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {quotation.customerName}
                        {quotation.referenceNo ? ` · ref ${quotation.referenceNo}` : ""}
                      </p>
                    </div>
                    <div className="text-right">
                      <StatusBadge status={quotation.status} />
                      <p className="text-xs text-muted-foreground">{formatDate(quotation.issueDate)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {itineraries.length > 0 ? (
            <section>
              <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Itineraries ({itineraries.length})
              </h2>
              <ul className="card divide-y divide-border">
                {itineraries.map((itinerary) => (
                  <li key={itinerary.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <div>
                      <Link href={`/itineraries/${itinerary.id}`} className="font-semibold text-foreground">
                        {itinerary.number}
                      </Link>
                      <p className="text-xs text-muted-foreground">{itinerary.customerName}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">{formatDate(itinerary.issuedAt)}</p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {proformas.length > 0 ? (
            <section>
              <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Pro formas ({proformas.length})
              </h2>
              <ul className="card divide-y divide-border">
                {proformas.map((proforma) => (
                  <li key={proforma.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <div>
                      <Link href={`/proformas/${proforma.id}`} className="font-semibold text-foreground">
                        {proforma.number}
                      </Link>
                      <p className="text-xs text-muted-foreground">{proforma.customerName}</p>
                    </div>
                    <div className="text-right">
                      <StatusBadge status={proforma.status} />
                      <p className="text-xs text-muted-foreground">{formatDate(proforma.issueDate)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {customers.length > 0 ? (
            <section>
              <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Customers ({customers.length})
              </h2>
              <ul className="card divide-y divide-border">
                {customers.map((customer) => (
                  <li key={customer.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <div>
                      <Link href={`/customers/${customer.id}`} className="font-semibold text-foreground">
                        {customer.name}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {[customer.email, customer.city].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    {customer.archived ? (
                      <span className="badge bg-muted text-muted-foreground">Archived</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {passengers.length > 0 ? (
            <section>
              <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Passengers ({passengers.length})
              </h2>
              <ul className="card divide-y divide-border">
                {passengers.map((passenger) => (
                  <li key={passenger.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <div>
                      <Link href={`/passengers/${passenger.id}`} className="font-semibold text-foreground">
                        {passenger.firstName} {passenger.lastName}
                      </Link>
                      <p className="text-xs capitalize text-muted-foreground">{passenger.type}</p>
                    </div>
                    <Link
                      href={`/passengers/${passenger.id}/edit`}
                      className="text-xs font-semibold text-muted-foreground hover:text-foreground"
                    >
                      Edit
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
