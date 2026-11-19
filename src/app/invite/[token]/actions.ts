"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireUser, ACTIVE_WS_COOKIE } from "@/lib/auth";
import { acceptInvite } from "@/lib/services/team";
import { ServiceError } from "@/lib/services/errors";

export async function acceptInviteAction(token: string, _: { error?: string }, form: FormData): Promise<{ error?: string }> {
  const { db } = await requireUser();
  let workspaceId: string;
  try {
    workspaceId = await acceptInvite(db, token, String(form.get("full_name") ?? ""));
  } catch (e) {
    return { error: e instanceof ServiceError ? e.message : "Couldn't join. Please try again." };
  }
  (await cookies()).set(ACTIVE_WS_COOKIE, workspaceId, { path: "/", sameSite: "lax", httpOnly: true, maxAge: 60 * 60 * 24 * 365 });
  redirect("/campaigns");
}
