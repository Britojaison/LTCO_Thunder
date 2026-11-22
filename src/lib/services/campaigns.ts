import { z } from "zod";
import type { Db } from "@/lib/supabase/server";
import { ServiceError, fromDb } from "./errors";
import { createInfluencer, findByHandle, normalizeHandle } from "./influencers";
import { memberDirectory, personLabel } from "./team";

/** Campaign services. Money is calculated from deals (campaign_financials_thunder view). */

export const CAMPAIGN_STATUSES = ["planning", "live", "completed", "archived"] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];
export const DELIVERABLE_FORMATS = ["reel", "story", "carousel", "collab"] as const;

export type Financials = {
  influencer_count: number; missing_client_price: number; missing_payout: number;
  cost_to_client: number; cost_to_agency: number; profit: number; profit_pct: number | null;
};
const EMPTY_FIN: Financials = { influencer_count: 0, missing_client_price: 0, missing_payout: 0, cost_to_client: 0, cost_to_agency: 0, profit: 0, profit_pct: null };

const one = <T,>(v: T | T[] | null | undefined): T | undefined => (Array.isArray(v) ? v[0] : v ?? undefined);
const optText = z.preprocess((v) => (v === "" || v === undefined ? null : v), z.string().trim().max(5000).nullable());
const optDate = z.preprocess((v) => (v === "" || v === undefined ? null : v), z.iso.date().nullable());

export const campaignInput = z
  .object({
    brand_id: z.uuid("Choose a brand"),
    name: z.string().trim().min(1, "Campaign name is required").max(160),
    brief: optText,
    objective: optText,
    start_date: optDate,
    end_date: optDate,
    status: z.enum(CAMPAIGN_STATUSES).default("planning"),
    poc_id: z.preprocess((v) => (v === "" || v === undefined ? null : v), z.uuid("Choose a POC").nullable()),
    deliv_reel: z.coerce.number().int().min(0).max(1000).default(0),
    deliv_story: z.coerce.number().int().min(0).max(1000).default(0),
    deliv_carousel: z.coerce.number().int().min(0).max(1000).default(0),
    deliv_collab: z.coerce.number().int().min(0).max(1000).default(0),
  })
  .refine((v) => !v.start_date || !v.end_date || v.end_date >= v.start_date, { message: "End date must be after the start date", path: ["end_date"] })
  .transform(({ deliv_reel, deliv_story, deliv_carousel, deliv_collab, ...rest }) => ({
    ...rest,
    deliverables: (
      [["reel", deliv_reel], ["story", deliv_story], ["carousel", deliv_carousel], ["collab", deliv_collab]] as const
    ).filter(([, n]) => n > 0).map(([format, count]) => ({ format, count })),
  }));

function parse(input: unknown) {
  const p = campaignInput.safeParse(input);
  if (!p.success) throw new ServiceError(p.error.issues[0].message, "validation");
  return p.data;
}

async function financialsFor(db: Db, workspaceId: string, ids: string[]) {
  if (!ids.length) return new Map<string, Financials>();
  const { data, error } = await db.from("campaign_financials_thunder").select("*").eq("workspace_id", workspaceId).in("campaign_id", ids);
  fromDb(error, "Loading campaign money");
  return new Map((data ?? []).map((f) => [f.campaign_id as string, {
    influencer_count: Number(f.influencer_count), missing_client_price: Number(f.missing_client_price), missing_payout: Number(f.missing_payout),
    cost_to_client: Number(f.cost_to_client), cost_to_agency: Number(f.cost_to_agency), profit: Number(f.profit),
    profit_pct: f.profit_pct === null ? null : Number(f.profit_pct),
  }]));
}

export type Member = { full_name: string | null; email: string };
export const memberName = (m: Member | null | undefined) => (m ? m.full_name || m.email.split("@")[0] : null);

