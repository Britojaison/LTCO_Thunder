import { z } from "zod";
import type { Db } from "@/lib/supabase/server";
import { ServiceError, fromDb } from "./errors";
import { filtersSchema, type Filters } from "./filters";

export async function listSavedSearches(db: Db, workspaceId: string) {
  const { data, error } = await db
    .from("saved_searches_thunder")
    .select("id, name, filters")
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .order("name");
  fromDb(error, "Loading saved searches");
  return (data ?? []).map((s) => ({ ...s, filters: filtersSchema.catch({}).parse(s.filters) as Filters }));
}

export async function saveSearch(db: Db, workspaceId: string, userId: string, name: string, filters: Filters) {
  const n = z.string().trim().min(1, "Give the search a name").max(80).safeParse(name);
  if (!n.success) throw new ServiceError(n.error.issues[0].message, "validation");
  const { error } = await db.from("saved_searches_thunder").insert({ workspace_id: workspaceId, name: n.data, filters, created_by: userId });
  fromDb(error, "Saving search");
}

export async function deleteSavedSearch(db: Db, workspaceId: string, id: string) {
  const { error } = await db
    .from("saved_searches_thunder")
    .update({ deleted_at: new Date().toISOString() })
    .eq("workspace_id", workspaceId)
    .eq("id", id);
  fromDb(error, "Deleting saved search");
}
