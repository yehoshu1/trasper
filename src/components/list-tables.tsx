"use client";

import { Button } from "@/components/ui/button";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { ColumnDef } from "@tanstack/react-table";

import { DataTable, type DataTableFilter } from "@/components/data-table";
import { Money, StatusBadge } from "@/components/ui";
import { minorToDecimalString } from "@/lib/money";
import { paymentTermOptions } from "@/lib/schemas";
import {
  bulkArchiveContactsAction,
  bulkArchiveProformasAction,
  bulkArchiveQuotationsAction,
  bulkCancelProformasAction,
  bulkCancelQuotationsAction,
  bulkDuplicateQuotationsAction,
  bulkUnarchiveProformasAction,
  bulkUnarchiveQuotationsAction,
} from "@/server/actions/bulk";
import type { ActionResult } from "@/server/actions/types";
import type { SavedTableViewState } from "@/lib/saved-views";

const QUOTATION_STATUSES = ["draft", "sent", "accepted", "declined", "expired", "cancelled", "superseded"];
const PROFORMA_STATUSES = ["draft", "unpaid", "part_paid", "paid", "cancelled"];

function statusLabel(value: string) {
  return value.replace("_", "-").replace(/^\w/, (letter) => letter.toUpperCase());
}

function statusOptions(statuses: string[]): DataTableFilter["options"] {
  return statuses.map((status) => ({ value: status, label: statusLabel(status) }));
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function downloadCsv(filename: string, headers: string[], rows: string[][]) {
  const content = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function BulkMessage({ message }: { message: string | null }) {
  if (!message) return null;
  return <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-300">{message}</span>;
}

export interface QuotationTableRow {
  id: string;
  number: string;
  referenceNo: string;
  customerId: string;
  customerName: string;
  optionLabels: string;
  status: string;
  archived: boolean;
  issuedIso: string;
  issued: string;
  validUntilIso: string;
  validUntil: string;
  optionCount: number;
  totalMinor: string;
  currency: string;
}

export function QuotationsTable({
  rows,
  initialSearch,
  initialStatus,
  initialView = null,
  archivedView = false,
}: {
  rows: QuotationTableRow[];
  initialSearch?: string;
  initialStatus?: string;
  initialView?: SavedTableViewState | null;
  archivedView?: boolean;
}) {
  const router = useRouter();
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const runBulk = (
    action: () => Promise<ActionResult>,
    clear: () => void,
  ) => {
    setBulkMessage(null);
    startTransition(async () => {
      const result = await action();
      setBulkMessage(result.ok ? (result.message ?? "Done") : (result.error ?? "Bulk action failed"));
      if (result.ok) {
        clear();
        router.refresh();
      }
    });
  };

  const columns: ColumnDef<QuotationTableRow>[] = [
    {
      id: "search",
      accessorFn: (row) =>
        [row.number, row.referenceNo, row.customerName, row.optionLabels, row.status].join(" "),
      header: "",
      cell: () => null,
    },
    {
      accessorKey: "number",
      header: "Number",
      cell: ({ row }) => (
        <div>
          <Link href={`/quotations/${row.original.id}`} className="font-semibold text-foreground">
            {row.original.number}
          </Link>
          {row.original.archived ? (
            <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Archived
            </span>
          ) : null}
          {row.original.referenceNo ? (
            <p className="text-xs text-muted-foreground">Ref {row.original.referenceNo}</p>
          ) : null}
        </div>
      ),
    },
    {
      accessorKey: "customerName",
      header: "Customer",
      cell: ({ row }) => (
        <div>
          <Link href={`/customers/${row.original.customerId}`} className="text-foreground">
            {row.original.customerName}
          </Link>
          <p className="text-xs text-muted-foreground">{row.original.optionLabels}</p>
        </div>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      filterFn: "equalsString",
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      accessorKey: "issuedIso",
      header: "Issued",
      cell: ({ row }) => <span className="text-muted-foreground">{row.original.issued}</span>,
    },
    {
      accessorKey: "validUntilIso",
      header: "Valid until",
      cell: ({ row }) => <span className="text-muted-foreground">{row.original.validUntil}</span>,
    },
    {
      accessorKey: "optionCount",
      header: "Options",
      meta: { align: "right" },
    },
    {
      id: "total",
      accessorFn: (row) => Number(row.totalMinor),
      header: "Total",
      meta: { align: "right" },
      cell: ({ row }) => (
        <span className="font-medium">
          <Money amountMinor={row.original.totalMinor} currency={row.original.currency} />
        </span>
      ),
    },
  ];

  return (
    <DataTable
      data={rows}
      columns={columns}
      hiddenColumns={["search"]}
      initialSearch={initialSearch}
      initialFilters={initialStatus ? [{ id: "status", value: initialStatus }] : []}
      initialSorting={[{ id: "issuedIso", desc: true }]}
      searchPlaceholder="Search number, reference, customer, option or status"
      filters={[
        { id: "status", label: "Statuses", options: statusOptions(QUOTATION_STATUSES) },
      ]}
      pageSize={30}
      empty="No quotations match the current search and filters."
      viewKey="quotations"
      initialView={initialView}
      selectable
      getRowId={(row) => row.id}
      bulkActions={(selected, clear) => (
        <>
          <Button variant="secondary"
            type="button" className="h-7 px-2 text-xs"
            onClick={() =>
              downloadCsv(
                "quotations.csv",
                ["Number", "Reference", "Customer", "Status", "Issued", "Valid until", "Options", "Total", "Currency"],
                selected.map((row) => [
                  row.number,
                  row.referenceNo,
                  row.customerName,
                  statusLabel(row.status),
                  row.issued,
                  row.validUntil,
                  String(row.optionCount),
                  minorToDecimalString(BigInt(row.totalMinor), row.currency),
                  row.currency,
                ]),
              )
            }
          >
            Export CSV
          </Button>
          <Button variant="secondary"
            type="button" className="h-7 px-2 text-xs"
            disabled={pending}
            onClick={() => runBulk(() => bulkDuplicateQuotationsAction(selected.map((row) => row.id)), clear)}
          >
            Duplicate
          </Button>
          {archivedView ? (
            <Button variant="secondary"
              type="button" className="h-7 px-2 text-xs"
              disabled={pending}
              onClick={() => runBulk(() => bulkUnarchiveQuotationsAction(selected.map((row) => row.id)), clear)}
            >
              Restore
            </Button>
          ) : (
            <Button variant="secondary"
              type="button" className="h-7 px-2 text-xs"
              disabled={pending}
              onClick={() => runBulk(() => bulkArchiveQuotationsAction(selected.map((row) => row.id)), clear)}
            >
              Archive
            </Button>
          )}
          <Button variant="secondary"
            type="button" className="h-7 px-2 text-xs"
            disabled={pending}
            onClick={() => {
              const reason = window.prompt("Reason for cancelling the selected quotations");
              if (!reason) return;
              runBulk(() => bulkCancelQuotationsAction(selected.map((row) => row.id), reason), clear);
            }}
          >
            Cancel
          </Button>
          <BulkMessage message={bulkMessage} />
        </>
      )}
    />
  );
}

export interface ProformaTableRow {
  id: string;
  number: string;
  referenceNo: string;
  customerName: string;
  quotationId: string;
  quotationNumber: string;
  issuedIso: string;
  issued: string;
  dueIso: string;
  due: string;
  status: string;
  archived: boolean;
  totalMinor: string;
  balanceMinor: string;
  currency: string;
}

export function ProformasTable({
  rows,
  initialSearch,
  initialStatus,
  initialView = null,
  archivedView = false,
}: {
  rows: ProformaTableRow[];
  initialSearch?: string;
  initialStatus?: string;
  initialView?: SavedTableViewState | null;
  archivedView?: boolean;
}) {
  const router = useRouter();
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const runBulk = (action: () => Promise<ActionResult>, clear: () => void) => {
    setBulkMessage(null);
    startTransition(async () => {
      const result = await action();
      setBulkMessage(result.ok ? (result.message ?? "Done") : (result.error ?? "Bulk action failed"));
      if (result.ok) {
        clear();
        router.refresh();
      }
    });
  };

  const columns: ColumnDef<ProformaTableRow>[] = [
    {
      id: "search",
      accessorFn: (row) =>
        [
          row.number,
          row.referenceNo,
          row.customerName,
          row.quotationNumber,
          row.status,
        ].join(" "),
      header: "",
      cell: () => null,
    },
    {
      accessorKey: "number",
      header: "Number",
      cell: ({ row }) => (
        <div>
          <Link href={`/proformas/${row.original.id}`} className="font-semibold text-foreground">
            {row.original.number}
          </Link>
          {row.original.archived ? (
            <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Archived
            </span>
          ) : null}
          {row.original.referenceNo ? (
            <p className="text-xs text-muted-foreground">Ref {row.original.referenceNo}</p>
          ) : null}
        </div>
      ),
    },
    { accessorKey: "customerName", header: "Customer" },
    {
      accessorKey: "quotationNumber",
      header: "Quotation",
      cell: ({ row }) => (
        <Link
          href={`/quotations/${row.original.quotationId}`}
          className="text-muted-foreground transition-colors hover:text-foreground"
        >
          {row.original.quotationNumber}
        </Link>
      ),
    },
    {
      accessorKey: "issuedIso",
      header: "Issued",
      cell: ({ row }) => <span className="text-muted-foreground">{row.original.issued}</span>,
    },
    {
      accessorKey: "dueIso",
      header: "Due",
      cell: ({ row }) => <span className="text-muted-foreground">{row.original.due}</span>,
    },
    {
      accessorKey: "status",
      header: "Status",
      filterFn: "equalsString",
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      id: "total",
      accessorFn: (row) => Number(row.totalMinor),
      header: "Total",
      meta: { align: "right" },
      cell: ({ row }) => (
        <Money amountMinor={row.original.totalMinor} currency={row.original.currency} />
      ),
    },
    {
      id: "balance",
      accessorFn: (row) => Number(row.balanceMinor),
      header: "Balance",
      meta: { align: "right" },
      cell: ({ row }) => (
        <span className="font-medium">
          <Money amountMinor={row.original.balanceMinor} currency={row.original.currency} />
        </span>
      ),
    },
  ];

  return (
    <DataTable
      data={rows}
      columns={columns}
      hiddenColumns={["search"]}
      initialSearch={initialSearch}
      initialFilters={initialStatus ? [{ id: "status", value: initialStatus }] : []}
      initialSorting={[{ id: "issuedIso", desc: true }]}
      searchPlaceholder="Search number, quotation, customer or reference"
      filters={[
        { id: "status", label: "Statuses", options: statusOptions(PROFORMA_STATUSES) },
      ]}
      pageSize={30}
      empty="No pro formas match the current search and filters."
      viewKey="proformas"
      initialView={initialView}
      selectable
      getRowId={(row) => row.id}
      bulkActions={(selected, clear) => (
        <>
          <Button variant="secondary"
            type="button" className="h-7 px-2 text-xs"
            onClick={() =>
              downloadCsv(
                "proformas.csv",
                ["Number", "Customer", "Quotation", "Issued", "Due", "Status", "Total", "Balance", "Currency"],
                selected.map((row) => [
                  row.number,
                  row.customerName,
                  row.quotationNumber,
                  row.issued,
                  row.due,
                  statusLabel(row.status),
                  minorToDecimalString(BigInt(row.totalMinor), row.currency),
                  minorToDecimalString(BigInt(row.balanceMinor), row.currency),
                  row.currency,
                ]),
              )
            }
          >
            Export CSV
          </Button>
          {archivedView ? (
            <Button variant="secondary"
              type="button" className="h-7 px-2 text-xs"
              disabled={pending}
              onClick={() => runBulk(() => bulkUnarchiveProformasAction(selected.map((row) => row.id)), clear)}
            >
              Restore
            </Button>
          ) : (
            <Button variant="secondary"
              type="button" className="h-7 px-2 text-xs"
              disabled={pending}
              onClick={() => runBulk(() => bulkArchiveProformasAction(selected.map((row) => row.id)), clear)}
            >
              Archive
            </Button>
          )}
          <Button variant="secondary"
            type="button" className="h-7 px-2 text-xs"
            disabled={pending}
            onClick={() => {
              const reason = window.prompt("Reason for cancelling the selected pro formas");
              if (!reason) return;
              runBulk(() => bulkCancelProformasAction(selected.map((row) => row.id), reason), clear);
            }}
          >
            Cancel
          </Button>
          <BulkMessage message={bulkMessage} />
        </>
      )}
    />
  );
}

export interface ItineraryTableRow {
  id: string;
  number: string;
  referenceNo: string;
  quotationId: string;
  quotationNumber: string;
  standalone: boolean;
  customerName: string;
  issuedIso: string;
  issued: string;
  issuedBy: string;
  state: "current" | "superseded";
  stateLabel: string;
}

export function ItinerariesTable({
  rows,
  initialSearch,
  initialState,
}: {
  rows: ItineraryTableRow[];
  initialSearch?: string;
  initialState?: "current" | "superseded";
}) {
  const columns: ColumnDef<ItineraryTableRow>[] = [
    {
      id: "search",
      accessorFn: (row) =>
        [row.number, row.referenceNo, row.quotationNumber, row.customerName, row.stateLabel].join(
          " ",
        ),
      header: "",
      cell: () => null,
    },
    {
      accessorKey: "number",
      header: "Number",
      cell: ({ row }) => (
        <div>
          <Link href={`/itineraries/${row.original.id}`} className="font-semibold text-foreground">
            {row.original.number}
          </Link>
          {row.original.referenceNo ? (
            <p className="text-xs text-muted-foreground">Ref {row.original.referenceNo}</p>
          ) : null}
        </div>
      ),
    },
    {
      accessorKey: "quotationNumber",
      header: "Quotation",
      cell: ({ row }) =>
        row.original.quotationId ? (
          <Link
            href={`/quotations/${row.original.quotationId}`}
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            {row.original.quotationNumber}
          </Link>
        ) : (
          <span className="text-xs text-muted-foreground">Standalone</span>
        ),
    },
    { accessorKey: "customerName", header: "Customer" },
    {
      accessorKey: "issuedIso",
      header: "Issued",
      cell: ({ row }) => <span className="text-muted-foreground">{row.original.issued}</span>,
    },
    {
      accessorKey: "issuedBy",
      header: "Issued by",
      cell: ({ row }) => <span className="text-muted-foreground">{row.original.issuedBy}</span>,
    },
    {
      accessorKey: "state",
      header: "Status",
      filterFn: "equalsString",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">{row.original.stateLabel}</span>
      ),
    },
  ];

  return (
    <DataTable
      data={rows}
      columns={columns}
      hiddenColumns={["search"]}
      initialSearch={initialSearch}
      initialFilters={initialState ? [{ id: "state", value: initialState }] : []}
      initialSorting={[{ id: "issuedIso", desc: true }]}
      searchPlaceholder="Search number, quotation, customer or reference"
      filters={[
        {
          id: "state",
          label: "Statuses",
          options: [
            { value: "current", label: "Current" },
            { value: "superseded", label: "Superseded" },
          ],
        },
      ]}
      pageSize={30}
      empty="No itineraries match the current search and filters."
    />
  );
}

export interface PaymentTableRow {
  id: string;
  paidOnIso: string;
  paidOn: string;
  proformaId: string;
  proformaNumber: string;
  quotationNumber: string;
  customerName: string;
  method: string;
  methodLabel: string;
  reference: string;
  recordedBy: string;
  recordedAt: string;
  amountMinor: string;
  currency: string;
  reversal: boolean;
}

export function PaymentsTable({
  rows,
  initialSearch,
  initialMethod,
  initialView = null,
}: {
  rows: PaymentTableRow[];
  initialSearch?: string;
  initialMethod?: string;
  initialView?: SavedTableViewState | null;
}) {
  const methodLabels = Object.fromEntries(paymentTermOptions);
  const columns: ColumnDef<PaymentTableRow>[] = [
    {
      id: "search",
      accessorFn: (row) =>
        [
          row.proformaNumber,
          row.quotationNumber,
          row.customerName,
          row.methodLabel,
          row.reference,
          row.recordedBy,
        ].join(" "),
      header: "",
      cell: () => null,
    },
    {
      accessorKey: "paidOnIso",
      header: "Paid on",
      cell: ({ row }) => <span className="text-foreground">{row.original.paidOn}</span>,
    },
    {
      accessorKey: "proformaNumber",
      header: "Pro forma",
      cell: ({ row }) => (
        <div>
          <Link
            href={`/proformas/${row.original.proformaId}`}
            className="font-semibold text-foreground"
          >
            {row.original.proformaNumber}
          </Link>
          <p className="text-xs text-muted-foreground">{row.original.quotationNumber}</p>
        </div>
      ),
    },
    { accessorKey: "customerName", header: "Customer" },
    {
      accessorKey: "method",
      header: "Method",
      filterFn: "equalsString",
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {methodLabels[row.original.method] ?? row.original.methodLabel}
        </span>
      ),
    },
    {
      accessorKey: "reference",
      header: "Reference",
      cell: ({ row }) =>
        row.original.reversal ? (
          <span className="text-red-700 dark:text-red-300">
            {row.original.reference || "Reversal"}
          </span>
        ) : (
          <span className="text-muted-foreground">{row.original.reference || "—"}</span>
        ),
    },
    {
      accessorKey: "recordedAt",
      header: "Recorded",
      enableSorting: false,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {row.original.recordedBy}
          <br />
          {row.original.recordedAt}
        </span>
      ),
    },
    {
      id: "amount",
      accessorFn: (row) => Number(row.amountMinor),
      header: "Amount",
      meta: { align: "right" },
      cell: ({ row }) => (
        <span
          className={
            row.original.reversal
              ? "font-medium text-red-700 dark:text-red-300"
              : "font-medium text-foreground"
          }
        >
          <Money amountMinor={row.original.amountMinor} currency={row.original.currency} />
        </span>
      ),
    },
  ];

  return (
    <DataTable
      data={rows}
      columns={columns}
      hiddenColumns={["search"]}
      initialSearch={initialSearch}
      initialFilters={initialMethod ? [{ id: "method", value: initialMethod }] : []}
      initialSorting={[{ id: "paidOnIso", desc: true }]}
      searchPlaceholder="Search pro forma, quotation, customer or reference"
      filters={[
        {
          id: "method",
          label: "Methods",
          options: paymentTermOptions.map(([value, label]) => ({ value, label })),
        },
      ]}
      pageSize={30}
      empty="No payments match the current search and filters."
      viewKey="payments"
      initialView={initialView}
      selectable
      getRowId={(row) => row.id}
      bulkActions={(selected) => (
        <Button variant="secondary"
          type="button" className="h-7 px-2 text-xs"
          onClick={() =>
            downloadCsv(
              "payments.csv",
              ["Paid on", "Pro forma", "Quotation", "Customer", "Method", "Reference", "Recorded by", "Recorded at", "Amount", "Currency", "Reversal"],
              selected.map((row) => [
                row.paidOn,
                row.proformaNumber,
                row.quotationNumber,
                row.customerName,
                row.methodLabel,
                row.reference,
                row.recordedBy,
                row.recordedAt,
                minorToDecimalString(BigInt(row.amountMinor), row.currency),
                row.currency,
                row.reversal ? "yes" : "no",
              ]),
            )
          }
        >
          Export CSV
        </Button>
      )}
    />
  );
}

