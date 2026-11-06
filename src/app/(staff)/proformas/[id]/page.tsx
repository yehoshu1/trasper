import { Button } from "@/components/ui/button";

import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import Link from "next/link";
import { notFound } from "next/navigation";

import { AttachmentPanel } from "@/components/attachment-panel";
import { ConfirmButton } from "@/components/confirm-button";
import { HistoryPanel } from "@/components/history-panel";
import { ProformaLinesEditor } from "@/components/proforma-lines-editor";
import {
  Alert,
  Card,
  Field,
  Money,
  PageHeader,
  StatusBadge,
} from "@/components/ui";
import { SelectField } from "@/components/ui/select";
import { canArchiveProforma } from "@/lib/archive";
import { formatDate, formatDateTime, todayInAppZone } from "@/lib/dates";
import { applyPaymentsToSchedule } from "@/lib/aged-debtors";
import { hasCapability } from "@/lib/permissions";
import { minorToDecimalString } from "@/lib/money";
import { parseSnapshot, type ProformaSnapshot } from "@/lib/documents";
import { travellerNamesText, travellerSlots } from "@/lib/travellers";
import { ProformaDocument } from "@/documents/proforma-document";
import { requireCapableUser } from "@/server/auth";
import { prisma } from "@/server/db";
import {
  archiveProformaAction,
  cancelProformaAction,
  sendProformaAction,
  unarchiveProformaAction,
  updateProformaDraftAction,
} from "@/server/actions/proformas";
import { recordPaymentAction, reversePaymentAction } from "@/server/actions/payments";
import { removeInstalmentsAction, saveInstalmentsAction } from "@/server/actions/instalments";
import { paymentTermOptions } from "@/lib/schemas";

export const dynamic = "force-dynamic";

const METHOD_LABELS = Object.fromEntries(paymentTermOptions);

