/**
 * Presentation-only comparison of two frozen quotation revisions. The
 * snapshots are already immutable, so this module never
 * recalculates money; it only pairs lines and flights for display.
 */

export interface DiffLine {
  description: string;
  amountMinor: string;
}

export interface DiffFlight {
  airline: string;
  flightNo: string;
  fromIata: string;
  toIata: string;
  departLocal: string;
  arriveLocal: string;
  operatingCarrier?: string;
}

export interface DiffOption {
  label: string;
  pnr?: string;
  ticketingDeadline?: string;
  lines: DiffLine[];
  flights: DiffFlight[];
  totalMinor: string;
  costMinor?: string;
  markupMinor?: string;
  vatMinor?: string;
  taxesMinor?: string;
}

export interface DiffSnapshot {
  number: string;
  revision: number;
  issueDate: string;
  validUntil: string;
  currency: string;
  options: DiffOption[];
}

export type DiffState = "same" | "changed" | "added" | "removed";

export interface PairedLine extends DiffLine {
  state: DiffState;
}

export interface PairedFlight extends DiffFlight {
  state: DiffState;
}

export interface PairedOption {
  label: string;
  before?: DiffOption;
  after?: DiffOption;
  state: DiffState;
  lines: { before: PairedLine[]; after: PairedLine[] };
  flights: { before: PairedFlight[]; after: PairedFlight[] };
  totalChanged: boolean;
  pnrChanged: boolean;
  deadlineChanged: boolean;
}

function lineKey(line: DiffLine): string {
  return `${line.description}\u0000${line.amountMinor}`;
}

function flightKey(flight: DiffFlight): string {
  return `${flight.airline}|${flight.flightNo}|${flight.fromIata}|${flight.toIata}|${flight.departLocal}|${flight.arriveLocal}`;
}

function pair<T>(before: T[], after: T[], key: (item: T) => string, withState: (item: T, state: DiffState) => T & { state: DiffState }): { before: (T & { state: DiffState })[]; after: (T & { state: DiffState })[] } {
  const beforeKeys = new Set(before.map(key));
  const afterKeys = new Set(after.map(key));
  return {
    before: before.map((item) => withState(item, afterKeys.has(key(item)) ? "same" : "removed")),
    after: after.map((item) => withState(item, beforeKeys.has(key(item)) ? "same" : "added")),
  };
}

export function diffOptions(before: DiffSnapshot, after: DiffSnapshot): PairedOption[] {
  const labels = [...new Set([...before.options.map((option) => option.label), ...after.options.map((option) => option.label)])];
  return labels.map((label) => {
    const oldOption = before.options.find((option) => option.label === label);
    const newOption = after.options.find((option) => option.label === label);
    const lines = pair<DiffLine>(
      oldOption?.lines ?? [],
      newOption?.lines ?? [],
      lineKey,
      (item, state) => ({ ...item, state }),
    );
    const flights = pair<DiffFlight>(
      oldOption?.flights ?? [],
      newOption?.flights ?? [],
      flightKey,
      (item, state) => ({ ...item, state }),
    );
    const state: DiffState = !oldOption
      ? "added"
      : !newOption
        ? "removed"
        : lines.before.some((line) => line.state !== "same") ||
            lines.after.some((line) => line.state !== "same") ||
            flights.before.some((flight) => flight.state !== "same") ||
            flights.after.some((flight) => flight.state !== "same") ||
            oldOption.totalMinor !== newOption.totalMinor ||
            oldOption.pnr !== newOption.pnr
          ? "changed"
          : "same";
    return {
      label,
      before: oldOption,
      after: newOption,
      state,
      lines,
      flights,
      totalChanged: oldOption?.totalMinor !== newOption?.totalMinor,
      pnrChanged: oldOption?.pnr !== newOption?.pnr,
      deadlineChanged: oldOption?.ticketingDeadline !== newOption?.ticketingDeadline,
    };
  });
}

export function summaryForDiff(options: PairedOption[]): {
  added: number;
  removed: number;
  changed: number;
  unchanged: number;
} {
  return {
    added: options.filter((option) => option.state === "added").length,
    removed: options.filter((option) => option.state === "removed").length,
    changed: options.filter((option) => option.state === "changed").length,
    unchanged: options.filter((option) => option.state === "same").length,
  };
}
