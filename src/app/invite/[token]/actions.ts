"use server";

import { cookies } from "next/headers";
import { requireUser, ACTIVE_WS_COOKIE } from "@/lib/auth";
import { acceptInvite } from "@/lib/services/team";
import { ServiceError } from "@/lib/services/errors";

export type JoinState = { error?: string; redirectTo?: string };

export async function acceptInviteAction(token: string, _: JoinState, form: FormData): Promise<JoinState> {
  const { db } = await requireUser();
  let workspaceId: string;
  try {
    workspaceId = await acceptInvite(db, token, String(form.get("full_name") ?? ""));
  } catch (e) {
    return { error: e instanceof ServiceError ? e.message : "Couldn't join. Please try again." };
  }
  (await cookies()).set(ACTIVE_WS_COOKIE, workspaceId, { path: "/", sameSite: "lax", httpOnly: true, maxAge: 60 * 60 * 24 * 365 });
  // The browser does a full page load to this address (see JoinForm), so no screen from
  // before joining (like "Set up your agency") can be reused from its page cache.
  return { redirectTo: "/campaigns" };
}
