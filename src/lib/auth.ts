import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient, type Db } from "@/lib/supabase/server";
import { listMyWorkspaces, type WorkspaceSummary } from "@/lib/services/workspaces";

export const ACTIVE_WS_COOKIE = "thunder_ws";

export type WorkspaceContext = {
  db: Db;
  user: { id: string; email: string };
  workspace: WorkspaceSummary;
  workspaces: WorkspaceSummary[];
};

/** Data Access Layer entry point: the signed-in user, or a redirect to /login. */
export async function requireUser() {
  const db = await createClient();
  const { data, error } = await db.auth.getUser();
  if (error || !data.user) redirect("/login");
  return { db, user: { id: data.user.id, email: data.user.email ?? "" } };
}

/** Signed-in user plus their active workspace (cookie, else first membership). */
export async function requireWorkspace(): Promise<WorkspaceContext> {
  const { db, user } = await requireUser();
  const workspaces = await listMyWorkspaces(db);
  if (workspaces.length === 0) redirect("/onboarding");

  const wanted = (await cookies()).get(ACTIVE_WS_COOKIE)?.value;
  const workspace = workspaces.find((w) => w.id === wanted) ?? workspaces[0];
  return { db, user, workspace, workspaces };
}