export async function listCampaigns(db: Db, workspaceId: string, opts: { status?: string; brandId?: string; pocId?: string } = {}) {
  let q = db.from("campaigns_thunder")
    .select("id, name, status, start_date, end_date, brand_id, poc_id, brand:brands_thunder(name, logo_path), poc:workspace_members_thunder(full_name, email)")
    .eq("workspace_id", workspaceId).is("deleted_at", null)
    .order("start_date", { ascending: false, nullsFirst: true }).order("created_at", { ascending: false });
  if (opts.status && (CAMPAIGN_STATUSES as readonly string[]).includes(opts.status)) q = q.eq("status", opts.status);
  else if (opts.status !== "all") q = q.neq("status", "archived");
  if (opts.brandId && z.uuid().safeParse(opts.brandId).success) q = q.eq("brand_id", opts.brandId);
  if (opts.pocId === "none") q = q.is("poc_id", null);
  else if (opts.pocId && z.uuid().safeParse(opts.pocId).success) q = q.eq("poc_id", opts.pocId);
  const { data, error } = await q;
  fromDb(error, "Loading campaigns");
  const fin = await financialsFor(db, workspaceId, (data ?? []).map((c) => c.id));
  return (data ?? []).map((c) => ({
    id: c.id as string, name: c.name as string, status: c.status as CampaignStatus,
    start_date: c.start_date as string | null, end_date: c.end_date as string | null, brand_id: c.brand_id as string,
    brand: one(c.brand as { name: string } | { name: string }[])?.name ?? "",
    brand_logo: one(c.brand as unknown as { logo_path: string | null } | { logo_path: string | null }[])?.logo_path ?? null,
    poc_id: c.poc_id as string | null,
    poc: memberName(one(c.poc as unknown as Member | Member[])),
    fin: fin.get(c.id) ?? EMPTY_FIN,
  }));
}

/** Campaigns the team can add influencers to (planning or live). */
export async function listOpenCampaigns(db: Db, workspaceId: string) {
  const { data, error } = await db.from("campaigns_thunder")
    .select("id, name, status, brand:brands_thunder(name)")
    .eq("workspace_id", workspaceId).in("status", ["planning", "live"]).is("deleted_at", null)
    .order("created_at", { ascending: false });
  fromDb(error, "Loading campaigns");
  return (data ?? []).map((c) => ({ id: c.id as string, name: c.name as string, brand: one(c.brand as { name: string } | { name: string }[])?.name ?? "" }));
}

export async function getCampaign(db: Db, workspaceId: string, id: string) {
  if (!z.uuid().safeParse(id).success) throw new ServiceError("Campaign not found", "not_found");
  const { data, error } = await db.from("campaigns_thunder")
    .select("*, brand:brands_thunder(id, name, logo_path, competitor_brands), poc:workspace_members_thunder(full_name, email)")
    .eq("workspace_id", workspaceId).eq("id", id).is("deleted_at", null).maybeSingle();
  fromDb(error, "Loading campaign");
  if (!data) throw new ServiceError("Campaign not found", "not_found");
  const deliverables: { format: string; count: number }[] = z.array(z.object({ format: z.string(), count: z.number() })).catch([]).parse(data.deliverables);
  return {
    id: data.id as string, brand_id: data.brand_id as string, name: data.name as string,
    brief: data.brief as string | null, objective: data.objective as string | null,
    start_date: data.start_date as string | null, end_date: data.end_date as string | null,
    status: data.status as CampaignStatus, deliverables,
    poc_id: data.poc_id as string | null, poc: memberName(one(data.poc as unknown as Member | Member[])),
    created_by: data.created_by as string | null, created_at: data.created_at as string,
    brand: one(data.brand as unknown as { id: string; name: string; logo_path: string | null; competitor_brands: string[] }),
  };
}