export interface CustomerTableRow {
  id: string;
  name: string;
  type: string;
  attention: string;
  email: string;
  phone: string;
  city: string;
  country: string;
  passengerCount: number;
  quotationCount: number;
}

export function CustomersTable({
  rows,
  initialSearch,
  initialView = null,
}: {
  rows: CustomerTableRow[];
  initialSearch?: string;
  initialView?: SavedTableViewState | null;
}) {
  const router = useRouter();
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const columns: ColumnDef<CustomerTableRow>[] = [
    {
      id: "search",
      accessorFn: (row) =>
        [row.name, row.attention, row.email, row.phone, row.city, row.country, row.type].join(" "),
      header: "",
      cell: () => null,
    },
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => (
        <div>
          <Link href={`/customers/${row.original.id}`} className="font-semibold text-foreground">
            {row.original.name}
          </Link>
          {row.original.attention ? (
            <p className="text-xs text-muted-foreground">Attn: {row.original.attention}</p>
          ) : null}
        </div>
      ),
    },
    {
      accessorKey: "type",
      header: "Type",
      filterFn: "equalsString",
      cell: ({ row }) => <span className="capitalize text-muted-foreground">{row.original.type}</span>,
    },
    {
      id: "contact",
      accessorFn: (row) => [row.email, row.phone].join(" "),
      header: "Contact",
      cell: ({ row }) => (
        <div className="text-xs text-muted-foreground">
          {row.original.email ? <p>{row.original.email}</p> : null}
          {row.original.phone ? <p>{row.original.phone}</p> : null}
          {!row.original.email && !row.original.phone ? "—" : null}
        </div>
      ),
    },
    {
      accessorKey: "city",
      header: "City",
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {[row.original.city, row.original.country].filter(Boolean).join(", ") || "—"}
        </span>
      ),
    },
    {
      accessorKey: "passengerCount",
      header: "Passengers",
      meta: { align: "right" },
    },
    {
      accessorKey: "quotationCount",
      header: "Quotations",
      meta: { align: "right" },
    },
  ];

  return (
    <DataTable
      data={rows}
      columns={columns}
      hiddenColumns={["search"]}
      initialSearch={initialSearch}
      initialSorting={[{ id: "name", desc: false }]}
      searchPlaceholder="Search name, city, email or phone"
      filters={[
        {
          id: "type",
          label: "Types",
          options: [
            { value: "organisation", label: "Organisation" },
            { value: "individual", label: "Individual" },
          ],
        },
      ]}
      pageSize={30}
      empty="No customers match the current search and filters."
      viewKey="customers"
      initialView={initialView}
      selectable
      getRowId={(row) => row.id}
      bulkActions={(selected, clear) => (
        <>
          <Button variant="secondary"
            type="button" className="h-7 px-2 text-xs"
            onClick={() =>
              downloadCsv(
                "customers.csv",
                ["Name", "Type", "Attention", "Email", "Phone", "City", "Country", "Passengers", "Quotations"],
                selected.map((row) => [
                  row.name,
                  row.type,
                  row.attention,
                  row.email,
                  row.phone,
                  row.city,
                  row.country,
                  String(row.passengerCount),
                  String(row.quotationCount),
                ]),
              )
            }
          >
            Export CSV
          </Button>
          <Button variant="secondary"
            type="button" className="h-7 px-2 text-xs"
            disabled={pending}
            onClick={() => {
              startTransition(async () => {
                const result = await bulkArchiveContactsAction(selected.map((row) => row.id));
                setBulkMessage(result.ok ? (result.message ?? "Done") : (result.error ?? "Bulk action failed"));
                if (result.ok) {
                  clear();
                  router.refresh();
                }
              });
            }}
          >
            Archive
          </Button>
          <BulkMessage message={bulkMessage} />
        </>
      )}
    />
  );
}

