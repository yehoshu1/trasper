"use client";

import { Button } from "@/components/ui/button";

import { Input } from "@/components/ui/input";

import { useState, useTransition, type ReactNode } from "react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type RowData,
  type RowSelectionState,
  type SortingState,
  type Updater,
  type VisibilityState,
} from "@tanstack/react-table";
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Columns3,
  RotateCcw,
  Save,
  Search,
  X,
} from "lucide-react";

import { resetTableViewAction, saveTableViewAction } from "@/server/actions/views";
import type { ListKey, SavedTableViewState } from "@/lib/saved-views";
import { Checkbox } from "@/components/ui/checkbox";
import { SelectField } from "@/components/ui/select";

declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    align?: "left" | "right";
    headerClassName?: string;
    cellClassName?: string;
  }
}

export interface DataTableFilter {
  id: string;
  label: string;
  options: { label: string; value: string }[];
}

export interface DataTableProps<TData> {
  data: TData[];
  columns: ColumnDef<TData, unknown>[];
  searchPlaceholder?: string;
  initialSearch?: string;
  initialSorting?: SortingState;
  initialFilters?: ColumnFiltersState;
  filters?: DataTableFilter[];
  pageSize?: number;
  empty?: ReactNode;
  getRowId?: (row: TData) => string;
  hiddenColumns?: string[];
  /** Persist column visibility, sort and filters per user for this list. */
  viewKey?: ListKey;
  initialView?: SavedTableViewState | null;
  /** Render checkboxes and a bulk-action bar. Requires getRowId. */
  selectable?: boolean;
  bulkActions?: (selected: TData[], clearSelection: () => void) => ReactNode;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function DataTable<TData>({
  data,
  columns,
  searchPlaceholder = "Search…",
  initialSearch = "",
  initialSorting = [],
  initialFilters = [],
  filters = [],
  pageSize = 25,
  empty,
  getRowId,
  hiddenColumns = [],
  viewKey,
  initialView = null,
  selectable = false,
  bulkActions,
}: DataTableProps<TData>) {
  const baseVisibility: VisibilityState = Object.fromEntries(
    hiddenColumns.map((id) => [id, false]),
  );
  const base = {
    globalFilter: initialSearch,
    sorting: initialSorting,
    filters: initialFilters,
    visibility: baseVisibility,
  };

  const [sorting, setSorting] = useState<SortingState>(initialView?.sorting ?? initialSorting);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>(
    initialView?.filters ?? initialFilters,
  );
  const [globalFilter, setGlobalFilter] = useState(initialView?.globalFilter ?? initialSearch);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({
    ...baseVisibility,
    ...(initialView?.visibility ?? {}),
  });
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [viewMessage, setViewMessage] = useState<string | null>(null);
  const [savingView, startViewTransition] = useTransition();

  const selectionColumn: ColumnDef<TData, unknown> = {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        aria-label="Select all rows"
        checked={
          table.getIsAllPageRowsSelected()
            ? true
            : table.getIsSomePageRowsSelected()
              ? "indeterminate"
              : false
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(value === true)}
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        aria-label="Select row"
        checked={row.getIsSelected()}
        disabled={!row.getCanSelect()}
        onCheckedChange={(value) => row.toggleSelected(value === true)}
      />
    ),
    enableSorting: false,
    enableGlobalFilter: false,
    enableHiding: false,
    size: 32,
  };

  const allColumns = selectable ? [selectionColumn, ...columns] : columns;