/** Campaign overview: money, influencers per stage, and the deal list. */
export async function campaignOverview(db: Db, workspaceId: string, id: string) {
  const [fin, stages, deals] = await Promise.all([
    financialsFor(db, workspaceId, [id]),
    db.from("pipeline_stages_thunder").select("id, name, position, kind").eq("workspace_id", workspaceId).is("deleted_at", null).order("position"),
    db.from("deals_thunder")
      .select("id, stage_id, product, client_price, payout, margin, margin_pct, posting_date, influencer:influencers_thunder(id, name, handle, followers), owner:workspace_members_thunder(full_name, email)")
      .eq("workspace_id", workspaceId).eq("campaign_id", id).is("deleted_at", null).order("created_at"),
  ]);
  fromDb(stages.error, "Loading stages");
  fromDb(deals.error, "Loading deals");
  const counts = new Map<string, number>();
  for (const d of deals.data ?? []) counts.set(d.stage_id, (counts.get(d.stage_id) ?? 0) + 1);
  const stageList = (stages.data ?? []).map((s) => ({ ...s, count: counts.get(s.id) ?? 0 }));
  const stageName = new Map(stageList.map((s) => [s.id, s]));
  return {
    fin: fin.get(id) ?? EMPTY_FIN,
    stages: stageList,
    deals: (deals.data ?? []).map((d) => ({
      id: d.id as string,
      stage: stageName.get(d.stage_id)?.name ?? "–",
      dropped: stageName.get(d.stage_id)?.kind === "dropped",
      client_price: d.client_price as number | null, payout: d.payout as number | null,
      margin: d.margin as number | null, margin_pct: d.margin_pct as number | null,
      product: d.product as string | null,
      posting_date: d.posting_date as string | null,
      influencer: one(d.influencer as unknown as { id: string; name: string; handle: string; followers: number | null } | null),
      owner: one(d.owner as unknown as { full_name: string | null; email: string } | null),
    })),
  };
}

export async function createCampaign(db: Db, workspaceId: string, userId: string, input: unknown) {
  const values = parse(input);
  const { data, error } = await db.from("campaigns_thunder")
    .insert({ ...values, poc_id: values.poc_id ?? userId, workspace_id: workspaceId, created_by: userId }).select("id").single();
  if (error?.code === "23503") throw new ServiceError(/poc/.test(error.message) ? "The POC must be a member of your team." : "Choose a valid brand.", "validation");
  fromDb(error, "Saving campaign");
  return data!.id as string;
}

export async function updateCampaign(db: Db, workspaceId: string, id: string, input: unknown) {
  const values = parse(input);
  const { error } = await db.from("campaigns_thunder").update(values).eq("workspace_id", workspaceId).eq("id", id);
  if (error?.code === "23503") throw new ServiceError(/poc/.test(error.message) ? "The POC must be a member of your team." : "Choose a valid brand.", "validation");
  fromDb(error, "Updating campaign");
}

export async function setCampaignPoc(db: Db, workspaceId: string, id: string, pocId: string) {
  const poc = pocId === "" ? null : pocId;
  if (poc !== null && !z.uuid().safeParse(poc).success) throw new ServiceError("Choose a POC", "validation");
  const { error } = await db.from("campaigns_thunder").update({ poc_id: poc }).eq("workspace_id", workspaceId).eq("id", id);
  if (error?.code === "23503") throw new ServiceError("The POC must be a member of your team.", "validation");
  fromDb(error, "Updating POC");
}

// ── Activity: who did what on this campaign (from activity_log_thunder) ──
export type ActivityItem = { at: string; who: string; text: string };

const FIELD_LABELS: Record<string, string> = {
  name: "name", brief: "brief", objective: "objective", start_date: "start date", end_date: "end date",
  deliverables: "deliverables", brand_id: "brand",
};
type LogRow = { at: string; actor_id: string | null; action: string; table_name: string; record_id: string; before: Record<string, unknown> | null; after: Record<string, unknown> | null };