export interface PassengerTableRow {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  type: string;
  contactCount: number;
  fareCount: number;
  archived: string;
}

export function PassengersTable({
  rows,
  initialSearch,
}: {
  rows: PassengerTableRow[];
  initialSearch?: string;
}) {
  const columns: ColumnDef<PassengerTableRow>[] = [
    {
      id: "search",
      accessorFn: (row) => [row.name, row.firstName, row.lastName, row.type, row.archived].join(" "),
      header: "",
      cell: () => null,
    },
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => (
        <div>
          <Link href={`/passengers/${row.original.id}`} className="font-semibold text-foreground">
            {row.original.name}
          </Link>
          {row.original.archived ? (
            <p className="text-xs text-muted-foreground">Archived</p>
          ) : null}
        </div>
      ),
    },
    {
      accessorKey: "type",
      header: "Type",
      filterFn: "equalsString",
      cell: ({ row }) => <span className="capitalize text-muted-foreground">{row.original.type}</span>,
    },
    {
      accessorKey: "contactCount",
      header: "Customers",
      meta: { align: "right" },
    },
    {
      accessorKey: "fareCount",
      header: "Fare lines",
      meta: { align: "right" },
    },
    {
      id: "actions",
      header: "",
      enableSorting: false,
      enableGlobalFilter: false,
      meta: { align: "right" },
      cell: ({ row }) => (
        <Link
          href={`/passengers/${row.original.id}/edit`}
          className="text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
        >
          Edit
        </Link>
      ),
    },
  ];

  return (
    <DataTable
      data={rows}
      columns={columns}
      hiddenColumns={["search"]}
      initialSearch={initialSearch}
      initialSorting={[{ id: "name", desc: false }]}
      searchPlaceholder="Search by first or last name"
      filters={[
        {
          id: "type",
          label: "Types",
          options: [
            { value: "adult", label: "Adult" },
            { value: "child", label: "Child" },
            { value: "infant", label: "Infant" },
          ],
        },
      ]}
      pageSize={30}
      empty="No passengers match the current search and filters."
    />
  );
}
