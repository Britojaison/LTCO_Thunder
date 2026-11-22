import "server-only";
import type { Db } from "@/lib/supabase/server";
import { ServiceError, fromDb } from "./errors";
import { normalizeHandle } from "./influencers";
import { METRIC_KEYS } from "./metrics";

/**
 * Instagram public data through Meta's Business Discovery API (app: Infini8Graph for now).
 * Reads other creators' public numbers: followers, post count, and likes, comments and views per post.
 * view_count is reels only, and Meta omits it when the creator has turned off reel downloads.
 * Saves, shares and reach are owner-only (Insights), so those stay manual.
 * Token and IG account id live only on the server (environment variables).
 */

const VERSION = () => process.env.META_GRAPH_VERSION || "v24.0";

export function instagramEnabled() {
  return Boolean(process.env.META_ACCESS_TOKEN && process.env.META_IG_USER_ID);
}

type GraphMedia = {
  id: string; permalink?: string; timestamp?: string; like_count?: number; comments_count?: number; view_count?: number; reposts_count?: number;
  media_type?: string; media_product_type?: string;
};
type Discovery = {
  username: string; name?: string; biography?: string; followers_count?: number; media_count?: number;
  media?: { data: GraphMedia[]; paging?: { cursors?: { after?: string } } };
};

// reposts_count is documented as public but not explicitly for Business Discovery: if Meta
// rejects it, drop it for the rest of this server's life and retry once.
let repostsSupported = true;

async function discover(handle: string, mediaFields: string): Promise<Discovery> {
  try {
    return await discoverOnce(handle, repostsSupported ? mediaFields : mediaFields.replace(",reposts_count", ""));
  } catch (e) {
    if (repostsSupported && mediaFields.includes("reposts_count") && e instanceof ServiceError && /reposts_count/i.test(e.message)) {
      repostsSupported = false;
      return discoverOnce(handle, mediaFields.replace(",reposts_count", ""));
    }
    throw e;
  }
}

async function discoverOnce(handle: string, mediaFields: string): Promise<Discovery> {
  if (!instagramEnabled()) throw new ServiceError("Instagram lookup isn't set up. Add META_ACCESS_TOKEN and META_IG_USER_ID to the environment variables (.env.local, or Vercel → Settings → Environment Variables).", "validation");
  const h = normalizeHandle(handle);
  if (!/^[a-z0-9._]{1,30}$/.test(h)) throw new ServiceError("Enter a valid Instagram handle.", "validation");
  const fields = `business_discovery.username(${h}){username,name,biography,followers_count,media_count,${mediaFields}}`;
  const url = `https://graph.facebook.com/${VERSION()}/${process.env.META_IG_USER_ID}?fields=${encodeURIComponent(fields)}`;
  let res: Response;
  try {
    res = await fetch(url, { headers: { Authorization: `Bearer ${process.env.META_ACCESS_TOKEN}` }, cache: "no-store", signal: AbortSignal.timeout(15000) });
  } catch {
    throw new ServiceError("Couldn't reach Instagram. Try again in a minute.");
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) throw graphError(body.error, h);
  return body.business_discovery as Discovery;
}

function graphError(err: { code?: number; error_subcode?: number; message?: string } | undefined, handle: string) {
  const code = err?.code;
  if (code === 190) return new ServiceError("The Instagram token has expired. Generate a new one and update META_ACCESS_TOKEN.");
  if (code === 4 || code === 17 || code === 32 || code === 613 || code === 80002)
    return new ServiceError("Instagram rate limit reached. Try again in about an hour.");
  if (code === 10 || code === 200) return new ServiceError("The Instagram token is missing a permission (instagram_basic, instagram_manage_insights, pages_read_engagement).");
  if (code === 100 && /reposts_count/i.test(err?.message ?? "")) return new ServiceError(`Instagram: ${err?.message}`);
  if (code === 110 || code === 100 || err?.error_subcode === 2207013)
    return new ServiceError(`@${handle} wasn't found, or it's a personal/private account. Only public business and creator accounts can be looked up.`, "validation");
  return new ServiceError(`Instagram: ${err?.message ?? "unknown error"}`);
}