export async function campaignActivity(db: Db, workspaceId: string, id: string, limit = 40): Promise<ActivityItem[]> {
  const cols = "at, actor_id, action, table_name, record_id, before, after";
  const [camp, deals, dir, stages] = await Promise.all([
    db.from("activity_log_thunder").select(cols).eq("workspace_id", workspaceId).eq("table_name", "campaigns_thunder").eq("record_id", id).order("at", { ascending: false }).limit(limit),
    db.from("activity_log_thunder").select(cols).eq("workspace_id", workspaceId).eq("table_name", "deals_thunder").eq("after->>campaign_id", id).order("at", { ascending: false }).limit(limit * 3),
    memberDirectory(db, workspaceId),
    db.from("pipeline_stages_thunder").select("id, name").eq("workspace_id", workspaceId),
  ]);
  fromDb(camp.error ?? deals.error, "Loading activity");
  const stage = new Map((stages.data ?? []).map((st) => [st.id as string, st.name as string]));
  const rows = [...((camp.data ?? []) as LogRow[]), ...((deals.data ?? []) as LogRow[])];

  const inflIds = [...new Set(rows.filter((r) => r.table_name === "deals_thunder").map((r) => String((r.after ?? r.before)?.influencer_id ?? "")).filter(Boolean))];
  const infl = inflIds.length ? await db.from("influencers_thunder").select("id, handle").in("id", inflIds) : { data: [] as { id: string; handle: string }[] };
  const handle = new Map((infl.data ?? []).map((i) => [i.id, `@${i.handle}`]));
  const person = (uid: unknown) => personLabel(dir, uid);
  // A POC/owner cleared because that person was removed from the team.
  const leftTeam = (uid: unknown) => Boolean(uid) && dir.get(String(uid))?.current === false;

  const items: ActivityItem[] = [];
  for (const r of rows) {
    const b = r.before ?? {}, a = r.after ?? {};
    const changed = (k: string) => JSON.stringify(b[k] ?? null) !== JSON.stringify(a[k] ?? null);
    const lines: string[] = [];
    if (r.table_name === "campaigns_thunder") {
      if (r.action === "insert") lines.push("created the campaign");
      else if (r.action === "delete") lines.push("deleted the campaign");
      else if (r.action === "restore") lines.push("restored the campaign");
      else {
        if (changed("poc_id")) {
          if (a.poc_id) lines.push(`made ${person(a.poc_id)} the POC${b.poc_id ? ` (was ${person(b.poc_id)})` : ""}`);
          else if (leftTeam(b.poc_id)) lines.push(`removed ${person(b.poc_id).replace(" (removed)", "")} from the team, so this campaign has no POC`);
          else lines.push(`removed ${person(b.poc_id)} as POC`);
        }
        if (changed("status")) lines.push(`set status to ${String(a.status)}`);
        const edited = Object.keys(FIELD_LABELS).filter(changed).map((k) => FIELD_LABELS[k]);
        if (edited.length) lines.push(`edited ${edited.join(", ")}`);
      }
    } else {
      const h = handle.get(String(a.influencer_id ?? b.influencer_id)) ?? "an influencer";
      if (r.action === "insert") lines.push(`added ${h}`);
      else if (r.action === "delete") lines.push(`removed ${h}`);
      else if (r.action === "restore") lines.push(`restored ${h}`);
      else {
        if (changed("stage_id")) lines.push(`moved ${h} to ${stage.get(String(a.stage_id)) ?? "another stage"}`);
        if (changed("client_price") || changed("payout")) lines.push(`updated pricing for ${h}`);
        if (changed("payment_status")) lines.push(`marked ${h} payment ${String(a.payment_status).replace("_", " ")}`);
        if (changed("product")) lines.push(`set product for ${h}${a.product ? ` to ${String(a.product)}` : ""}`);
        if (changed("owner_id")) {
          if (a.owner_id) lines.push(`assigned ${h} to ${person(a.owner_id)}`);
          else if (leftTeam(b.owner_id)) lines.push(`removed ${person(b.owner_id).replace(" (removed)", "")} from the team, so ${h} has no owner`);
          else lines.push(`unassigned ${h}`);
        }
      }
    }
    for (const text of lines) items.push({ at: r.at, who: person(r.actor_id), text });
  }
  return items.sort((x, y) => (x.at < y.at ? 1 : -1)).slice(0, limit);
}

