import { z } from "zod";
import type { Db } from "@/lib/supabase/server";
import { ServiceError, fromDb } from "./errors";

/**
 * Workspace services. Plain functions that take a database client so they can move
 * to a standalone backend later without changes. No Next.js imports in this folder.
 */

export type WorkspaceSummary = { id: string; name: string; logo_path: string | null };

export async function listMyWorkspaces(db: Db): Promise<WorkspaceSummary[]> {
  const { data, error } = await db
    .from("workspaces")
    .select("id, name, logo_path")
    .is("deleted_at", null)
    .order("created_at");
  fromDb(error, "Loading workspaces");
  return data ?? [];
}

export const createWorkspaceInput = z.object({
  name: z.string().trim().min(1, "Agency name is required").max(120),
  fullName: z.string().trim().max(120).optional(),
});

export async function createWorkspace(db: Db, input: z.input<typeof createWorkspaceInput>) {
  const parsed = createWorkspaceInput.safeParse(input);
  if (!parsed.success) throw new ServiceError(parsed.error.issues[0].message, "validation");
  const { data, error } = await db.rpc("create_workspace", {
    p_name: parsed.data.name,
    p_full_name: parsed.data.fullName ?? null,
  });
  fromDb(error, "Creating workspace");
  return data as string;
}

export async function workspaceStats(db: Db, workspaceId: string) {
  const count = async (table: string) => {
    const { count, error } = await db
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null);
    fromDb(error, `Counting ${table}`);
    return count ?? 0;
  };
  const [influencers, brands, campaigns] = await Promise.all([
    count("influencers"),
    count("brands"),
    count("campaigns"),
  ]);
  return { influencers, brands, campaigns };
}
