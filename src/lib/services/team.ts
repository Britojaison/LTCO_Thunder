import { z } from "zod";
import type { Db } from "@/lib/supabase/server";
import { ServiceError, fromDb } from "./errors";
import { uploadImage } from "./storage";

/** Team (members, invites) and agency branding. Plain functions, no Next.js imports. */

export async function listMembers(db: Db, workspaceId: string) {
  const { data, error } = await db.from("workspace_members_thunder").select("user_id, full_name, email, joined_at")
    .eq("workspace_id", workspaceId).order("joined_at");
  fromDb(error, "Loading team");
  return (data ?? []) as { user_id: string; full_name: string | null; email: string; joined_at: string }[];
}

export async function listOpenInvites(db: Db, workspaceId: string) {
  const { data, error } = await db.from("workspace_invites_thunder").select("id, email, token, created_at, expires_at")
    .eq("workspace_id", workspaceId).is("accepted_at", null).order("created_at", { ascending: false });
  fromDb(error, "Loading invites");
  return (data ?? []).map((i) => ({ ...i, expired: new Date(i.expires_at).getTime() < Date.now() }));
}

export async function createInvite(db: Db, workspaceId: string, userId: string, email: unknown) {
  const p = z.email("Enter a valid email").safeParse(typeof email === "string" ? email.trim().toLowerCase() : email);
  if (!p.success) throw new ServiceError(p.error.issues[0].message, "validation");
  const { data: member } = await db.from("workspace_members_thunder").select("user_id")
    .eq("workspace_id", workspaceId).ilike("email", p.data).maybeSingle();
  if (member) throw new ServiceError(`${p.data} is already in the team.`, "validation");

  // An existing open invite for this email is refreshed instead of duplicated.
  const { data: open } = await db.from("workspace_invites_thunder").select("id, token")
    .eq("workspace_id", workspaceId).ilike("email", p.data).is("accepted_at", null).maybeSingle();
  if (open) {
    const { error } = await db.from("workspace_invites_thunder")
      .update({ expires_at: new Date(Date.now() + 14 * 864e5).toISOString() }).eq("id", open.id);
    fromDb(error, "Refreshing invite");
    return open.token as string;
  }
  const { data, error } = await db.from("workspace_invites_thunder")
    .insert({ workspace_id: workspaceId, email: p.data, invited_by: userId }).select("token").single();
  fromDb(error, "Creating invite");
  return data!.token as string;
}

export async function revokeInvite(db: Db, workspaceId: string, inviteId: string) {
  const { error } = await db.from("workspace_invites_thunder").delete()
    .eq("workspace_id", workspaceId).eq("id", inviteId).is("accepted_at", null);
  fromDb(error, "Revoking invite");
}

export async function removeMember(db: Db, workspaceId: string, userId: string, actingUserId: string) {
  if (userId === actingUserId) throw new ServiceError("You can't remove yourself. Ask a teammate to remove you.", "validation");
  const members = await listMembers(db, workspaceId);
  if (members.length <= 1) throw new ServiceError("A workspace needs at least one member.", "validation");
  const { error } = await db.from("workspace_members_thunder").delete().eq("workspace_id", workspaceId).eq("user_id", userId);
  fromDb(error, "Removing member");
}

export async function updateMyName(db: Db, workspaceId: string, userId: string, name: unknown) {
  const p = z.string().trim().min(1, "Enter your name").max(120).safeParse(name);
  if (!p.success) throw new ServiceError(p.error.issues[0].message, "validation");
  const { error } = await db.from("workspace_members_thunder").update({ full_name: p.data })
    .eq("workspace_id", workspaceId).eq("user_id", userId);
  fromDb(error, "Saving name");
}

// ── Invite acceptance ────────────────────────────────────────
export async function inviteInfo(db: Db, token: string) {
  if (!/^[a-f0-9]{32}$/.test(token)) return null;
  const { data, error } = await db.rpc("invite_info_thunder", { p_token: token });
  fromDb(error, "Loading invite");
  const row = (data as { workspace_name: string; email: string; status: "open" | "expired" | "accepted" }[] | null)?.[0];
  return row ?? null;
}

export async function acceptInvite(db: Db, token: string, fullName?: string) {
  const { data, error } = await db.rpc("accept_invite_thunder", { p_token: token, p_full_name: fullName?.trim() || null });
  if (error?.code === "42501") throw new ServiceError("This invite was sent to a different email. Sign in with that email to join.", "forbidden");
  if (error?.code === "P0002") throw new ServiceError("This invite has expired or was already used. Ask for a new one.", "not_found");
  fromDb(error, "Joining workspace");
  return data as string;
}

// ── Agency branding ──────────────────────────────────────────
export const PRESET_COLORS = ["#18181b", "#1d4ed8", "#0f766e", "#7c3aed", "#be123c", "#c2410c", "#15803d", "#0e7490"];

export async function getBranding(db: Db, workspaceId: string) {
  const { data, error } = await db.from("workspaces_thunder").select("name, logo_path, brand_colors").eq("id", workspaceId).single();
  fromDb(error, "Loading branding");
  const colors = (data!.brand_colors ?? {}) as { primary?: string };
  return { name: data!.name as string, logo_path: data!.logo_path as string | null, color: colors.primary ?? "#18181b" };
}