export async function setCampaignStatus(db: Db, workspaceId: string, id: string, status: string) {
  if (!(CAMPAIGN_STATUSES as readonly string[]).includes(status)) throw new ServiceError("Unknown status", "validation");
  const { error } = await db.from("campaigns_thunder").update({ status }).eq("workspace_id", workspaceId).eq("id", id);
  fromDb(error, "Updating status");
}

export async function deleteCampaign(db: Db, workspaceId: string, id: string) {
  const { error } = await db.from("campaigns_thunder").update({ deleted_at: new Date().toISOString() }).eq("workspace_id", workspaceId).eq("id", id);
  fromDb(error, "Deleting campaign");
}

/** Adds influencers to a campaign pipeline as Shortlisted. Skips anyone already in it. */
export async function addInfluencersToCampaign(db: Db, workspaceId: string, userId: string, campaignId: string, influencerIds: string[], copyFrom?: string) {
  const ids = [...new Set(influencerIds)].slice(0, 200);
  if (ids.length === 0) throw new ServiceError("Select at least one influencer.", "validation");
  const { data: existing, error: e1 } = await db.from("deals_thunder").select("influencer_id")
    .eq("workspace_id", workspaceId).eq("campaign_id", campaignId).is("deleted_at", null).in("influencer_id", ids);
  fromDb(e1, "Checking campaign");
  const already = new Set((existing ?? []).map((d) => d.influencer_id as string));
  const toAdd = ids.filter((id) => !already.has(id));
  if (toAdd.length) {
    // Optionally carry over price, payout, product and deliverables from a previous campaign's deal.
    const src = new Map<string, Record<string, unknown>>();
    if (copyFrom) {
      if (!z.uuid().safeParse(copyFrom).success || copyFrom === campaignId) throw new ServiceError("Choose a previous campaign", "validation");
      const { data, error } = await db.from("deals_thunder").select("influencer_id, client_price, payout, product, deliverables")
        .eq("workspace_id", workspaceId).eq("campaign_id", copyFrom).is("deleted_at", null).in("influencer_id", toAdd);
      fromDb(error, "Loading previous deals");
      for (const d of data ?? []) src.set(d.influencer_id as string, d);
    }
    const { error } = await db.from("deals_thunder").insert(
      toAdd.map((influencer_id) => {
        const d = src.get(influencer_id);
        return {
          workspace_id: workspaceId, campaign_id: campaignId, influencer_id, owner_id: userId, created_by: userId,
          ...(d ? { client_price: d.client_price, payout: d.payout, product: d.product, deliverables: d.deliverables ?? [] } : {}),
        };
      }),
    );
    fromDb(error, "Adding to campaign");
  }
  return { added: toAdd.length, skipped: already.size };
}

/** Influencer ids already in a campaign (not deleted), to mark them in pickers. */
export async function campaignInfluencerIds(db: Db, workspaceId: string, campaignId: string) {
  const { data, error } = await db.from("deals_thunder").select("influencer_id")
    .eq("workspace_id", workspaceId).eq("campaign_id", campaignId).is("deleted_at", null);
  fromDb(error, "Loading campaign influencers");
  return new Set((data ?? []).map((d) => d.influencer_id as string));
}

// ── Quick add: new (or existing) influencer straight into a campaign ──
export const quickAddInput = z.object({
  handle: z.string().min(1, "Instagram handle is required"),
  name: z.string().trim().max(120).optional(),
  followers: z.string().optional(),
  city: z.string().trim().max(80).optional(),
  phone: z.string().trim().max(40).optional(),
  niche_tags: z.string().optional(),
  client_price: z.string().optional(),
  payout: z.string().optional(),
  product: z.string().trim().max(120).optional(),
});

export type QuickAddResult = { dealId: string; influencerName: string; handle: string; created: boolean; alreadyInCampaign: boolean };

/**
 * One step from inside a campaign: find the influencer by handle (or create a minimal profile),
 * then add them to the campaign as Shortlisted, optionally with this campaign's price and payout.
 */
