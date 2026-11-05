import type { DocumentPassenger } from "@/lib/documents";

export interface TravellerSlot {
  type: DocumentPassenger["type"];
  name: string;
}

/**
 * Flatten a passenger list into one slot per traveller. An unnamed group with
 * quantity 9 becomes nine blank slots, which is how the draft pro forma shows
 * names that can be filled in later.
 */
export function travellerSlots(passengers: DocumentPassenger[]): TravellerSlot[] {
  const slots: TravellerSlot[] = [];
  for (const passenger of passengers) {
    if (passenger.unnamed) {
      const quantity = Math.max(1, passenger.quantity ?? 1);
      for (let index = 0; index < quantity; index += 1) {
        slots.push({ type: passenger.type, name: "" });
      }
      continue;
    }
    slots.push({
      type: passenger.type,
      name: [passenger.title, passenger.firstName, passenger.lastName]
        .filter(Boolean)
        .join(" "),
    });
  }
  return slots;
}

/** One editable line per traveller, preserving blank slots for later names. */
export function travellerNamesText(passengers: DocumentPassenger[]): string {
  return travellerSlots(passengers)
    .map((slot) => slot.name)
    .join("\n");
}

/** Split a typed name into the document's first/last-name fields. */
export function splitTravellerName(value: string): { firstName: string; lastName: string } {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: "", lastName: parts[0]! };
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts.at(-1)! };
}

/**
 * Apply names typed one-per-line to an existing passenger list. Blank lines
 * leave that traveller unnamed, so partial names are allowed and the rest
 * still print as "2 Adults — names to be advised".
 */
export function applyTravellerNames(
  passengers: DocumentPassenger[],
  text: string,
): { passengers: DocumentPassenger[]; error?: string } {
  const slots = travellerSlots(passengers);
  const rawLines = text.replace(/\r\n/g, "\n").split("\n");
  while (rawLines.length > 0 && rawLines.at(-1)?.trim() === "") rawLines.pop();
  if (rawLines.length > slots.length) {
    return {
      passengers,
      error: `Only ${slots.length} traveller${slots.length === 1 ? "" : "s"} can be named for this pro forma`,
    };
  }

  const named: DocumentPassenger[] = [];
  const unnamedByType = new Map<DocumentPassenger["type"], number>();
  for (let index = 0; index < slots.length; index += 1) {
    const slot = slots[index]!;
    const value = (rawLines[index] ?? "").trim();
    if (!value) {
      unnamedByType.set(slot.type, (unnamedByType.get(slot.type) ?? 0) + 1);
      continue;
    }
    const { firstName, lastName } = splitTravellerName(value);
    named.push({ firstName, lastName, type: slot.type });
  }

  const grouped: DocumentPassenger[] = [];
  for (const [type, quantity] of unnamedByType) {
    grouped.push({ firstName: "", lastName: "", type, unnamed: true, quantity });
  }
  return { passengers: [...named, ...grouped] };
}

/** Names entered into one unnamed fare group, one per line. */
export function groupTravellerPassengers(
  type: DocumentPassenger["type"],
  quantity: number,
  names: string | null | undefined,
): DocumentPassenger[] {
  const base: DocumentPassenger[] = [
    { firstName: "", lastName: "", type, unnamed: true, quantity: Math.max(1, quantity) },
  ];
  if (!names?.trim()) return base;
  return applyTravellerNames(base, names).passengers;
}

/** Count non-blank names so validation can compare them with the quantity. */
export function enteredTravellerNames(value: string | null | undefined): string[] {
  return (value ?? "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}