export type ProfileLookup = {
  handle: string; name: string | null; bio: string | null; followers: number | null; media_count: number | null;
  /** Average (likes + comments) of recent posts as % of followers. */
  engagement_rate: number | null; posts_sampled: number;
  /** Average views of recent reels (null if none returned views). */
  avg_reel_views: number | null; reels_sampled: number;
};

export async function lookupProfile(handle: string): Promise<ProfileLookup> {
  const d = await discover(handle, "media.limit(12){like_count,comments_count,view_count,timestamp}");
  const posts = (d.media?.data ?? []).filter((m) => m.like_count !== undefined);
  const followers = d.followers_count ?? null;
  const reels = (d.media?.data ?? []).filter((m) => typeof m.view_count === "number");
  const avg = posts.length ? posts.reduce((t, m) => t + (m.like_count ?? 0) + (m.comments_count ?? 0), 0) / posts.length : null;
  return {
    handle: d.username, name: d.name ?? null, bio: d.biography ?? null, followers, media_count: d.media_count ?? null,
    engagement_rate: avg !== null && followers ? Math.round((avg / followers) * 100 * 100) / 100 : null,
    posts_sampled: posts.length,
    avg_reel_views: reels.length ? Math.round(reels.reduce((t, m) => t + (m.view_count ?? 0), 0) / reels.length) : null,
    reels_sampled: reels.length,
  };
}

/** Updates followers and engagement rate on a saved profile. */
export async function refreshInfluencerFromInstagram(db: Db, workspaceId: string, influencerId: string) {
  const { data: inf, error } = await db.from("influencers_thunder").select("handle").eq("workspace_id", workspaceId).eq("id", influencerId).maybeSingle();
  fromDb(error, "Loading influencer");
  if (!inf) throw new ServiceError("Influencer not found", "not_found");
  const p = await lookupProfile(inf.handle);
  const patch: Record<string, unknown> = { followers_updated_at: new Date().toISOString() };
  if (p.followers !== null) patch.followers = p.followers;
  if (p.engagement_rate !== null) patch.engagement_rate = p.engagement_rate;
  if (p.avg_reel_views !== null) patch.avg_reel_views = p.avg_reel_views;
  const { error: upErr } = await db.from("influencers_thunder").update(patch).eq("workspace_id", workspaceId).eq("id", influencerId);
  fromDb(upErr, "Saving followers");
  return p;
}

/** Shortcode from an instagram.com/p/…, /reel/… or /tv/… link. */
export function shortcode(url: string) {
  return url.match(/instagram\.com\/(?:[^/]+\/)?(?:p|reels?|tv)\/([A-Za-z0-9_-]+)/i)?.[1] ?? null;
}

const MEDIA = "like_count,comments_count,view_count,timestamp,permalink,reposts_count";
const MAX_PAGES = 6; // 6 × 50 = the influencer's latest 300 posts

/** Finds the given posts in a creator's feed and returns likes and comments by shortcode. */
async function findMedia(handle: string, codes: Set<string>, oldest: number) {
  const found = new Map<string, { likes: number | null; comments: number | null; views: number | null; reposts: number | null }>();
  let after: string | undefined;
  for (let page = 0; page < MAX_PAGES && found.size < codes.size; page++) {
    const edge = after ? `media.after(${after}).limit(50){${MEDIA}}` : `media.limit(50){${MEDIA}}`;
    const d = await discover(handle, edge);
    const items = d.media?.data ?? [];
    for (const m of items) {
      const c = m.permalink ? shortcode(m.permalink) : null;
      if (c && codes.has(c)) found.set(c, { likes: m.like_count ?? null, comments: m.comments_count ?? null, views: m.view_count ?? null, reposts: m.reposts_count ?? null });
    }
    after = d.media?.paging?.cursors?.after;
    const last = items.at(-1)?.timestamp;
    if (!after || !items.length || (last && new Date(last).getTime() < oldest)) break;
  }
  return found;
}

export type RefreshResult = { updated: number; notFound: string[]; skipped: string[]; errors: string[] };