export async function quickAddToCampaign(db: Db, workspaceId: string, userId: string, campaignId: string, input: unknown): Promise<QuickAddResult> {
  const p = quickAddInput.safeParse(input);
  if (!p.success) throw new ServiceError(p.error.issues[0].message, "validation");
  const v = p.data;
  const handle = normalizeHandle(v.handle);
  if (!/^[a-z0-9._]{1,30}$/.test(handle)) throw new ServiceError("Enter a valid Instagram handle or profile link.", "validation");

  const money = (s?: string) => {
    const t = (s ?? "").replace(/[₹, ]/g, "");
    if (!t) return null;
    const n = Number(t);
    if (!Number.isFinite(n) || n < 0) throw new ServiceError("Prices must be positive numbers.", "validation");
    return n;
  };
  const clientPrice = money(v.client_price);
  const payout = money(v.payout);

  let influencer = await findByHandle(db, workspaceId, handle);
  let created = false;
  if (!influencer) {
    const isPhone = (v.phone ?? "").trim() !== "";
    const id = await createInfluencer(db, workspaceId, userId, {
      name: v.name?.trim() || handle,
      handle,
      followers: v.followers ?? "",
      city: v.city ?? "",
      whatsapp: isPhone ? v.phone : "",
      phone: isPhone ? v.phone : "",
      niche_tags: v.niche_tags ?? "",
    });
    influencer = { id, name: v.name?.trim() || handle, handle };
    created = true;
  }

  const { data: existing, error: e1 } = await db.from("deals_thunder").select("id")
    .eq("workspace_id", workspaceId).eq("campaign_id", campaignId).eq("influencer_id", influencer.id).is("deleted_at", null).maybeSingle();
  fromDb(e1, "Checking campaign");
  if (existing) return { dealId: existing.id, influencerName: influencer.name, handle, created, alreadyInCampaign: true };

  const { data, error } = await db.from("deals_thunder").insert({
    workspace_id: workspaceId, campaign_id: campaignId, influencer_id: influencer.id,
    owner_id: userId, created_by: userId, client_price: clientPrice, payout,
    product: v.product ? v.product.replace(/\s+/g, " ") : null,
  }).select("id").single();
  fromDb(error, "Adding to campaign");
  return { dealId: data!.id as string, influencerName: influencer.name, handle, created, alreadyInCampaign: false };
}

// ── Add from a previous campaign ─────────────────────────────
export type PreviousCampaign = { id: string; name: string; brand: string; sameBrand: boolean; start_date: string | null; count: number };

/** Other campaigns that have influencers, this brand's first, newest first. */
export async function previousCampaigns(db: Db, workspaceId: string, currentId: string, brandId: string): Promise<PreviousCampaign[]> {
  const { data, error } = await db.from("campaigns_thunder")
    .select("id, name, brand_id, start_date, created_at, brand:brands_thunder(name)")
    .eq("workspace_id", workspaceId).is("deleted_at", null).neq("id", currentId)
    .order("start_date", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }).limit(300);
  fromDb(error, "Loading campaigns");
  const fin = await financialsFor(db, workspaceId, (data ?? []).map((c) => c.id));
  const list = (data ?? []).map((c) => ({
    id: c.id as string, name: c.name as string, start_date: c.start_date as string | null,
    brand: one(c.brand as { name: string } | { name: string }[])?.name ?? "", sameBrand: c.brand_id === brandId,
    count: fin.get(c.id)?.influencer_count ?? 0,
  })).filter((c) => c.count > 0);
  return [...list.filter((c) => c.sameBrand), ...list.filter((c) => !c.sameBrand)];
}

export type PreviousRow = {
  influencer: { id: string; name: string; handle: string; followers: number | null; is_blacklisted: boolean };
  stage: string; dropped: boolean; product: string | null;
  client_price: number | null; payout: number | null; views: number | null; posts: number;
};

