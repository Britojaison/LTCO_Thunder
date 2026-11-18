import { z } from "zod";
import type { Db } from "@/lib/supabase/server";
import { ServiceError, fromDb } from "./errors";
import { BUCKET } from "./storage";
import { METRIC_KEYS, type Metrics } from "./metrics";
import { listDeals } from "./deals";

/** Posts (per deal) and their 24h / 7d / 30d metric snapshots. */

export const POST_FORMATS = ["reel", "story", "carousel", "collab", "static"] as const;
export const SNAPSHOT_POINTS = ["24h", "7d", "30d", "adhoc"] as const;
export type SnapshotPoint = (typeof SNAPSHOT_POINTS)[number];

export type Snapshot = Metrics & { id: string; snapshot_point: SnapshotPoint; captured_at: string; screenshot_paths: string[] };
export type Post = {
  id: string; url: string; format: string; posted_at: string | null; caption: string | null;
  snapshots: Snapshot[];
};

const SNAP_COLS = `id, post_id, snapshot_point, captured_at, screenshot_paths, ${METRIC_KEYS.join(", ")}`;

export async function listPosts(db: Db, workspaceId: string, dealId: string): Promise<Post[]> {
  const { data: posts, error } = await db.from("posts_thunder").select("id, url, format, posted_at, caption")
    .eq("workspace_id", workspaceId).eq("deal_id", dealId).is("deleted_at", null).order("posted_at", { ascending: true, nullsFirst: false });
  fromDb(error, "Loading posts");
  const ids = (posts ?? []).map((p) => p.id);
  const snaps = ids.length
    ? await db.from("metric_snapshots_thunder").select(SNAP_COLS).eq("workspace_id", workspaceId).in("post_id", ids).order("captured_at")
    : { data: [], error: null };
  fromDb(snaps.error, "Loading metrics");
  const byPost = new Map<string, Snapshot[]>();
  for (const s of (snaps.data ?? []) as unknown as (Snapshot & { post_id: string })[]) {
    byPost.set(s.post_id, [...(byPost.get(s.post_id) ?? []), s]);
  }
  return (posts ?? []).map((p) => ({ ...(p as Omit<Post, "snapshots">), snapshots: byPost.get(p.id) ?? [] }));
}

/** Latest snapshot of a post (most recently captured), or null. */
export function latestSnapshot(post: Post): Snapshot | null {
  return post.snapshots.reduce<Snapshot | null>((best, s) => (!best || s.captured_at >= best.captured_at ? s : best), null);
}

export const postInput = z.object({
  url: z.url("Paste the post link").refine((u) => /^https?:\/\/(www\.)?instagram\.com\//i.test(u), "Use an instagram.com post link"),
  format: z.enum(POST_FORMATS),
  posted_at: z.preprocess((v) => (v === "" || v === undefined ? null : v), z.string().nullable()),
  caption: z.preprocess((v) => (v === "" ? null : v), z.string().trim().max(2200).nullable()).optional(),
});

export async function addPost(db: Db, workspaceId: string, userId: string, dealId: string, input: unknown) {
  const p = postInput.safeParse(input);
  if (!p.success) throw new ServiceError(p.error.issues[0].message, "validation");
  const postedAt = p.data.posted_at ? toIstTimestamp(p.data.posted_at) : null;
  const { error } = await db.from("posts_thunder").insert({
    workspace_id: workspaceId, deal_id: dealId, url: p.data.url.split("?")[0], format: p.data.format,
    posted_at: postedAt, caption: p.data.caption ?? null, created_by: userId,
  });
  fromDb(error, "Saving post");
  // First post sets the deal's posting date if it wasn't set.
  if (postedAt) {
    await db.from("deals_thunder").update({ posting_date: postedAt.slice(0, 10) })
      .eq("workspace_id", workspaceId).eq("id", dealId).is("posting_date", null);
  }
}

export async function deletePost(db: Db, workspaceId: string, postId: string) {
  const { error } = await db.from("posts_thunder").update({ deleted_at: new Date().toISOString() }).eq("workspace_id", workspaceId).eq("id", postId);
  fromDb(error, "Removing post");
}

/** "2026-11-19T18:30" from a datetime-local input is Indian time. */
function toIstTimestamp(local: string) {
  const v = local.length === 10 ? `${local}T12:00` : local;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) throw new ServiceError("Enter a valid posting date and time.", "validation");
  return `${v.slice(0, 16)}:00+05:30`;
}

const metric = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? null : Number(String(v).replace(/[, ]/g, ""))),
  z.number().int("Use whole numbers").nonnegative().max(5_000_000_000).nullable(),
);
export const snapshotInput = z.object({
  snapshot_point: z.enum(SNAPSHOT_POINTS),
  ...Object.fromEntries(METRIC_KEYS.map((k) => [k, metric])) as Record<(typeof METRIC_KEYS)[number], typeof metric>,
  screenshot_paths: z.preprocess((v) => (typeof v === "string" ? (v ? v.split("|") : []) : v ?? []), z.array(z.string()).max(10)),
});

