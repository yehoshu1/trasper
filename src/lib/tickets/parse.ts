/**
 * Deterministic parser for airline/GDS e-ticket output.
 *
 * It reads the common "TKT:" coupon block and the "*HTE" electronic ticket list
 * shown by airline systems. It never guesses a ticket number: only 13-digit
 * values are accepted, and duplicate blocks are merged.
 */

export interface ParsedTicketCoupon {
  useType: string;
  carrier: string;
  flightNo: string;
  bookingClass: string;
  cabin?: string;
  travelDate?: string;
  fromIata: string;
  toIata: string;
  departTime: string;
  arriveTime?: string;
  fromTerminal?: string;
  toTerminal?: string;
  status: string;
  fareBasis?: string;
  coupon?: string;
  notValidBefore?: string;
  notValidAfter?: string;
  baggage?: string;
  aircraft?: string;
  stopInfo?: string;
  meal?: string;
  raw: string;
}

export interface ParsedTicket {
  number: string;
  passengerName: string;
  issueDate?: string;
  formOfPayment?: string;
  pseudo?: string;
  platingCarrier?: string;
  iso?: string;
  iata?: string;
  coupons: ParsedTicketCoupon[];
  rawText: string;
}

export interface TicketParseResult {
  tickets: ParsedTicket[];
  unparsed: string[];
  warnings: string[];
}

const MONTHS: Record<string, number> = {
  JAN: 0,
  FEB: 1,
  MAR: 2,
  APR: 3,
  MAY: 4,
  JUN: 5,
  JUL: 6,
  AUG: 7,
  SEP: 8,
  OCT: 9,
  NOV: 10,
  DEC: 11,
};

