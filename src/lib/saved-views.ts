import { savedTableViewSchema, type SavedTableViewInput } from "./schemas";

export type ListKey = SavedTableViewInput["listKey"];

export interface SavedTableViewState {
  globalFilter: string;
  sorting: { id: string; desc: boolean }[];
  filters: { id: string; value: string }[];
  visibility: Record<string, boolean>;
}

export const EMPTY_VIEW: SavedTableViewState = {
  globalFilter: "",
  sorting: [],
  filters: [],
  visibility: {},
};

export function parseSavedView(raw: string | null | undefined): SavedTableViewState | null {
  if (!raw) return null;
  try {
    const parsed = savedTableViewSchema
      .omit({ listKey: true })
      .safeParse(JSON.parse(raw) as unknown);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function serialiseSavedView(state: SavedTableViewState): string {
  return JSON.stringify(state);
}