export default async function ProformaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const user = await requireCapableUser("viewCosts");
  const { id } = await params;
  const query = await searchParams;

  const proforma = await prisma.proforma.findUnique({
    where: { id },
    include: {
      quotation: { include: { contact: true } },
      payments: {
        orderBy: { createdAt: "asc" },
        include: { recordedBy: { select: { name: true } } },
      },
      lines: { orderBy: { position: "asc" } },
      createdBy: { select: { name: true } },
    },
  });
  if (!proforma) notFound();

  const [instalments, banks] = await Promise.all([
    prisma.instalment.findMany({
      where: { proformaId: proforma.id },
      orderBy: { position: "asc" },
    }),
    prisma.bankAccount.findMany({
      where: { isArchived: false },
      orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
      select: { id: true, label: true, currency: true },
    }),
  ]);
  const snapshot = parseSnapshot<ProformaSnapshot>(proforma.snapshot);
  const isDraft = proforma.status === "draft";
  const paid = proforma.payments.reduce((sum, payment) => sum + payment.amountMinor, 0n);
  const balance = proforma.totalMinor - paid;
  const schedule = applyPaymentsToSchedule(
    instalments.map((entry) => ({
      id: entry.id,
      label: entry.label,
      dueDate: entry.dueDate,
      amountMinor: entry.amountMinor,
    })),
    paid,
    new Date(),
  );
  const canManage = hasCapability(user, "manageDocuments");
  const canRecord =
    hasCapability(user, "recordPayments") &&
    proforma.status !== "cancelled" &&
    !isDraft &&
    balance > 0n;
  const canCancel = canManage && proforma.status !== "cancelled";
  const canReverse = hasCapability(user, "recordPayments");
  const reversedIds = new Set(
    proforma.payments.filter((payment) => payment.reversesId).map((payment) => payment.reversesId as string),
  );
  const today = todayInAppZone().toISODate() ?? "";

  return (
    <div>
      <PageHeader
        eyebrow="Pro forma"
        title={`${proforma.number} · ${proforma.quotation.contact.name}`}
        subtitle={`Issued ${formatDate(proforma.issueDate)}${
          proforma.dueDate ? ` · due ${formatDate(proforma.dueDate)}` : ""
        } · ${proforma.quotation.number}`}
        actions={
          <>
            {canManage && !proforma.archivedAt && canArchiveProforma(proforma.status) ? (
              <form action={archiveProformaAction}>
                <Input type="hidden" name="proformaId" value={proforma.id} />
                <ConfirmButton
                  variant="secondary"
                  message="Archive this pro forma? It is hidden from the active list but stays in reports, audit and the payment ledger. Archiving does not cancel it."
                >
                  Archive
                </ConfirmButton>
              </form>
            ) : null}
            {canManage && proforma.archivedAt ? (
              <form action={unarchiveProformaAction}>
                <Input type="hidden" name="proformaId" value={proforma.id} />
                <ConfirmButton
                  variant="secondary"
                  message="Restore this pro forma to the active list?"
                >
                  Restore
                </ConfirmButton>
              </form>
            ) : null}
            <Link href={`/quotations/${proforma.quotationId}`} className="btn-secondary">
              Quotation
            </Link>
            <Link href={`/proformas/${proforma.id}/preview`} className="btn-secondary">
              Preview PDF
            </Link>
            <Link href={`/api/pdf/proforma/${proforma.id}`} className="btn-secondary">
              Download PDF
            </Link>
            <a href={`/api/word/proforma/${proforma.id}`} className="btn-secondary">
              Word (internal)
            </a>
          </>
        }
      />

      {query.error ? <Alert tone="error">{query.error}</Alert> : null}
      {query.saved ? <Alert tone="success">Saved.</Alert> : null}
      {isDraft ? (
        <Alert tone="info" title="Draft pro forma">
          This pro forma has not been sent. Edit the traveller names, dates and payment terms, then
          choose <strong>Mark sent</strong>. The number is already reserved and is never reused.
        </Alert>
      ) : null}
      {proforma.sentAt && !isDraft ? (
        <Alert tone="success" title="Sent">
          Sent {formatDateTime(proforma.sentAt)}. The document is now locked; later changes to the
          quotation, settings or reference data do not alter it.
        </Alert>
      ) : null}
      {proforma.archivedAt ? (
        <Alert tone="info" title="Archived">
          Archived {formatDateTime(proforma.archivedAt)}. This pro forma is hidden from the active
          list; it is not cancelled and its payments are unchanged. Use Restore to bring it back.
        </Alert>
      ) : null}
      {proforma.status === "cancelled" ? (
        <Alert tone="warning" title="Cancelled">
          {proforma.cancelledReason ?? "No reason recorded."}
          {proforma.cancelledAt ? ` — ${formatDateTime(proforma.cancelledAt)}` : ""}
        </Alert>
      ) : null}

      <div className="no-print mb-5 grid gap-4 sm:grid-cols-3">
        <div className="card card-body">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total</p>
          <p className="mt-1 text-xl font-bold text-foreground">
            <Money amountMinor={proforma.totalMinor} currency={proforma.currency} />
          </p>
        </div>
        <div className="card card-body">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Paid</p>
          <p className="mt-1 text-xl font-bold text-emerald-700 dark:text-emerald-300">
            <Money amountMinor={paid} currency={proforma.currency} />
          </p>
        </div>
        <div className="card card-body">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Balance</p>
          <p className="mt-1 text-xl font-bold text-foreground">
            <Money amountMinor={balance} currency={proforma.currency} />
          </p>
          <div className="mt-1">
            <StatusBadge status={proforma.status} />
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">
          {snapshot ? (
            <div className="overflow-x-auto pb-8">
              <ProformaDocument
                snapshot={snapshot}
                paidMinor={paid.toString()}
                payments={proforma.payments.map((payment) => ({
                  paidOn: formatDate(payment.paidOn),
                  amountMinor: payment.amountMinor.toString(),
                  method: METHOD_LABELS[payment.method] ?? payment.method,
                  reference: payment.reference ?? undefined,
                  reversal: Boolean(payment.reversesId),
                }))}
              />
            </div>
          ) : (
            <Card title="Snapshot unavailable">
              <p className="text-sm text-muted-foreground">
                The saved pro forma snapshot could not be read. The quotation remains available.
              </p>
            </Card>
          )}
        </div>

        <aside className="no-print min-w-0 space-y-5">
          {isDraft && canManage ? (
            <Card
              title="Draft details"
              subtitle="Traveller names and payment details are editable until the document is sent."
            >
              {snapshot ? (
                <form action={updateProformaDraftAction} className="space-y-3">
                  <Input type="hidden" name="proformaId" value={proforma.id} />
                  <Field
                    label="Traveller names"
                    htmlFor="travellerNames"
                    hint={`One name per line, in traveller order. ${travellerSlots(snapshot.passengers).length} traveller${travellerSlots(snapshot.passengers).length === 1 ? "" : "s"} on this document; blank lines stay "names to be advised".`}
                  >
                    <Textarea
                      id="travellerNames"
                      name="travellerNames"
                      rows={Math.max(4, travellerSlots(snapshot.passengers).length)}
                      className="font-mono text-xs"
                      defaultValue={travellerNamesText(snapshot.passengers)}
                      placeholder="One traveller name per line"
                    />
                  </Field>
                  <ProformaLinesEditor
                    lines={proforma.lines.map((line) => ({
                      description: line.description,
                      amountMinor: line.amountMinor.toString(),
                    }))}
                    currency={proforma.currency}
                  />
                  <Field label="Due date" htmlFor="dueDate">
                    <DatePicker
                      id="dueDate"
                      name="dueDate"
                      defaultValue={proforma.dueDate ? proforma.dueDate.toISOString().slice(0, 10) : ""}
                    />
                  </Field>
                  <Field label="Payment terms" htmlFor="terms">
                    <Textarea
                      id="terms"
                      name="terms"
                      rows={3}
                      defaultValue={proforma.terms ?? ""}
                    />
                  </Field>
                  <Field label="Payment details" htmlFor="bankAccountId">
                    <SelectField
                      id="bankAccountId"
                      name="bankAccountId"
                      defaultValue={proforma.bankAccountId ?? ""}
                      placeholder="Use the default account"
                      options={[
                        { value: "", label: "Use the default account" },
                        ...banks.map((bank) => ({
                          value: bank.id,
                          label: `${bank.label} · ${bank.currency}`,
                        })),
                      ]}
                    />
                  </Field>
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Checkbox name="showVat" defaultChecked={proforma.showVat} />
                    Show VAT explicitly even when the quotation layout hides it
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" type="submit">
                      Save draft
                    </Button>
                    <ConfirmButton
                      variant="default"
                      formAction={sendProformaAction}
                      title="Mark this pro forma as sent?"
                      message="This locks the document, freezes its snapshot and makes it available for payments. It cannot be edited afterwards."
                    >
                      Mark sent
                    </ConfirmButton>
                  </div>
                </form>
              ) : (
                <p className="text-sm text-muted-foreground">
                  The snapshot could not be read, so the draft cannot be edited here.
                </p>
              )}
            </Card>
          ) : null}

          {canRecord ? (
            <Card title="Record a payment" subtitle={`Balance ${minorToDecimalString(balance, proforma.currency)} ${proforma.currency}`}>
              <form action={recordPaymentAction} className="space-y-3">
                <Input type="hidden" name="proformaId" value={proforma.id} />
                <Field label="Date paid" htmlFor="paidOn">
                  <DatePicker id="paidOn" name="paidOn" required defaultValue={today} max={today} />
                </Field>
                <Field label={`Amount (${proforma.currency})`} htmlFor="amount">
                  <Input
                    id="amount"
                    name="amount" className="text-right"
                    inputMode="decimal"
                    required
                    defaultValue={minorToDecimalString(balance, proforma.currency)}
                  />
                </Field>
                <Field label="Method" htmlFor="method">
                  <SelectField
                    id="method"
                    name="method"
                    defaultValue="bank_transfer"
                    options={paymentTermOptions.map(([value, label]) => ({ value, label }))}
                  />
                </Field>
                <Field label="Reference" htmlFor="reference" hint="Bank slip or receipt number">
                  <Input id="reference" name="reference" maxLength={120} />
                </Field>
                <Button variant="default" type="submit" className="w-full">
                  Record payment
                </Button>
              </form>
            </Card>
          ) : null}

          {proforma.payments.length > 0 ? (
            <Card title="Payment history" subtitle="Append-only; corrections are reversals">
              <ul className="space-y-3">
                {proforma.payments.map((payment) => {
                  const isReversal = Boolean(payment.reversesId);
                  return (
                    <li key={payment.id} className="border-b border-border/70 pb-2 last:border-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className={`text-sm font-semibold ${isReversal ? "text-red-700 dark:text-red-300" : "text-foreground"}`}>
                            <Money amountMinor={payment.amountMinor} currency={proforma.currency} />
                            {isReversal ? " reversal" : ""}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatDate(payment.paidOn)} · {METHOD_LABELS[payment.method] ?? payment.method}
                          </p>
                          {payment.reference ? (
                            <p className="text-xs text-muted-foreground">{payment.reference}</p>
                          ) : null}
                          <p className="text-[10px] text-muted-foreground/70">
                            Recorded by {payment.recordedBy.name} · {formatDateTime(payment.createdAt)}
                          </p>
                        </div>
                        {canReverse && !isReversal && !reversedIds.has(payment.id) && proforma.status !== "cancelled" ? (
                          <form action={reversePaymentAction} className="flex flex-col items-end gap-1">
                            <Input type="hidden" name="paymentId" value={payment.id} />
                            <Input
                              name="reason" className="w-36 px-2 py-1 text-xs"
                              placeholder="Reason"
                              required
                              minLength={3}
                            />
                            <ConfirmButton variant="ghost" className="px-2 py-1 text-xs text-red-600 dark:text-red-400"
                              message="Create a reversing entry for this payment?"
                            >
                              Reverse
                            </ConfirmButton>
                          </form>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
          ) : null}

          <Card
            title="Payment schedule"
            subtitle="A target only. Status and balances still come from the payments."
          >
            {schedule.length > 0 ? (
              <div id="schedule" className="space-y-3">
                <ul className="space-y-2">
                  {schedule.map((entry) => (
                    <li key={entry.id} className="rounded-lg border border-border p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold">{entry.label}</p>
                          <p className="text-xs text-muted-foreground">Due {formatDate(entry.dueDate)}</p>
                        </div>
                        <span className={`badge ${entry.state === "paid" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" : entry.state === "overdue" ? "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300" : "bg-muted text-muted-foreground"}`}>
                          {entry.state.replace("_", " ")}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        <Money amountMinor={entry.paidMinor} currency={proforma.currency} /> paid of{" "}
                        <Money amountMinor={entry.amountMinor} currency={proforma.currency} />
                        {entry.outstandingMinor > 0n ? (
                          <> · <Money amountMinor={entry.outstandingMinor} currency={proforma.currency} /> outstanding</>
                        ) : null}
                      </p>
                    </li>
                  ))}
                </ul>
                {hasCapability(user, "manageDocuments") ? (
                  <form action={removeInstalmentsAction}>
                    <Input type="hidden" name="proformaId" value={proforma.id} />
                    <ConfirmButton variant="ghost" className="px-2 py-1 text-xs" message="Remove the instalment target? Payments are unchanged.">
                      Remove schedule
                    </ConfirmButton>
                  </form>
                ) : null}
                {hasCapability(user, "manageDocuments") && proforma.status !== "cancelled" ? (
                  <details>
                    <summary className="cursor-pointer text-xs font-semibold text-foreground">Replace schedule</summary>
                    <InstalmentForm proformaId={proforma.id} currency={proforma.currency} totalMinor={proforma.totalMinor} />
                  </details>
                ) : null}
              </div>
            ) : hasCapability(user, "manageDocuments") && proforma.status !== "cancelled" ? (
              <div id="schedule">
                <p className="mb-3 text-xs text-muted-foreground">
                  Add a deposit and balance target. The two amounts must add up to the pro forma total.
                </p>
                <InstalmentForm proformaId={proforma.id} currency={proforma.currency} totalMinor={proforma.totalMinor} />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No schedule set.</p>
            )}
          </Card>

          {canCancel ? (
            <Card title="Cancel pro forma">
              <p className="mb-2 text-xs text-muted-foreground">
                Cancelling needs a reason and is blocked while any payment remains. Reverse payments first.
              </p>
              <form action={cancelProformaAction} className="space-y-2">
                <Input type="hidden" name="proformaId" value={proforma.id} />
                <Textarea
                  name="reason"
                  rows={2}
                  required
                  minLength={3}
                  placeholder="Reason for cancelling"
                />
                <ConfirmButton variant="destructive" className="w-full" message="Cancel this pro forma? This is kept in the audit log.">
                  Cancel pro forma
                </ConfirmButton>
              </form>
            </Card>
          ) : null}

          <AttachmentPanel
            proformaId={proforma.id}
            canManage={hasCapability(user, "manageDocuments")}
          />

          <Card title="Details">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Quotation</dt>
                <dd>
                  <Link href={`/quotations/${proforma.quotationId}`} className="font-semibold">
                    {proforma.quotation.number}
                  </Link>
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Issued by</dt>
                <dd>{proforma.createdBy.name}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Created</dt>
                <dd>{formatDateTime(proforma.createdAt)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">VAT line</dt>
                <dd>{proforma.showVat ? "Shown" : "Hidden"}</dd>
              </div>
            </dl>
          </Card>
        </aside>
      </div>

      {hasCapability(user, "viewAudit") ? (
        <div className="mt-8">
          <HistoryPanel
            entity="Proforma"
            entityId={proforma.id}
            canViewAudit={hasCapability(user, "viewAudit")}
            canSeeCosts={hasCapability(user, "viewCosts")}
          />
        </div>
      ) : null}
    </div>
  );
}

function InstalmentForm({
  proformaId,
  currency,
  totalMinor,
}: {
  proformaId: string;
  currency: string;
  totalMinor: bigint;
}) {
  const deposit = totalMinor / 2n;
  const balance = totalMinor - deposit;
  const today = new Date().toISOString().slice(0, 10);
  return (
    <form action={saveInstalmentsAction} className="space-y-3">
      <Input type="hidden" name="proformaId" value={proformaId} />
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Deposit label
          <Input name="depositLabel" className="mt-1" defaultValue="Deposit" required maxLength={80} />
        </label>
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Due date
          <DatePicker name="depositDate" className="mt-1" defaultValue={today} required />
        </label>
      </div>
      <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Deposit amount ({currency})
        <Input name="depositAmount" className="mt-1 text-right" defaultValue={minorToDecimalString(deposit, currency)} required />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Balance label
          <Input name="balanceLabel" className="mt-1" defaultValue="Balance" required maxLength={80} />
        </label>
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Due date
          <DatePicker name="balanceDate" className="mt-1" defaultValue={today} required />
        </label>
      </div>
      <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Balance amount ({currency})
        <Input name="balanceAmount" className="mt-1 text-right" defaultValue={minorToDecimalString(balance, currency)} required />
      </label>
      <Button variant="secondary" type="submit" className="w-full">
        Save schedule
      </Button>
    </form>
  );
}
