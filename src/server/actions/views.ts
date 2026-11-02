"use server";

import { revalidatePath } from "next/cache";

import { savedTableViewSchema, type SavedTableViewInput } from "@/lib/schemas";
import { audit } from "@/server/audit";
import { prisma } from "@/server/db";
import { optionalActionUser } from "@/server/guard";

import { actionError, actionOk, errorMessage, type ActionResult } from "@/server/actions/types";

const LIST_PATHS: Record<SavedTableViewInput["listKey"], string> = {
  quotations: "/quotations",
  customers: "/customers",
  proformas: "/proformas",
  payments: "/payments",
  itineraries: "/itineraries",
};

export async function saveTableViewAction(input: SavedTableViewInput): Promise<ActionResult> {
  try {
    const user = await optionalActionUser();
    if (!user) return actionError("Please sign in again");
    const parsed = savedTableViewSchema.safeParse(input);
    if (!parsed.success) return actionError("That view could not be saved");
    const data = parsed.data;
    const state = JSON.stringify({
      globalFilter: data.globalFilter,
      sorting: data.sorting,
      filters: data.filters,
      visibility: data.visibility,
    });

    await prisma.$transaction(async (tx) => {
      const view = await tx.savedTableView.upsert({
        where: { userId_listKey: { userId: user.id, listKey: data.listKey } },
        create: { userId: user.id, listKey: data.listKey, state },
        update: { state },
      });
      await audit(tx, {
        userId: user.id,
        action: "saveTableView",
        entity: "SavedTableView",
        entityId: view.id,
        after: { listKey: data.listKey, state: data },
      });
    });
    return actionOk("View saved");
  } catch (error) {
    return actionError(errorMessage(error));
  }
}

export async function resetTableViewAction(listKey: SavedTableViewInput["listKey"]): Promise<ActionResult> {
  try {
    const user = await optionalActionUser();
    if (!user) return actionError("Please sign in again");
    const parsed = savedTableViewSchema.shape.listKey.safeParse(listKey);
    if (!parsed.success) return actionError("Unknown list");
    const key = parsed.data;
    await prisma.$transaction(async (tx) => {
      const existing = await tx.savedTableView.findUnique({
        where: { userId_listKey: { userId: user.id, listKey: key } },
      });
      if (!existing) return;
      await tx.savedTableView.delete({ where: { id: existing.id } });
      await audit(tx, {
        userId: user.id,
        action: "resetTableView",
        entity: "SavedTableView",
        entityId: existing.id,
        before: { listKey: key, state: existing.state },
      });
    });
    revalidatePath(LIST_PATHS[key]);
    return actionOk("View reset");
  } catch (error) {
    return actionError(errorMessage(error));
  }
}