function isoDate(year: number, month: number, day: number): string | undefined {
  const date = new Date(Date.UTC(year, month, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month || date.getUTCDate() !== day) {
    return undefined;
  }
  return date.toISOString().slice(0, 10);
}

/** Read 06NOV26, 06NOV2026 or 06NOV into an ISO calendar date. */
function parseTicketDate(value: string, fallbackYear?: number, anchor?: string): string | undefined {
  const match = /^(\d{2})([A-Z]{3})(\d{2,4})?$/i.exec(value.trim());
  if (!match) return undefined;
  const day = Number(match[1]);
  const month = MONTHS[match[2]!.toUpperCase()];
  if (month === undefined) return undefined;
  let year = match[3]
    ? match[3].length === 2
      ? 2000 + Number(match[3])
      : Number(match[3])
    : fallbackYear ?? new Date().getUTCFullYear();
  if (!match[3] && anchor) {
    const anchorDate = new Date(`${anchor}T00:00:00Z`);
    const candidate = new Date(Date.UTC(year, month, day));
    // A January coupon on a December ticket belongs to the next year.
    if (candidate.getTime() < anchorDate.getTime() - 30 * 24 * 60 * 60 * 1000) year += 1;
  }
  return isoDate(year, month, day);
}

function clock(value: string): string {
  const digits = value.replace(/\D/g, "").padStart(4, "0").slice(0, 4);
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

function cleanName(name: string): string {
  return name.replace(/\s+/g, " ").replace(/\/$/, "").trim();
}

function ticketNumber(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  return /^\d{13}$/.test(digits) ? digits : null;
}

const SEGMENT_RE =
  /^\s*(ARPT|OPEN)\s+([A-Z0-9]{2})\s+([A-Z0-9]{1,6})\s+([A-Z])\s+(\d{2}[A-Z]{3})(?:\s+([A-Z]{3})([A-Z]{3}))?\s+(\d{3,4})\s+([A-Z]{2})\s+(\S+)\s+(\d+)?\s*$/i;

const NVB_RE = /NVB\s*(\d{2}[A-Z]{3})\s+NVA\s*(\d{2}[A-Z]{3})\s+(\S+)/i;

function parseCouponBlock(
  block: string[],
  issueDate: string | undefined,
): { coupons: ParsedTicketCoupon[]; header: Record<string, string> } {
  const header: Record<string, string> = {};
  const coupons: ParsedTicketCoupon[] = [];
  const referenceYear = issueDate ? Number(issueDate.slice(0, 4)) : undefined;

  for (const rawLine of block) {
    const line = rawLine.trimEnd();
    if (!line.trim()) continue;

    const tkt = /^TKT:\s*(.+?)\s+NAME:\s*(.+)$/i.exec(line);
    if (tkt) {
      header.number = tkt[1]!;
      header.name = cleanName(tkt[2]!);
      continue;
    }
    const issued = /^ISSUED:\s*(\d{2}[A-Z]{3}\d{2,4})\s+FOP:\s*(.*)$/i.exec(line);
    if (issued) {
      header.issued = issued[1]!;
      header.fop = issued[2]!.trim();
      continue;
    }
    const pseudo = /PSEUDO:\s*(\S+)\s+PLATING CARRIER:\s*(\S+)\s+ISO:\s*(\S+)\s+IATA:\s*(\S+)/i.exec(line);
    if (pseudo) {
      header.pseudo = pseudo[1]!;
      header.platingCarrier = pseudo[2]!;
      header.iso = pseudo[3]!;
      header.iata = pseudo[4]!;
      continue;
    }

    const segment = SEGMENT_RE.exec(line);
    if (segment) {
      const codes = `${segment[6] ?? ""}${segment[7] ?? ""}`;
      const fromIata = codes.slice(0, 3);
      const toIata = codes.slice(3, 6);
      coupons.push({
        useType: segment[1]!.toUpperCase(),
        carrier: segment[2]!.toUpperCase(),
        flightNo: segment[3]!.toUpperCase(),
        bookingClass: segment[4]!.toUpperCase(),
        travelDate: parseTicketDate(segment[5]!, referenceYear, issueDate),
        fromIata,
        toIata,
        departTime: clock(segment[8]!),
        status: segment[9]!.toUpperCase(),
        fareBasis: segment[10] || undefined,
        coupon: segment[11] || undefined,
        raw: line.trim(),
      });
      continue;
    }

    const validity = NVB_RE.exec(line);
    if (validity && coupons.length > 0) {
      const last = coupons[coupons.length - 1]!;
      last.notValidBefore = parseTicketDate(validity[1]!, referenceYear, issueDate);
      last.notValidAfter = parseTicketDate(validity[2]!, referenceYear, issueDate);
      last.baggage = validity[3] || undefined;
      continue;
    }
  }

  return { coupons, header };
}

export function parseTickets(text: string): TicketParseResult {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const tickets = new Map<string, ParsedTicket>();
  const warnings: string[] = [];
  const unparsed: string[] = [];

  // TKT blocks, ending at the next TKT or the electronic ticket list.
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (!/^\s*TKT:/i.test(line)) continue;
    const block: string[] = [];
    let cursor = index;
    for (; cursor < lines.length; cursor += 1) {
      const current = lines[cursor]!;
      if (cursor > index && (/^\s*TKT:/i.test(current) || /ELECTRONIC TICKET LIST/i.test(current))) {
        break;
      }
      block.push(current);
    }
    index = cursor - 1;

    const { coupons, header } = parseCouponBlock(block, undefined);
    const number = ticketNumber(header.number ?? "");
    if (!number || !header.name) {
      warnings.push("A ticket block had no readable 13-digit ticket number or passenger name.");
      continue;
    }
    const issueDate = header.issued ? parseTicketDate(header.issued) : undefined;
    if (issueDate && coupons.length > 0) {
      // Re-read coupon dates against the issue date year.
      const refreshed = parseCouponBlock(block, issueDate);
      coupons.splice(0, coupons.length, ...refreshed.coupons);
    }

    const ticket: ParsedTicket = {
      number,
      passengerName: header.name,
      issueDate,
      formOfPayment: header.fop,
      pseudo: header.pseudo,
      platingCarrier: header.platingCarrier,
      iso: header.iso,
      iata: header.iata,
      coupons,
      rawText: block.join("\n").trim(),
    };
    const existing = tickets.get(number);
    if (existing) {
      // Keep the first rich block, but adopt a fuller name if one has it.
      if (existing.passengerName.length < ticket.passengerName.length) {
        existing.passengerName = ticket.passengerName;
      }
      if (existing.coupons.length === 0 && ticket.coupons.length > 0) {
        Object.assign(existing, ticket, { passengerName: existing.passengerName });
      }
      continue;
    }
    tickets.set(number, ticket);
  }

  // Electronic ticket list entries, usually introduced by *HTE.
  for (const line of lines) {
    if (!/^\s*(?:>\*\S*|\*[A-Z]{2}\d+\S*)[\s·:]/i.test(line)) continue;
    const match = /^\s*(?:>\*\S*|\*[A-Z]{2}\d+\S*)\s*[·:]?\s*(.+?)\s+(\d{13})\s*$/i.exec(
      line.trim(),
    );
    if (!match) {
      unparsed.push(line.trim());
      continue;
    }
    const number = match[2]!;
    const name = cleanName(match[1]!);
    const existing = tickets.get(number);
    if (existing) {
      if (existing.passengerName.length < name.length) existing.passengerName = name;
      continue;
    }
    tickets.set(number, {
      number,
      passengerName: name,
      coupons: [],
      rawText: line.trim(),
    });
  }

  if (tickets.size === 0) {
    warnings.push("No 13-digit ticket numbers were found. Paste the airline ticket block or the *HTE ticket list.");
  }

  return {
    tickets: [...tickets.values()],
    unparsed,
    warnings: [...new Set(warnings)],
  };
}

export interface GroupedTicket {
  primary: ParsedTicket;
  secondary?: ParsedTicket;
}

/**
 * Two ticket stocks are often issued for one passenger (for example KQ and TC).
 * Pair them by surname, then by a compatible given name so two passengers who
 * share a surname are never merged.
 */
export function groupParsedTickets(tickets: ParsedTicket[]): {
  groups: GroupedTicket[];
  warnings: string[];
} {
  const bucketBySurname = new Map<string, { given: string; tickets: ParsedTicket[] }[]>();

  for (const ticket of tickets) {
    const [surnamePart, givenPart] = ticket.passengerName.split("/");
    const surname = (surnamePart ?? ticket.passengerName).trim().toUpperCase();
    const given = (givenPart ?? "").trim().toUpperCase();
    const buckets = bucketBySurname.get(surname) ?? [];
    // A truncated given name ("MILTON KU") still belongs to the same passenger
    // as the fuller form ("MILTON KUDZALA"); two different given names do not.
    const bucket = buckets.find(
      (candidate) =>
        !candidate.given ||
        !given ||
        candidate.given === given ||
        candidate.given.startsWith(given) ||
        given.startsWith(candidate.given),
    );
    if (bucket) {
      bucket.tickets.push(ticket);
      if (given.length > bucket.given.length) bucket.given = given;
    } else {
      buckets.push({ given, tickets: [ticket] });
    }
    bucketBySurname.set(surname, buckets);
  }

  const warnings: string[] = [];
  const groups: GroupedTicket[] = [];
  for (const buckets of bucketBySurname.values()) {
    for (const bucket of buckets) {
      const list = bucket.tickets;
      const primary = list.find((ticket) => ticket.coupons.length > 0) ?? list[0]!;
      const secondary = list.find((ticket) => ticket.number !== primary.number);
      if (list.length > 2) {
        warnings.push(
          `${primary.passengerName}: ${list.length} ticket numbers found; only the first two were kept.`,
        );
      }
      // Prefer a fuller name from the ticket block over a truncated list name.
      const name = list.reduce(
        (longest, ticket) =>
          ticket.passengerName.length > longest.length ? ticket.passengerName : longest,
        primary.passengerName,
      );
      groups.push({
        primary: { ...primary, passengerName: name },
        secondary,
      });
    }
  }
  return { groups, warnings };
}

export function formatTicketNumber(number: string): string {
  const digits = number.replace(/\D/g, "");
  if (digits.length !== 13) return number;
  return `${digits.slice(0, 3)} ${digits.slice(3, 7)} ${digits.slice(7)}`;
}