export async function updateBranding(db: Db, workspaceId: string, input: { name: unknown; color: unknown; removeLogo?: boolean }, logo?: File | null) {
  const name = z.string().trim().min(1, "Agency name is required").max(120).safeParse(input.name);
  if (!name.success) throw new ServiceError(name.error.issues[0].message, "validation");
  const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Pick a valid colour").safeParse(input.color);
  if (!color.success) throw new ServiceError(color.error.issues[0].message, "validation");

  const { data: current } = await db.from("workspaces_thunder").select("brand_colors").eq("id", workspaceId).single();
  const patch: Record<string, unknown> = {
    name: name.data,
    brand_colors: { ...((current?.brand_colors as object) ?? {}), primary: color.data.toLowerCase() },
  };
  if (input.removeLogo) patch.logo_path = null;
  if (logo && logo.size > 0) patch.logo_path = await uploadImage(db, workspaceId, "branding", "agency-logo", logo);
  const { error } = await db.from("workspaces_thunder").update(patch).eq("id", workspaceId);
  fromDb(error, "Saving branding");
}

/** Open invites addressed to the signed-in user's email (for the setup page). */
export async function myPendingInvites(db: Db) {
  const { data, error } = await db.rpc("my_pending_invites_thunder");
  fromDb(error, "Loading invites");
  return (data ?? []) as { token: string; workspace_name: string; invited_at: string }[];
}

// ── Team directory and history (from activity_log_thunder) ──────────────
// Removing a member deletes their membership row, but the log keeps a copy of it (name, email),
// so history can still name people who have left.

export type Person = { name: string; email: string; current: boolean };
const displayName = (full: unknown, email: unknown) => (typeof full === "string" && full.trim() ? full.trim() : String(email ?? "").split("@")[0] || "Unknown");

export async function memberDirectory(db: Db, workspaceId: string) {
  const [current, former] = await Promise.all([
    listMembers(db, workspaceId),
    db.from("activity_log_thunder").select("record_id, before, at").eq("workspace_id", workspaceId)
      .eq("table_name", "workspace_members_thunder").eq("action", "hard_delete").order("at"),
  ]);
  fromDb(former.error, "Loading team history");
  const dir = new Map<string, Person>();
  for (const r of former.data ?? []) {
    const b = (r.before ?? {}) as Record<string, unknown>;
    dir.set(String(r.record_id), { name: displayName(b.full_name, b.email), email: String(b.email ?? ""), current: false });
  }
  for (const m of current) dir.set(m.user_id, { name: displayName(m.full_name, m.email), email: m.email, current: true });
  return dir;
}

/** "Shreya" for a current member, "Shreya (removed)" for someone who has left. */
export function personLabel(dir: Map<string, Person>, uid: unknown) {
  if (!uid) return "System";
  const p = dir.get(String(uid));
  return p ? (p.current ? p.name : `${p.name} (removed)`) : "a former member";
}

export type TeamEvent = { at: string; text: string };

/** Joins, removals, invites and revocations, newest first. Removals also say how many
 *  campaigns lost their POC and how many deals lost their owner. */
export async function teamHistory(db: Db, workspaceId: string, limit = 50): Promise<TeamEvent[]> {
  const cols = "at, actor_id, action, table_name, record_id, before, after";
  const [dir, people, invites, cleared] = await Promise.all([
    memberDirectory(db, workspaceId),
    db.from("activity_log_thunder").select(cols).eq("workspace_id", workspaceId).eq("table_name", "workspace_members_thunder")
      .in("action", ["insert", "hard_delete"]).order("at", { ascending: false }).limit(limit),
    db.from("activity_log_thunder").select(cols).eq("workspace_id", workspaceId).eq("table_name", "workspace_invites_thunder")
      .in("action", ["insert", "hard_delete"]).order("at", { ascending: false }).limit(limit),
    // Rows cleared by a removal: before had the person, after has null.
    db.from("activity_log_thunder").select("at, table_name, before").eq("workspace_id", workspaceId)
      .in("table_name", ["campaigns_thunder", "deals_thunder"]).eq("action", "update")
      .order("at", { ascending: false }).limit(2000),
  ]);
  fromDb(people.error ?? invites.error ?? cleared.error, "Loading team history");
  const who = (uid: unknown) => personLabel(dir, uid);
  const events: TeamEvent[] = [];

  for (const r of people.data ?? []) {
    const row = (r.after ?? r.before ?? {}) as Record<string, unknown>;
    const name = displayName(row.full_name, row.email);
    if (r.action === "insert") {
      events.push({ at: r.at, text: r.actor_id === r.record_id ? `${name} joined the team` : `${who(r.actor_id)} added ${name} to the team` });
    } else {
      const uid = String(r.record_id);
      const same = (cleared.data ?? []).filter((c) => c.at === r.at);
      const camps = same.filter((c) => c.table_name === "campaigns_thunder" && (c.before as Record<string, unknown>)?.poc_id === uid).length;
      const deals = same.filter((c) => c.table_name === "deals_thunder" && (c.before as Record<string, unknown>)?.owner_id === uid).length;
      const extra = [camps && `${camps} campaign${camps > 1 ? "s" : ""} now ${camps > 1 ? "have" : "has"} no POC`, deals && `${deals} deal${deals > 1 ? "s" : ""} now ${deals > 1 ? "have" : "has"} no owner`].filter(Boolean).join(", ");
      events.push({ at: r.at, text: `${who(r.actor_id)} removed ${name} (${String(row.email ?? "")}) from the team${extra ? `. ${extra}` : ""}` });
    }
  }
  for (const r of invites.data ?? []) {
    const row = (r.after ?? r.before ?? {}) as Record<string, unknown>;
    if (r.action === "insert") events.push({ at: r.at, text: `${who(r.actor_id)} invited ${String(row.email)}` });
    else if (!row.accepted_at) events.push({ at: r.at, text: `${who(r.actor_id)} cancelled the invite for ${String(row.email)}` });
  }
  return events.sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, limit);
}