  const table = useReactTable({
    data,
    columns: allColumns,
    state: { sorting, columnFilters, globalFilter, columnVisibility, rowSelection },
    onSortingChange: (updater: Updater<SortingState>) => {
      setSorting((current) => (typeof updater === "function" ? updater(current) : updater));
    },
    onColumnFiltersChange: (updater: Updater<ColumnFiltersState>) => {
      setColumnFilters((current) => (typeof updater === "function" ? updater(current) : updater));
    },
    onGlobalFilterChange: setGlobalFilter,
    onColumnVisibilityChange: (updater) => {
      setColumnVisibility((current) => (typeof updater === "function" ? updater(current) : updater));
    },
    onRowSelectionChange: setRowSelection,
    enableRowSelection: selectable,
    globalFilterFn: "includesString",
    getRowId,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: { pageSize },
    },
  });

  const filteredCount = table.getFilteredRowModel().rows.length;
  const hasQuery = globalFilter.trim().length > 0 || columnFilters.length > 0;
  const pageCount = Math.max(1, table.getPageCount());
  const selectedRows = table.getSelectedRowModel().rows.map((row) => row.original);
  const hideableColumns = table
    .getAllLeafColumns()
    .filter((column) => !["select", "search"].includes(column.id));

  function reset() {
    setGlobalFilter(base.globalFilter);
    setColumnFilters(base.filters);
    setSorting(base.sorting);
    setColumnVisibility(base.visibility);
    table.setPageIndex(0);
  }

  function saveView() {
    if (!viewKey) return;
    setViewMessage(null);
    startViewTransition(async () => {
      const result = await saveTableViewAction({
        listKey: viewKey,
        globalFilter,
        sorting,
        filters: columnFilters.map((filter) => ({
          id: filter.id,
          value: String(filter.value ?? ""),
        })),
        visibility: columnVisibility as Record<string, boolean>,
      });
      setViewMessage(result.ok ? "View saved" : (result.error ?? "Could not save the view"));
    });
  }

  function resetView() {
    if (!viewKey) return;
    setViewMessage(null);
    startViewTransition(async () => {
      const result = await resetTableViewAction(viewKey);
      setViewMessage(result.ok ? "View reset" : (result.error ?? "Could not reset the view"));
      if (result.ok) reset();
    });
  }

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
        <label className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={globalFilter}
            onChange={(event) => setGlobalFilter(event.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder} className="h-8 pl-8 text-[13px]"
          />
        </label>
        {filters.map((filter) => {
          const column = table.getColumn(filter.id);
          return (
            <SelectField
              key={filter.id}
              value={asString(column?.getFilterValue())}
              onValueChange={(value) => column?.setFilterValue(value || undefined)}
              aria-label={filter.label}
              placeholder={`All ${filter.label.toLowerCase()}`}
              className="h-8 w-auto text-[13px]"
              options={[
                { value: "", label: `All ${filter.label.toLowerCase()}` },
                ...filter.options,
              ]}
            />
          );
        })}
        {hasQuery ? (
          <Button variant="ghost" type="button" onClick={reset} className="h-8 px-2 text-xs">
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </Button>
        ) : null}

        {viewKey ? (
          <div className="flex items-center gap-1">
            <details className="relative">
              <summary className="btn-ghost flex h-8 cursor-pointer list-none items-center gap-1 px-2 text-xs">
                <Columns3 className="h-3.5 w-3.5" />
                Columns
              </summary>
              <div className="absolute left-0 z-20 mt-1 w-56 rounded-lg border bg-card p-3 text-sm shadow-lg sm:left-auto sm:right-0">
                {hideableColumns.map((column) => (
                  <label key={column.id} className="flex items-center gap-2 py-0.5 capitalize">
                    <Checkbox
                      checked={column.getIsVisible()}
                      onCheckedChange={(value) =>
                        setColumnVisibility((current) => ({
                          ...current,
                          [column.id]: value === true,
                        }))
                      }
                    />
                    {String(column.columnDef.header ?? column.id)}
                  </label>
                ))}
              </div>
            </details>
            <Button variant="ghost"
              type="button"
              onClick={saveView}
              disabled={savingView} className="h-8 px-2 text-xs"
              title="Save this sort, filter and column layout for your account"
            >
              <Save className="h-3.5 w-3.5" />
              Save view
            </Button>
            <Button variant="ghost"
              type="button"
              onClick={resetView}
              disabled={savingView} className="h-8 px-2 text-xs"
              title="Forget the saved view for this list"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
            {viewMessage ? (
              <span className="text-[11px] text-muted-foreground">{viewMessage}</span>
            ) : null}
          </div>
        ) : null}

        <span className="ml-auto hidden text-xs tabular-nums text-muted-foreground sm:block">
          {filteredCount === data.length
            ? `${data.length} row${data.length === 1 ? "" : "s"}`
            : `${filteredCount} of ${data.length}`}
        </span>
      </div>

      {selectable && selectedRows.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 border-b bg-muted/40 px-4 py-2 text-xs">
          <span className="font-semibold">{selectedRows.length} selected</span>
          {bulkActions?.(selectedRows, () => setRowSelection({}))}
          <Button variant="ghost" type="button" className="ml-auto h-7 px-2 text-xs" onClick={() => setRowSelection({})}>
            Clear
          </Button>
        </div>
      ) : null}

      {filteredCount === 0 ? (
        <div className="px-4 py-10 text-center text-sm text-muted-foreground">
          {empty ?? "No rows match the current search and filters."}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => {
                    const align = header.column.columnDef.meta?.align;
                    const sorted = header.column.getIsSorted();
                    return (
                      <th
                        key={header.id}
                        className={`${align === "right" ? "text-right" : ""} ${
                          header.column.columnDef.meta?.headerClassName ?? ""
                        }`}
                      >
                        {header.isPlaceholder ? null : header.column.getCanSort() ? (
                          <button
                            type="button"
                            onClick={header.column.getToggleSortingHandler()}
                            className={`inline-flex items-center gap-1 transition-colors hover:text-foreground ${
                              align === "right" ? "justify-end" : ""
                            }`}
                            aria-label={`Sort by ${String(header.column.columnDef.header ?? header.column.id)}`}
                          >
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {sorted === "asc" ? (
                              <ArrowUp className="h-3 w-3" />
                            ) : sorted === "desc" ? (
                              <ArrowDown className="h-3 w-3" />
                            ) : (
                              <ChevronsUpDown className="h-3 w-3 opacity-40" />
                            )}
                          </button>
                        ) : (
                          flexRender(header.column.columnDef.header, header.getContext())
                        )}
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => (
                <tr key={row.id} data-selected={row.getIsSelected() || undefined}>
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      className={`${cell.column.columnDef.meta?.align === "right" ? "text-right tabular-nums" : ""} ${
                        cell.column.columnDef.meta?.cellClassName ?? ""
                      }`}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {filteredCount > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2.5 text-xs text-muted-foreground">
          <span className="tabular-nums">
            {filteredCount === 0
              ? "No rows"
              : `${table.getState().pagination.pageIndex * pageSize + 1}–${Math.min(
                  (table.getState().pagination.pageIndex + 1) * pageSize,
                  filteredCount,
                )} of ${filteredCount}`}
          </span>
          <div className="flex items-center gap-1">
            <Button variant="secondary"
              type="button"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()} className="h-7 px-2 text-xs"
              aria-label="Previous page"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Previous
            </Button>
            <span className="px-2 tabular-nums">
              {table.getState().pagination.pageIndex + 1} / {pageCount}
            </span>
            <Button variant="secondary"
              type="button"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()} className="h-7 px-2 text-xs"
              aria-label="Next page"
            >
              Next
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
