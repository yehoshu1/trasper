import type { DocumentLine, DocumentPassenger } from "./documents";
import { roundDiv } from "./pricing";
import type { PricePresentation } from "./pricing/presentation";
import { taxRateLabel } from "./pricing/presentation";

const TYPE_LABELS: Record<DocumentPassenger["type"], string> = {
  adult: "Adult",
  child: "Child",
  infant: "Infant",
};

function passengerLabel(passenger: DocumentPassenger): string {
  return [passenger.firstName, passenger.lastName].filter(Boolean).join(" ").trim();
}

function fareLine(
  description: string,
  amountMinor: string,
  quantity: number | undefined,
  unitAmountMinor: string | undefined,
  passengers: DocumentPassenger[] | undefined,
): InvoiceLine {
  const group = /^(\d+)\s+(Adult|Child|Infant)s?$/i.exec(description.trim());
  if (group) {
    const count = Math.max(1, quantity && quantity > 1 ? quantity : Number(group[1]));
    const type = group[2]!.toLowerCase() as DocumentPassenger["type"];
    const names = (passengers ?? [])
      .filter((passenger) => !passenger.unnamed && passenger.type === type)
      .map(passengerLabel)
      .filter(Boolean);
    if (names.length > 0) {
      const listed = names.slice(0, count).map((name) => `${name} (${type})`);
      const missing = count - listed.length;
      if (missing > 0) {
        listed.push(`${missing} ${TYPE_LABELS[type]} name${missing === 1 ? "" : "s"} to be advised`);
      }
      return line(
        `Flight tickets for\n${listed.join("\n")}`,
        amountMinor,
        count,
        unitAmountMinor,
      );
    }
    return line(
      `Flight tickets for ${count} ${TYPE_LABELS[type]}${count === 1 ? "" : "s"}`,
      amountMinor,
      count,
      unitAmountMinor,
    );
  }

  const dash = description.indexOf(" — ");
  if (dash !== -1) {
    return line(
      `Flight ticket for ${description.slice(dash + 3)}`,
      amountMinor,
      quantity,
      unitAmountMinor,
    );
  }

  return line(`Flight ticket for ${description}`, amountMinor, quantity, unitAmountMinor);
}

export interface InvoiceLine {
  description: string;
  quantity: number;
  unitAmountMinor: string;
  amountMinor: string;
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
  passengers?: DocumentPassenger[];
  totalMinor?: string;
}): InvoiceLine[] {
  const rows: InvoiceLine[] = [];

  if (input.presentation) {
    for (const item of input.presentation.lines) {
      rows.push(
        item.kind === "fare"
          ? fareLine(
              item.description,
              item.amountMinor,
              item.quantity,
              item.unitAmountMinor,
              input.passengers,
            )
          : line(item.description, item.amountMinor, item.quantity, item.unitAmountMinor),
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
