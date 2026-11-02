import Link from "next/link";
import { notFound } from "next/navigation";

import { Alert, Card, Money, PageHeader, StatusBadge } from "@/components/ui";
import { diffOptions, summaryForDiff, type DiffSnapshot } from "@/lib/revision-diff";
import { parseSnapshot, type QuotationSnapshot } from "@/lib/documents";
import { hasCapability } from "@/lib/permissions";
import { requireCapableUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { buildQuotationSnapshot } from "@/server/documents";
import { loadQuotation } from "@/server/quotations";
import { getSettings } from "@/server/settings";

export const dynamic = "force-dynamic";

function fromSnapshot(snapshot: QuotationSnapshot): DiffSnapshot {
  return {
    number: snapshot.number,
    revision: snapshot.revision,
    issueDate: snapshot.issueDate,
    validUntil: snapshot.validUntil,
    currency: snapshot.currency,
    options: snapshot.options.map((option) => ({
      label: option.label,
      pnr: option.pnr,
      ticketingDeadline: option.ticketingDeadline,
      lines: option.lines,
      flights: option.flights.map((flight) => ({
        airline: flight.airline,
        flightNo: flight.flightNo,
        fromIata: flight.fromIata,
        toIata: flight.toIata,
        departLocal: flight.departLocal,
        arriveLocal: flight.arriveLocal,
        operatingCarrier: flight.operatingCarrier,
      })),
      totalMinor: option.totalMinor,
      costMinor: option.costMinor,
      markupMinor: option.markupMinor,
      vatMinor: option.vatMinor,
      taxesMinor: option.taxesMinor,
    })),
  };
}

function stateClass(state: string, side: "before" | "after"): string {
  if (state === "same") return "";
  if (state === "added") return side === "after" ? "bg-emerald-50 dark:bg-emerald-500/10" : "bg-muted/40";
  if (state === "removed") return side === "before" ? "bg-red-50 dark:bg-red-500/10" : "bg-muted/40";
  return "bg-amber-50 dark:bg-amber-500/10";
}

export default async function RevisionDiffPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireCapableUser("viewDocuments");
  const { id } = await params;
  const quotation = await loadQuotation(id);
  if (!quotation) notFound();

  const otherId = quotation.supersedesId;
  const next = otherId
    ? null
    : await prisma.quotation.findFirst({ where: { supersedesId: quotation.id }, select: { id: true } });
  const comparisonId = otherId ?? next?.id;
  if (!comparisonId) notFound();
  const comparison = await loadQuotation(comparisonId);
  if (!comparison) notFound();

  const settings = await getSettings();
  const [currentSnapshot, otherSnapshot] = await Promise.all([
    parseSnapshot<QuotationSnapshot>(quotation.snapshot) ?? buildQuotationSnapshot(quotation, settings),
    parseSnapshot<QuotationSnapshot>(comparison.snapshot) ?? buildQuotationSnapshot(comparison, settings),
  ]);

  // Order by revision, not by which page the user opened.
  const [before, after] =
    quotation.revision <= comparison.revision
      ? [fromSnapshot(currentSnapshot), fromSnapshot(otherSnapshot)]
      : [fromSnapshot(otherSnapshot), fromSnapshot(currentSnapshot)];
  const options = diffOptions(before, after);
  const summary = summaryForDiff(options);
  const canSeeCosts = hasCapability(user, "viewCosts");

  return (
    <div>
      <PageHeader
        eyebrow="Quotation revisions"
        title={`${before.number} · revision ${before.revision} → ${after.number} · revision ${after.revision}`}
        subtitle="Side-by-side comparison of the frozen snapshots. Nothing here recalculates money."
        actions={
          <>
            <Link href={`/quotations/${quotation.id}`} className="btn-secondary">
              Back to quotation
            </Link>
            <Link href={`/quotations/${comparison.id}`} className="btn-secondary">
              Other revision
            </Link>
          </>
        }
      />

      {!canSeeCosts ? (
        <Alert tone="info">
          Cost, markup and VAT columns are hidden for your role.
        </Alert>
      ) : null}

      <div className="mb-5 grid gap-3 sm:grid-cols-4">
        <div className="card card-body">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Changed options</p>
          <p className="mt-1 text-xl font-bold">{summary.changed}</p>
        </div>
        <div className="card card-body">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Added</p>
          <p className="mt-1 text-xl font-bold text-emerald-700 dark:text-emerald-300">{summary.added}</p>
        </div>
        <div className="card card-body">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Removed</p>
          <p className="mt-1 text-xl font-bold text-red-700 dark:text-red-300">{summary.removed}</p>
        </div>
        <div className="card card-body">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Unchanged</p>
          <p className="mt-1 text-xl font-bold">{summary.unchanged}</p>
        </div>
      </div>

      <Card title="Header">
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Field</th>
                <th>{before.number} (revision {before.revision})</th>
                <th>{after.number} (revision {after.revision})</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="font-medium">Issued</td>
                <td>{before.issueDate}</td>
                <td className={before.issueDate !== after.issueDate ? "bg-amber-50 dark:bg-amber-500/10" : ""}>{after.issueDate}</td>
              </tr>
              <tr>
                <td className="font-medium">Valid until</td>
                <td>{before.validUntil}</td>
                <td className={before.validUntil !== after.validUntil ? "bg-amber-50 dark:bg-amber-500/10" : ""}>{after.validUntil}</td>
              </tr>
              <tr>
                <td className="font-medium">Currency</td>
                <td>{before.currency}</td>
                <td className={before.currency !== after.currency ? "bg-amber-50 dark:bg-amber-500/10" : ""}>{after.currency}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      <div className="mt-5 space-y-5">
        {options.map((option) => (
          <Card
            key={option.label}
            title={`${option.label} · ${option.state === "same" ? "unchanged" : option.state}`}
            subtitle={
              option.totalChanged
                ? "The option total changed"
                : "Line prices and flights compared against the frozen snapshot"
            }
          >
            <div className="grid gap-5 lg:grid-cols-2">
              {(["before", "after"] as const).map((side) => {
                const data = side === "before" ? option.before : option.after;
                const title = side === "before" ? `Revision ${before.revision}` : `Revision ${after.revision}`;
                return (
                  <div key={side} className="min-w-0">
                    <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">{title}</p>
                    {!data ? (
                      <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                        This option did not exist in this revision.
                      </p>
                    ) : (
                      <>
                        <dl className="mb-3 grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <dt className="text-xs text-muted-foreground">PNR</dt>
                            <dd className={option.pnrChanged ? "bg-amber-50 font-semibold dark:bg-amber-500/10" : ""}>
                              {data.pnr || "—"}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs text-muted-foreground">Ticketing deadline</dt>
                            <dd className={option.deadlineChanged ? "bg-amber-50 dark:bg-amber-500/10" : ""}>
                              {data.ticketingDeadline ? data.ticketingDeadline.replace("T", " ").slice(0, 16) : "—"}
                            </dd>
                          </div>
                          <div className="col-span-2">
                            <dt className="text-xs text-muted-foreground">Total</dt>
                            <dd className={`text-lg font-bold ${option.totalChanged ? "bg-amber-50 dark:bg-amber-500/10" : ""}`}>
                              <Money amountMinor={data.totalMinor} currency={after.currency} />
                            </dd>
                          </div>
                          {canSeeCosts ? (
                            <>
                              <div>
                                <dt className="text-xs text-muted-foreground">Cost</dt>
                                <dd><Money amountMinor={data.costMinor ?? "0"} currency={after.currency} /></dd>
                              </div>
                              <div>
                                <dt className="text-xs text-muted-foreground">Markup</dt>
                                <dd><Money amountMinor={data.markupMinor ?? "0"} currency={after.currency} /></dd>
                              </div>
                              <div>
                                <dt className="text-xs text-muted-foreground">VAT</dt>
                                <dd><Money amountMinor={data.vatMinor ?? "0"} currency={after.currency} /></dd>
                              </div>
                              <div>
                                <dt className="text-xs text-muted-foreground">Taxes</dt>
                                <dd><Money amountMinor={data.taxesMinor ?? "0"} currency={after.currency} /></dd>
                              </div>
                            </>
                          ) : null}
                        </dl>

                        <table className="table text-xs">
                          <thead>
                            <tr>
                              <th>Line</th>
                              <th className="text-right">Price</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(side === "before" ? option.lines.before : option.lines.after).map((line, index) => (
                              <tr key={`${line.description}-${index}`} className={stateClass(line.state, side)}>
                                <td>{line.description}</td>
                                <td className="text-right"><Money amountMinor={line.amountMinor} currency={after.currency} /></td>
                              </tr>
                            ))}
                            {(side === "before" ? option.lines.before : option.lines.after).length === 0 ? (
                              <tr><td colSpan={2} className="text-muted-foreground">No lines</td></tr>
                            ) : null}
                          </tbody>
                        </table>

                        <table className="table mt-3 text-xs">
                          <thead>
                            <tr>
                              <th>Flight</th>
                              <th>Departs</th>
                              <th>Arrives</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(side === "before" ? option.flights.before : option.flights.after).map((flight, index) => (
                              <tr key={`${flight.flightNo}-${index}`} className={stateClass(flight.state, side)}>
                                <td>{flight.airline} {flight.flightNo} · {flight.fromIata}→{flight.toIata}</td>
                                <td>{flight.departLocal.replace("T", " ")}</td>
                                <td>{flight.arriveLocal.replace("T", " ")}</td>
                              </tr>
                            ))}
                            {(side === "before" ? option.flights.before : option.flights.after).length === 0 ? (
                              <tr><td colSpan={3} className="text-muted-foreground">No flights</td></tr>
                            ) : null}
                          </tbody>
                        </table>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <StatusBadge status={sideStatus(option.state)} />
              <span className="text-xs text-muted-foreground">
                {option.state === "same"
                  ? "No differences in this option"
                  : "Amber marks a changed row; green is added and red is removed"}
              </span>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function sideStatus(state: string): string {
  if (state === "added") return "accepted";
  if (state === "removed") return "cancelled";
  if (state === "changed") return "sent";
  return "draft";
}
