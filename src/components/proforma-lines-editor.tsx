"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { minorToDecimalString, parseMoneyToMinor } from "@/lib/money";

interface Row {
  key: string;
  description: string;
  amount: string;
}

let rowCounter = 0;

function blankRow(): Row {
  rowCounter += 1;
  return { key: `line-${rowCounter}`, description: "", amount: "" };
}

function amountMinor(value: string, currency: string): string {
  try {
    return parseMoneyToMinor(value, currency).toString();
  } catch {
    return "0";
  }
}

/** Editable customer-facing price lines for a draft pro forma. */
export function ProformaLinesEditor({
  lines,
  currency,
}: {
  lines: { description: string; amountMinor: string }[];
  currency: string;
}) {
  const [rows, setRows] = useState<Row[]>(() =>
    lines.length > 0
      ? lines.map((line, index) => ({
          key: `line-${index}`,
          description: line.description,
          amount: minorToDecimalString(BigInt(line.amountMinor), currency),
        }))
      : [blankRow()],
  );

  const payload = rows
    .filter((row) => row.description.trim() !== "" || row.amount.trim() !== "")
    .map((row) => ({
      description: row.description.trim(),
      amountMinor: amountMinor(row.amount, currency),
    }));

  function update(index: number, patch: Partial<Row>) {
    setRows((current) =>
      current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)),
    );
  }

  return (
    <div>
      <input type="hidden" name="lines" value={JSON.stringify(payload)} readOnly />
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Price lines
        </p>
        <Button
          variant="ghost"
          type="button"
          className="px-2 py-1 text-xs"
          onClick={() => setRows((current) => [...current, blankRow()])}
        >
          + Add line
        </Button>
      </div>
      <p className="mb-2 text-[11px] text-muted-foreground">
        Edit the customer-facing descriptions and amounts. The pro forma total becomes the sum of
        these lines. Leave a line blank to ignore it.
      </p>
      <div className="overflow-x-auto">
        <table className="table min-w-[520px]">
          <thead>
            <tr>
              <th>Description</th>
              <th className="w-40 text-right">Amount ({currency})</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.key}>
                <td>
                  <Input
                    value={row.description}
                    placeholder="Fare or service"
                    onChange={(event) => update(index, { description: event.target.value })}
                  />
                </td>
                <td>
                  <Input
                    className="text-right"
                    inputMode="decimal"
                    value={row.amount}
                    onChange={(event) => update(index, { amount: event.target.value })}
                  />
                </td>
                <td>
                  <button
                    type="button"
                    className="text-xs font-semibold text-red-600 dark:text-red-400"
                    onClick={() =>
                      setRows((current) => current.filter((_, rowIndex) => rowIndex !== index))
                    }
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={3} className="py-3 text-center text-xs text-muted-foreground">
                  No price lines. Add one to continue.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
