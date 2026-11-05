import { Button } from "@/components/ui/button";

import { Input } from "@/components/ui/input";

import { Checkbox } from "@/components/ui/checkbox";

import { DatePicker } from "@/components/ui/date-picker";
import { Textarea } from "@/components/ui/textarea";

import Link from "next/link";
import { notFound } from "next/navigation";

import { AttachmentPanel } from "@/components/attachment-panel";
import { ConfirmButton } from "@/components/confirm-button";
import { HistoryPanel } from "@/components/history-panel";
import { QuotationEditor } from "@/components/quotation-editor";
import {
  Alert,
  Card,
  EmptyState,
  Money,
  PageHeader,
  StatusBadge,
} from "@/components/ui";
import { SelectField } from "@/components/ui/select";
import { canArchiveQuotation } from "@/lib/archive";
import { formatDate, formatDateTime } from "@/lib/dates";
import { parseSnapshot, type QuotationSnapshot } from "@/lib/documents";
import { formatRateMicro } from "@/lib/money";
import { hasCapability } from "@/lib/permissions";
import { QuotationDocument } from "@/documents/quotation-document";
import { requireCapableUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { createItineraryFormAction } from "@/server/actions/itineraries";
import { createProformaAction } from "@/server/actions/proformas";
import { archiveQuotationAction, unarchiveQuotationAction } from "@/server/actions/quotations";
import { buildQuotationSnapshot } from "@/server/documents";
import {
  expireOverdueQuotations,
  latestRate,
  loadQuotation,
  toEditorQuotation,
  vatContextFor,
} from "@/server/quotations";
import { getSettings } from "@/server/settings";

export const dynamic = "force-dynamic";

export default async function QuotationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const user = await requireCapableUser("viewDocuments");
  const { id } = await params;
  const query = await searchParams;
  await expireOverdueQuotations();

  const quotation = await loadQuotation(id);
  if (!quotation) notFound();
  const settings = await getSettings();
  const canSeeCosts = hasCapability(user, "viewCosts");
  const hasComparison = Boolean(
    quotation.supersedesId ||
      (await prisma.quotation.findFirst({
        where: { supersedesId: quotation.id },
        select: { id: true },
      })),
  );
  const canEdit = hasCapability(user, "manageQuotations") && quotation.status === "draft";
  const canManage = hasCapability(user, "manageQuotations");

  if (!canSeeCosts) {
    // Viewers receive the customer-facing document only: no cost, rate,
    // margin or profit fields ever leave the server for this role. Issued
    // quotations use their frozen snapshot, not current settings.
    let snapshot: QuotationSnapshot | null = null;
    try {
      snapshot = parseSnapshot<QuotationSnapshot>(quotation.snapshot);
      if (!snapshot) snapshot = await buildQuotationSnapshot(quotation, settings);
    } catch {
      snapshot = null;
    }
    return (
      <div>
        <PageHeader
          eyebrow="Quotation"
          title={`${quotation.number} · ${quotation.contact.name}`}
          subtitle="Customer-facing view. Cost and margin are hidden for your role."
          actions={
            <>
              {hasComparison ? (
                <Link href={`/quotations/${quotation.id}/diff`} className="btn-secondary">Compare revisions</Link>
              ) : null}
              <Link href="/quotations" className="btn-secondary">Back to quotations</Link>
            </>
          }
        />
        {query.error ? <Alert tone="error">{query.error}</Alert> : null}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <StatusBadge status={quotation.status} />
          <span className="text-xs text-muted-foreground">
            Issued {formatDate(quotation.issueDate)} · Valid until {formatDate(quotation.validUntil)}
          </span>
          <Link href={`/quotations/${quotation.id}/preview`} className="btn-secondary ml-auto">
            Preview PDF
          </Link>
          <a href={`/api/pdf/quotation/${quotation.id}`} className="btn-secondary">
            Download PDF
          </a>
        </div>
        {snapshot ? (
          <div className="overflow-x-auto pb-8">
            <QuotationDocument snapshot={snapshot} />
          </div>
        ) : (
          <EmptyState title="This quotation cannot be shown yet">
            Flight details are incomplete. Ask an agent to finish the draft.
          </EmptyState>
        )}
      </div>
    );
  }

  const [currencies, branches, banks, passengers, rates] = await Promise.all([
    prisma.currency.findMany({ where: { active: true }, orderBy: { code: "asc" } }),
    prisma.branch.findMany({ where: { active: true }, orderBy: { code: "asc" } }),
    prisma.bankAccount.findMany({
      where: { isArchived: false },
      orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
      select: { id: true, label: true, currency: true, isDefault: true },
    }),
    prisma.passenger.findMany({
      // A draft may use any active passenger; ones linked to this customer
      // are offered first. Read-only views stay limited to passengers already
      // linked to the customer or already priced on this quotation.
      where: canEdit
        ? { archivedAt: null }
        : {
            OR: [
              { contacts: { some: { id: quotation.contactId } } },
              { fares: { some: { option: { quotationId: quotation.id } } } },
            ],
          },
      include: {
        contacts: { where: { id: quotation.contactId }, select: { id: true } },
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
    Promise.all(
      (await prisma.currency.findMany({ where: { active: true } })).map(async (currency) => {
        if (currency.code === quotation.currency) return [currency.code, null] as const;
        const rate = await latestRate(currency.code, quotation.currency);
        return [
          currency.code,
          rate
            ? {
                rate: formatRateMicro(rate.rateMicro),
                effectiveFrom: formatDate(rate.effectiveFrom),
              }
            : null,
        ] as const;
      }),
    ),
  ]);

  const branchOptions = [
    ...branches.map((branch) => ({ code: branch.code, name: branch.name })),
    ...(branches.some((branch) => branch.code === quotation.branch)
      ? []
      : [{ code: quotation.branch, name: "" }]),
  ];

  const vat = vatContextFor(quotation, settings);
  const currencyCodes = [
    ...new Set([quotation.currency, settings.baseCurrency, ...currencies.map((entry) => entry.code)]),
  ];

  return (
    <div>
      <PageHeader
        eyebrow="Quotation"
        title={`${quotation.number} · ${quotation.contact.name}`}
        subtitle="Options, flights, fares, margin and taxes. Sending locks the quotation and freezes its totals."
        actions={
          <>
            {canManage && !quotation.archivedAt && canArchiveQuotation(quotation.status) ? (
              <form action={archiveQuotationAction}>
                <Input type="hidden" name="quotationId" value={quotation.id} />
                <ConfirmButton
                  variant="secondary"
                  message="Archive this quotation? It is hidden from active lists but stays in reports and the audit log. Archiving does not cancel it or change its documents."
                >
                  Archive
                </ConfirmButton>
              </form>
            ) : null}
            {canManage && quotation.archivedAt ? (
              <form action={unarchiveQuotationAction}>
                <Input type="hidden" name="quotationId" value={quotation.id} />
                <ConfirmButton
                  variant="secondary"
                  message="Restore this quotation to the active lists?"
                >
                  Restore
                </ConfirmButton>
              </form>
            ) : null}
            {hasComparison ? (
              <Link href={`/quotations/${quotation.id}/diff`} className="btn-secondary">
                Compare revisions
              </Link>
            ) : null}
            <a href={`/api/word/quotation/${quotation.id}`} className="btn-secondary">
              Word (internal)
            </a>
            <Link href="/quotations" className="btn-secondary">
              Back to quotations
            </Link>
          </>
        }
      />

      {query.error ? <Alert tone="error">{query.error}</Alert> : null}
      {query.saved ? <Alert tone="success">Saved.</Alert> : null}
      {quotation.archivedAt ? (
        <Alert tone="info" title="Archived">
          Archived {formatDateTime(quotation.archivedAt)}. This record is hidden from the active
          quotation list; it is not cancelled and its documents and payments are unchanged. Use
          Restore to bring it back.
        </Alert>
      ) : null}
      {quotation.supersedesId ? (
        <Alert tone="info">
          This revision supersedes{" "}
          <Link href={`/quotations/${quotation.supersedesId}`} className="font-semibold underline">
            the previous version
          </Link>
          .
        </Alert>
      ) : null}
      {quotation.status === "cancelled" ? (
        <Alert tone="warning" title="Cancelled">
          {quotation.cancelledReason ?? "No reason recorded."}
          {quotation.cancelledAt ? ` — ${formatDateTime(quotation.cancelledAt)}` : ""}
        </Alert>
      ) : null}

      <QuotationEditor
        quotation={toEditorQuotation(quotation)}
        vat={{
          enabled: vat.enabled,
          rateBps: settings.vatRateBps.toString(),
          roundingUnit: settings.roundingUnit.toString(),
        }}
        passengers={passengers.map((passenger) => ({
          id: passenger.id,
          name: [passenger.title, passenger.firstName, passenger.lastName].filter(Boolean).join(" "),
          type: passenger.type as "adult" | "child" | "infant",
          linked: passenger.contacts.length > 0,
        }))}
        currencies={currencyCodes}
        branches={branchOptions}
        banks={banks}
        canEdit={canEdit}
        canManage={canManage}
        isAdmin={user.role === "admin"}
        latestRates={Object.fromEntries(rates)}
        defaultMarginBps={settings.defaultMarginBps.toString()}
        presentation={{
          defaultPriceDisplay: settings.pricingDisplay,
          defaultTaxDisplay: settings.taxDisplay,
          serviceFeeLabel: settings.serviceFeeLabel,
          taxLabel: settings.taxLabel,
          vatLabel: settings.vatLabel,
          totalLabel: settings.totalLabel,
          perPersonLabel: settings.perPersonLabel,
          taxNote: settings.taxNote,
        }}
      />

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card title="Documents" subtitle="Issued from the accepted option">
          <div className="space-y-4">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Itineraries</h3>
              {quotation.itineraries.length === 0 ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  {quotation.status === "accepted"
                    ? "None issued yet."
                    : "Available once an option is accepted."}
                </p>
              ) : (
                <ul className="mt-1 divide-y divide-border">
                  {quotation.itineraries.map((itinerary) => (
                    <li key={itinerary.id} className="flex items-center justify-between gap-2 py-1.5">
                      <Link href={`/itineraries/${itinerary.id}`} className="font-semibold text-foreground">
                        {itinerary.number}
                      </Link>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(itinerary.issuedAt)}
                        {itinerary.supersededAt ? " · superseded" : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Pro formas</h3>
              {quotation.proformas.length === 0 ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  {quotation.status === "accepted"
                    ? "None issued yet."
                    : "Available once an option is accepted."}
                </p>
              ) : (
                <ul className="mt-1 divide-y divide-border">
                  {quotation.proformas.map((proforma) => {
                    const paid = proforma.payments.reduce((sum, payment) => sum + payment.amountMinor, 0n);
                    return (
                      <li key={proforma.id} className="flex items-center justify-between gap-2 py-1.5">
                        <Link href={`/proformas/${proforma.id}`} className="font-semibold text-foreground">
                          {proforma.number}
                        </Link>
                        <span className="flex items-center gap-2 text-xs text-muted-foreground">
                          <StatusBadge status={proforma.status} />
                          <Money amountMinor={proforma.totalMinor - paid} currency={proforma.currency} /> due
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            {quotation.status === "accepted" && hasCapability(user, "manageDocuments") ? (
              <div className="space-y-3 border-t border-border/70 pt-3">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Issue documents
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Both documents are copied from the accepted option and frozen when issued.
                  </p>
                </div>
                <form action={createItineraryFormAction}>
                  <Input type="hidden" name="quotationId" value={quotation.id} />
                  <Button variant="secondary" type="submit">
                    Create itinerary
                  </Button>
                </form>
                <form action={createProformaAction} className="space-y-2">
                  <Input type="hidden" name="quotationId" value={quotation.id} />
                  <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Pro forma due date
                    <DatePicker name="dueDate" className="mt-1 max-w-[200px]" />
                  </label>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Payment terms
                    <Textarea
                      name="terms"
                      rows={2} className="mt-1"
                      placeholder={settings.paymentTerms}
                    />
                  </label>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Payment details
                    <SelectField
                      name="bankAccountId"
                      className="mt-1"
                      defaultValue={quotation.bankAccountId ?? ""}
                      placeholder="Use the default account"
                      options={[
                        { value: "", label: "Use the default account" },
                        ...banks.map((bank) => ({
                          value: bank.id,
                          label: `${bank.label} · ${bank.currency}`,
                        })),
                      ]}
                    />
                  </label>
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Checkbox name="showVat" />
                    Show VAT explicitly even when the quotation layout hides it
                  </label>
                  <Button variant="default" type="submit">
                    Create pro forma
                  </Button>
                </form>
              </div>
            ) : null}
          </div>
        </Card>
      </div>

      <p className="mt-4 text-xs text-muted-foreground/70">
        Created {formatDateTime(quotation.createdAt)}
        {quotation.sentAt ? ` · sent ${formatDateTime(quotation.sentAt)}` : ""}
        {quotation.lockedAt ? " · locked" : ""}
      </p>

      <div className="mt-8">
        <AttachmentPanel
          quotationId={quotation.id}
          canManage={hasCapability(user, "manageDocuments")}
        />
      </div>

      {canManage || hasCapability(user, "viewAudit") ? (
        <div className="mt-8">
          <HistoryPanel
            entity="Quotation"
            entityId={quotation.id}
            quotationId={quotation.id}
            contactId={quotation.contactId}
            canAddActivity={canManage}
            canViewAudit={hasCapability(user, "viewAudit")}
            canSeeCosts={canSeeCosts}
          />
        </div>
      ) : null}
    </div>
  );
}
