import { z } from "zod";
import type { Db } from "@/lib/supabase/server";
import { ServiceError, fromDb } from "./errors";

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

export async function listCampaigns(db: Db, workspaceId: string, opts: { status?: string; brandId?: string } = {}) {
  let q = db.from("campaigns_thunder")
    .select("id, name, status, start_date, end_date, brand_id, brand:brands_thunder(name)")
    .eq("workspace_id", workspaceId).is("deleted_at", null)
    .order("start_date", { ascending: false, nullsFirst: true }).order("created_at", { ascending: false });
  if (opts.status && (CAMPAIGN_STATUSES as readonly string[]).includes(opts.status)) q = q.eq("status", opts.status);
  else if (opts.status !== "all") q = q.neq("status", "archived");
  if (opts.brandId && z.uuid().safeParse(opts.brandId).success) q = q.eq("brand_id", opts.brandId);
  const { data, error } = await q;
  fromDb(error, "Loading campaigns");
  const fin = await financialsFor(db, workspaceId, (data ?? []).map((c) => c.id));
  return (data ?? []).map((c) => ({
    id: c.id as string, name: c.name as string, status: c.status as CampaignStatus,
    start_date: c.start_date as string | null, end_date: c.end_date as string | null, brand_id: c.brand_id as string,
    brand: one(c.brand as { name: string } | { name: string }[])?.name ?? "",
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
    .select("*, brand:brands_thunder(id, name, logo_path, competitor_brands)")
    .eq("workspace_id", workspaceId).eq("id", id).is("deleted_at", null).maybeSingle();
  fromDb(error, "Loading campaign");
  if (!data) throw new ServiceError("Campaign not found", "not_found");
  const deliverables: { format: string; count: number }[] = z.array(z.object({ format: z.string(), count: z.number() })).catch([]).parse(data.deliverables);
  return {
    id: data.id as string, brand_id: data.brand_id as string, name: data.name as string,
    brief: data.brief as string | null, objective: data.objective as string | null,
    start_date: data.start_date as string | null, end_date: data.end_date as string | null,
    status: data.status as CampaignStatus, deliverables,
    brand: one(data.brand as unknown as { id: string; name: string; logo_path: string | null; competitor_brands: string[] }),
  };
}

/** Campaign overview: money, influencers per stage, and the deal list. */
export async function campaignOverview(db: Db, workspaceId: string, id: string) {
  const [fin, stages, deals] = await Promise.all([
    financialsFor(db, workspaceId, [id]),
    db.from("pipeline_stages_thunder").select("id, name, position, kind").eq("workspace_id", workspaceId).is("deleted_at", null).order("position"),
    db.from("deals_thunder")
      .select("id, stage_id, client_price, payout, margin, margin_pct, posting_date, influencer:influencers_thunder(id, name, handle, followers), owner:workspace_members_thunder(full_name, email)")
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
      posting_date: d.posting_date as string | null,
      influencer: one(d.influencer as unknown as { id: string; name: string; handle: string; followers: number | null } | null),
      owner: one(d.owner as unknown as { full_name: string | null; email: string } | null),
    })),
  };
}

export async function createCampaign(db: Db, workspaceId: string, userId: string, input: unknown) {
  const values = parse(input);
  const { data, error } = await db.from("campaigns_thunder").insert({ ...values, workspace_id: workspaceId, created_by: userId }).select("id").single();
  if (error?.code === "23503") throw new ServiceError("Choose a valid brand.", "validation");
  fromDb(error, "Saving campaign");
  return data!.id as string;
}

export async function updateCampaign(db: Db, workspaceId: string, id: string, input: unknown) {
  const values = parse(input);
  const { error } = await db.from("campaigns_thunder").update(values).eq("workspace_id", workspaceId).eq("id", id);
  fromDb(error, "Updating campaign");
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
export async function addInfluencersToCampaign(db: Db, workspaceId: string, userId: string, campaignId: string, influencerIds: string[]) {
  const ids = [...new Set(influencerIds)].slice(0, 200);
  if (ids.length === 0) throw new ServiceError("Select at least one influencer.", "validation");
  const { data: existing, error: e1 } = await db.from("deals_thunder").select("influencer_id")
    .eq("workspace_id", workspaceId).eq("campaign_id", campaignId).is("deleted_at", null).in("influencer_id", ids);
  fromDb(e1, "Checking campaign");
  const already = new Set((existing ?? []).map((d) => d.influencer_id as string));
  const toAdd = ids.filter((id) => !already.has(id));
  if (toAdd.length) {
    const { error } = await db.from("deals_thunder").insert(
      toAdd.map((influencer_id) => ({ workspace_id: workspaceId, campaign_id: campaignId, influencer_id, owner_id: userId, created_by: userId })),
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