/**
 * Pulls likes, comments and (for reels) views, and saves them as an "adhoc" snapshot (source: api).
 * Saves, shares, reach etc. (and views when Meta doesn't return them) are carried over from the post's latest snapshot so the
 * post's "latest numbers" don't lose them. One lookup per influencer, not per post.
 */
export async function refreshPostsFromInstagram(db: Db, workspaceId: string, userId: string, filter: { dealId?: string; campaignId?: string }): Promise<RefreshResult> {
  let dealIds: string[];
  if (filter.dealId) dealIds = [filter.dealId];
  else {
    const { data, error } = await db.from("deals_thunder").select("id").eq("workspace_id", workspaceId).eq("campaign_id", filter.campaignId!).is("deleted_at", null);
    fromDb(error, "Loading deals");
    dealIds = (data ?? []).map((d) => d.id);
  }
  const out: RefreshResult = { updated: 0, notFound: [], skipped: [], errors: [] };
  if (!dealIds.length) return out;

  const [{ data: posts, error: pErr }, { data: deals, error: dErr }] = await Promise.all([
    db.from("posts_thunder").select("id, deal_id, url, format, posted_at").eq("workspace_id", workspaceId).in("deal_id", dealIds).is("deleted_at", null),
    db.from("deals_thunder").select("id, influencer:influencers_thunder(handle)").eq("workspace_id", workspaceId).in("id", dealIds),
  ]);
  fromDb(pErr ?? dErr, "Loading posts");
  const handleOf = new Map((deals ?? []).map((d) => {
    const i = d.influencer as unknown as { handle: string } | { handle: string }[] | null;
    return [d.id, Array.isArray(i) ? i[0]?.handle : i?.handle];
  }));

  // Group posts by influencer handle.
  const groups = new Map<string, { id: string; code: string; url: string; posted_at: string | null }[]>();
  for (const p of posts ?? []) {
    const code = shortcode(p.url);
    const h = handleOf.get(p.deal_id);
    if (p.format === "story" || !code || !h) { out.skipped.push(p.url); continue; }
    groups.set(h, [...(groups.get(h) ?? []), { id: p.id, code, url: p.url, posted_at: p.posted_at }]);
  }
  if (!groups.size) return out;

  const ids = [...groups.values()].flat().map((p) => p.id);
  const { data: latest, error: lErr } = await db.from("post_latest_metrics_thunder").select("*").eq("workspace_id", workspaceId).in("post_id", ids);
  fromDb(lErr, "Loading metrics");
  const latestOf = new Map((latest ?? []).map((m) => [m.post_id as string, m as Record<string, number | null>]));

  const rows: Record<string, unknown>[] = [];
  const now = new Date().toISOString();
  for (const [handle, list] of groups) {
    const oldest = Math.min(...list.map((p) => (p.posted_at ? new Date(p.posted_at).getTime() : 0))) - 3 * 864e5;
    let found: Awaited<ReturnType<typeof findMedia>>;
    try {
      found = await findMedia(handle, new Set(list.map((p) => p.code)), oldest);
    } catch (e) {
      out.errors.push(`@${handle}: ${e instanceof ServiceError ? e.message : "lookup failed"}`);
      if (e instanceof ServiceError && /expired|rate limit|permission|isn't set up/.test(e.message)) break;
      continue;
    }
    for (const p of list) {
      const m = found.get(p.code);
      if (!m) { out.notFound.push(p.url); continue; }
      const prev = latestOf.get(p.id) ?? {};
      const carried = Object.fromEntries(METRIC_KEYS.map((k) => [k, prev[k] ?? null]));
      rows.push({
        ...carried, likes: m.likes, comments: m.comments, ...(m.views !== null ? { views: m.views } : {}), ...(m.reposts !== null ? { reposts: m.reposts } : {}),
        workspace_id: workspaceId, post_id: p.id, snapshot_point: "adhoc", captured_at: now,
        screenshot_paths: [], source: "api", created_by: userId,
      });
    }
  }
  if (rows.length) {
    const { error } = await db.from("metric_snapshots_thunder").insert(rows);
    fromDb(error, "Saving metrics");
    out.updated = rows.length;
  }
  return out;
}
