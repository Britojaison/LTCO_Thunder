"use server";

import { cookies } from "next/headers";
import { refresh } from "next/cache";
import { requireWorkspace, ACTIVE_WS_COOKIE } from "@/lib/auth";

export async function switchWorkspace(form: FormData) {
  const id = String(form.get("workspaceId") ?? "");
  const { workspaces } = await requireWorkspace();
  if (!workspaces.some((w) => w.id === id)) return; // not a member: ignore
  (await cookies()).set(ACTIVE_WS_COOKIE, id, { path: "/", sameSite: "lax", httpOnly: true, maxAge: 60 * 60 * 24 * 365 });
  refresh();
}
