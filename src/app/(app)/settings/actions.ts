"use server";

import { refresh } from "next/cache";
import { requireWorkspace } from "@/lib/auth";
import { env } from "@/lib/env";
import { ServiceError } from "@/lib/services/errors";
import { createInvite, revokeInvite, removeMember, updateMyName, updateBranding } from "@/lib/services/team";

export type State = { error?: string; ok?: string; link?: string; email?: string };
const message = (e: unknown) => (e instanceof ServiceError ? e.message : "Something went wrong. Please try again.");

export async function inviteAction(_: State, form: FormData): Promise<State> {
  const { db, workspace, user } = await requireWorkspace();
  try {
    const token = await createInvite(db, workspace.id, user.id, form.get("email"));
    refresh();
    const email = String(form.get("email")).trim().toLowerCase();
    return { ok: `Invite ready for ${email}`, email, link: `${env.NEXT_PUBLIC_SITE_URL}/invite/${token}` };
  } catch (e) {
    return { error: message(e) };
  }
}

export async function revokeInviteAction(form: FormData) {
  const { db, workspace } = await requireWorkspace();
  await revokeInvite(db, workspace.id, String(form.get("id")));
  refresh();
}

export async function removeMemberAction(userId: string): Promise<{ error?: string }> {
  const { db, workspace, user } = await requireWorkspace();
  try {
    await removeMember(db, workspace.id, userId, user.id);
  } catch (e) {
    return { error: message(e) };
  }
  refresh();
  return {};
}

export async function myNameAction(_: State, form: FormData): Promise<State> {
  const { db, workspace, user } = await requireWorkspace();
  try {
    await updateMyName(db, workspace.id, user.id, form.get("full_name"));
  } catch (e) {
    return { error: message(e) };
  }
  refresh();
  return { ok: "Saved" };
}

export async function brandingAction(_: State, form: FormData): Promise<State> {
  const { db, workspace } = await requireWorkspace();
  const logo = form.get("logo");
  try {
    await updateBranding(db, workspace.id,
      { name: form.get("name"), color: form.get("color"), removeLogo: form.get("remove_logo") === "on" },
      logo instanceof File && logo.size > 0 ? logo : null);
  } catch (e) {
    return { error: message(e) };
  }
  refresh();
  return { ok: "Branding saved. Client reports use it from now on." };
}