/** Saves a snapshot. 24h / 7d / 30d replace the existing one for that point; ad-hoc adds a new one. */
export async function saveSnapshot(db: Db, workspaceId: string, userId: string, postId: string, input: unknown) {
  const p = snapshotInput.safeParse(input);
  if (!p.success) {
    const i = p.error.issues[0];
    throw new ServiceError(`${i.path.join(".") || "Metrics"}: ${i.message}`, "validation");
  }
  const { snapshot_point, screenshot_paths, ...values } = p.data;
  if (METRIC_KEYS.every((k) => values[k] === null) && screenshot_paths.length === 0)
    throw new ServiceError("Enter at least one number or attach a screenshot.", "validation");
  for (const path of screenshot_paths)
    if (!path.startsWith(`${workspaceId}/posts/${postId}/`)) throw new ServiceError("Invalid screenshot", "validation");

  if (snapshot_point !== "adhoc") {
    const { data: existing } = await db.from("metric_snapshots_thunder").select("id, screenshot_paths")
      .eq("workspace_id", workspaceId).eq("post_id", postId).eq("snapshot_point", snapshot_point).maybeSingle();
    if (existing) {
      const { error } = await db.from("metric_snapshots_thunder").update({
        ...values, captured_at: new Date().toISOString(),
        screenshot_paths: [...new Set([...(existing.screenshot_paths ?? []), ...screenshot_paths])].slice(0, 20),
      }).eq("workspace_id", workspaceId).eq("id", existing.id);
      fromDb(error, "Updating metrics");
      return;
    }
  }
  const { error } = await db.from("metric_snapshots_thunder").insert({
    ...values, snapshot_point, screenshot_paths, workspace_id: workspaceId, post_id: postId, created_by: userId, source: "manual",
  });
  fromDb(error, "Saving metrics");
}

export async function deleteSnapshot(db: Db, workspaceId: string, snapshotId: string) {
  const { error } = await db.from("metric_snapshots_thunder").delete().eq("workspace_id", workspaceId).eq("id", snapshotId);
  fromDb(error, "Deleting metrics");
}

const IMG: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
export async function createScreenshotUpload(db: Db, workspaceId: string, postId: string, contentType: string, size: number) {
  if (!z.uuid().safeParse(postId).success) throw new ServiceError("Invalid post", "validation");
  const ext = IMG[contentType];
  if (!ext) throw new ServiceError("Screenshots must be PNG, JPG or WebP.", "validation");
  if (size > 8 * 1024 * 1024) throw new ServiceError("Screenshots must be under 8 MB.", "validation");
  const path = `${workspaceId}/posts/${postId}/shot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { data, error } = await db.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) throw new ServiceError(`Couldn't start upload: ${error?.message ?? "unknown error"}`);
  return { path, token: data.token };
}

// ── Due snapshots ────────────────────────────────────────────
export type DueSnapshot = {
  campaign_id: string; deal_id: string; post_id: string; url: string; format: string; owner_id: string | null;
  influencer_id: string; snapshot_point: string; due_at: string;
};

export async function listDueSnapshots(db: Db, workspaceId: string, opts: { campaignId?: string; ownerId?: string } = {}) {
  let q = db.from("snapshots_due_thunder").select("*").eq("workspace_id", workspaceId).order("due_at").limit(200);
  if (opts.campaignId) q = q.eq("campaign_id", opts.campaignId);
  if (opts.ownerId) q = q.eq("owner_id", opts.ownerId);
  const { data, error } = await q;
  fromDb(error, "Loading due snapshots");
  const rows = (data ?? []) as DueSnapshot[];
  if (!rows.length) return [];
  const [infl, camps] = await Promise.all([
    db.from("influencers_thunder").select("id, name, handle").in("id", [...new Set(rows.map((r) => r.influencer_id))]),
    db.from("campaigns_thunder").select("id, name, brand:brands_thunder(name)").in("id", [...new Set(rows.map((r) => r.campaign_id))]),
  ]);
  const iMap = new Map((infl.data ?? []).map((i) => [i.id, i]));
  const cMap = new Map((camps.data ?? []).map((c) => [c.id, c]));
  return rows.map((r) => {
    const c = cMap.get(r.campaign_id) as { name: string; brand: { name: string } | { name: string }[] } | undefined;
    const brand = Array.isArray(c?.brand) ? c?.brand[0]?.name : c?.brand?.name;
    const overdueMs = Date.now() - new Date(r.due_at).getTime();
    return {
      ...r, influencer: iMap.get(r.influencer_id), campaign: c ? `${brand ? `${brand} · ` : ""}${c.name}` : "",
      late: overdueMs > 0, overdueDays: Math.max(0, Math.round(overdueMs / 864e5)),
    };
  });
}

// ── Campaign performance: per influencer, sum of each post's latest numbers ──
export async function campaignPerformance(db: Db, workspaceId: string, campaignId: string) {
  const deals = (await listDeals(db, workspaceId, campaignId)).filter((d) => d.influencer);
  const dealIds = deals.map((d) => d.id);
  if (!dealIds.length) return [];
  const { data: posts, error } = await db.from("posts_thunder").select("id, deal_id, url, format, posted_at")
    .eq("workspace_id", workspaceId).in("deal_id", dealIds).is("deleted_at", null);
  fromDb(error, "Loading posts");
  const postIds = (posts ?? []).map((p) => p.id);
  const latest = postIds.length
    ? await db.from("post_latest_metrics_thunder").select("*").eq("workspace_id", workspaceId).in("post_id", postIds)
    : { data: [], error: null };
  fromDb(latest.error, "Loading metrics");
  const lMap = new Map((latest.data ?? []).map((m) => [m.post_id as string, m as Metrics & { snapshot_point: string; captured_at: string }]));
  return deals.map((d) => {
    const ps = (posts ?? []).filter((p) => p.deal_id === d.id);
    return {
      deal: d,
      posts: ps.map((p) => ({ ...p, latest: lMap.get(p.id) ?? null })),
    };
  });
}