/** Influencers in a previous campaign with how it went: stage reached, price, payout, views. */
export async function previousCampaignInfluencers(db: Db, workspaceId: string, sourceId: string): Promise<PreviousRow[]> {
  if (!z.uuid().safeParse(sourceId).success) return [];
  const [deals, stages] = await Promise.all([
    db.from("deals_thunder")
      .select("id, stage_id, product, client_price, payout, influencer:influencers_thunder(id, name, handle, followers, is_blacklisted, deleted_at)")
      .eq("workspace_id", workspaceId).eq("campaign_id", sourceId).is("deleted_at", null).order("created_at"),
    db.from("pipeline_stages_thunder").select("id, name, kind").eq("workspace_id", workspaceId),
  ]);
  fromDb(deals.error ?? stages.error, "Loading previous campaign");
  const stage = new Map((stages.data ?? []).map((st) => [st.id as string, st]));
  const dealIds = (deals.data ?? []).map((d) => d.id as string);
  const posts = dealIds.length
    ? await db.from("posts_thunder").select("id, deal_id").eq("workspace_id", workspaceId).in("deal_id", dealIds).is("deleted_at", null)
    : { data: [] as { id: string; deal_id: string }[], error: null };
  fromDb(posts.error, "Loading posts");
  const postIds = (posts.data ?? []).map((p) => p.id);
  const latest = postIds.length
    ? await db.from("post_latest_metrics_thunder").select("post_id, views").eq("workspace_id", workspaceId).in("post_id", postIds)
    : { data: [] as { post_id: string; views: number | null }[], error: null };
  fromDb(latest.error, "Loading metrics");
  const viewsOf = new Map((latest.data ?? []).map((m) => [m.post_id as string, m.views as number | null]));

  return (deals.data ?? []).flatMap((d) => {
    const inf = one(d.influencer as unknown as (PreviousRow["influencer"] & { deleted_at: string | null }) | null);
    if (!inf || inf.deleted_at) return [];
    const ps = (posts.data ?? []).filter((p) => p.deal_id === d.id);
    const vs = ps.map((p) => viewsOf.get(p.id)).filter((v): v is number => typeof v === "number");
    const st = stage.get(d.stage_id as string);
    return [{
      influencer: { id: inf.id, name: inf.name, handle: inf.handle, followers: inf.followers, is_blacklisted: inf.is_blacklisted },
      stage: (st?.name as string) ?? "–", dropped: st?.kind === "dropped", product: d.product as string | null,
      client_price: d.client_price as number | null, payout: d.payout as number | null,
      views: vs.length ? vs.reduce((t, v) => t + Number(v), 0) : null, posts: ps.length,
    }];
  });
}

// ── Campaign cards: where each campaign's influencers are in the pipeline ──
export type PipelineMix = { total: number; working: number; confirmed: number; done: number; dropped: number };

/** Per campaign: in progress (before Confirmed), confirmed (in reports, not finished), done, dropped. */
export async function pipelineMix(db: Db, workspaceId: string, ids: string[]) {
  const out = new Map<string, PipelineMix>();
  if (!ids.length) return out;
  const [deals, stages] = await Promise.all([
    db.from("deals_thunder").select("campaign_id, stage_id").eq("workspace_id", workspaceId).in("campaign_id", ids).is("deleted_at", null),
    db.from("pipeline_stages_thunder").select("id, kind, in_reports").eq("workspace_id", workspaceId),
  ]);
  fromDb(deals.error ?? stages.error, "Loading pipeline");
  const st = new Map((stages.data ?? []).map((x) => [x.id as string, x]));
  for (const d of deals.data ?? []) {
    const m = out.get(d.campaign_id) ?? { total: 0, working: 0, confirmed: 0, done: 0, dropped: 0 };
    const k = st.get(d.stage_id as string);
    m.total++;
    if (k?.kind === "dropped") m.dropped++;
    else if (k?.kind === "done") m.done++;
    else if (k?.in_reports) m.confirmed++;
    else m.working++;
    out.set(d.campaign_id, m);
  }
  return out;
}
