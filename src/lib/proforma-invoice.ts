import type { DocumentLine } from "./documents";
import { roundDiv } from "./pricing";
import type { PricePresentation } from "./pricing/presentation";
import { taxRateLabel } from "./pricing/presentation";

export interface InvoiceLine {
  description: string;
  quantity: number;
  unitAmountMinor: string;
  amountMinor: string;
}

function fareDescription(description: string): string {
  const [kind, ...nameParts] = description.split(" — ");
  if (nameParts.length > 0) {
    return `Flight ticket for ${nameParts.join(" — ")}`;
  }
  return `Flight ticket for ${kind}`;
}

function line(
  description: string,
  amountMinor: string,
  quantity = 1,
  unitAmountMinor?: string,
): InvoiceLine {
  const count = Math.max(1, quantity);
  return {
    description,
    quantity: count,
    unitAmountMinor:
      unitAmountMinor ??
      roundDiv(BigInt(amountMinor), BigInt(count)).toString(),
    amountMinor,
  };
}

/**
 * Customer-facing invoice rows for a pro forma. Flights are not listed;
 * each fare or service becomes a quantity/unit-price/total line.
 */
export function proformaInvoiceLines(input: {
  lines: DocumentLine[];
  presentation?: PricePresentation;
  totalMinor?: string;
}): InvoiceLine[] {
  const rows: InvoiceLine[] = [];

  if (input.presentation) {
    for (const item of input.presentation.lines) {
      rows.push(
        line(
          item.kind === "fare" ? fareDescription(item.description) : item.description,
          item.amountMinor,
          item.quantity,
          item.unitAmountMinor,
        ),
      );
    }
    if (BigInt(input.presentation.serviceFeeMinor) !== 0n) {
      rows.push(
        line(input.presentation.serviceFeeLabel, input.presentation.serviceFeeMinor),
      );
    }
    for (const tax of input.presentation.taxLines) {
      const rate = tax.kind === "percent" ? ` (${taxRateLabel(tax)})` : "";
      rows.push(line(`${tax.name}${rate}`, tax.amountMinor));
    }
  } else {
    for (const item of input.lines) {
      rows.push(line(item.description, item.amountMinor));
    }
  }

  if (input.totalMinor) {
    const target = BigInt(input.totalMinor);
    const shown = rows.reduce((sum, item) => sum + BigInt(item.amountMinor), 0n);
    if (target !== shown) {
      rows.push(line("Travel services", (target - shown).toString()));
    }
  }
  return rows;
}
