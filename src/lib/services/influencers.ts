import { z } from "zod";
import type { Db } from "@/lib/supabase/server";
import { ServiceError, fromDb } from "./errors";
import type { Filters } from "./filters";

/** Influencer services: CRUD, search, review queue. Plain functions, no Next.js imports. */

// ── Input normalisation ──────────────────────────────────────
/** Accepts "@handle", "handle" or a profile URL and returns the bare lowercase handle. */
export function normalizeHandle(input: string): string {
  let h = input.trim();
  const m = h.match(/instagram\.com\/([^/?#]+)/i);
  if (m) h = m[1];
  return h.replace(/^@/, "").toLowerCase();
}

const optText = z
  .string()
  .trim()
  .max(500)
  .transform((s) => (s === "" ? null : s))
  .nullable()
  .optional();
const optInt = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? null : Number(String(v).replace(/[, ]/g, ""))),
  z.number().int().nonnegative().nullable(),
).optional();
const optMoney = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? null : Number(String(v).replace(/[₹, ]/g, ""))),
  z.number().nonnegative().nullable(),
).optional();
const optRating = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? null : Number(v)),
  z.number().int().min(1).max(5).nullable(),
).optional();
const tags = z.preprocess(
  (v) => (typeof v === "string" ? v.split(",") : v ?? []),
  z.array(z.string().trim().toLowerCase()).transform((a) => [...new Set(a.filter(Boolean))]),
);
const urls = z.preprocess(
  (v) => (typeof v === "string" ? v.split(/[\n,]/) : v ?? []),
  z.array(z.string().trim()).transform((a) => a.filter(Boolean).slice(0, 5)),
);
const optBool = z.preprocess((v) => (v === "" || v === undefined ? null : v === true || v === "true" || v === "on"), z.boolean().nullable()).optional();

export const influencerInput = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  handle: z
    .string()
    .transform(normalizeHandle)
    .pipe(z.string().regex(/^[a-z0-9._]{1,30}$/, "Enter a valid Instagram handle")),
  city: optText,
  state: optText,
  languages: tags,
  gender: z.preprocess((v) => (v === "" ? null : v), z.enum(["female", "male", "other", "mixed"]).nullable()).optional(),
  age_group: optText,
  phone: optText,
  email: z.preprocess((v) => (v === "" ? null : v), z.email("Enter a valid email").nullable()).optional(),
  whatsapp: optText,
  manager_contact: optText,
  followers: optInt,
  avg_reel_views: optInt,
  engagement_rate: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? null : Number(String(v).replace("%", ""))),
    z.number().nonnegative().max(100).nullable(),
  ).optional(),
  niche_tags: tags,
  content_styles: tags,
  formats: tags,
  on_camera: optBool,
  sample_posts: urls,
  rate_reel: optMoney,
  rate_story: optMoney,
  rate_carousel: optMoney,
  rate_collab: optMoney,
  open_to_barter: z.preprocess((v) => v === true || v === "true" || v === "on", z.boolean()),
  gst_registered: optBool,
  negotiation_notes: optText,
  rating_reliability: optRating,
  rating_quality: optRating,
  rating_ease: optRating,
});
export type InfluencerInput = z.input<typeof influencerInput>;

function parseInput(input: unknown) {
  const parsed = influencerInput.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new ServiceError(`${issue.path.join(".") || "Input"}: ${issue.message}`, "validation");
  }
  return parsed.data;
}

// ── Reads ────────────────────────────────────────────────────
export type SearchRow = {
  id: string; name: string; handle: string; city: string | null; state: string | null;
  languages: string[]; niche_tags: string[]; formats: string[]; gender: string | null;
  followers: number | null; avg_reel_views: number | null; engagement_rate: number | null;
  rate_reel: number | null; rate_story: number | null; rate_carousel: number | null; rate_collab: number | null;
  is_blacklisted: boolean; worked_before: boolean; fit_score: number | null; total_count: number;
};

export const PAGE_SIZE = 50;

export async function searchInfluencers(db: Db, workspaceId: string, filters: Filters, sort = "fit", page = 1) {
  const { data, error } = await db.rpc("search_influencers_thunder", {
    p_workspace_id: workspaceId,
    p_filters: filters,
    p_sort: sort,
    p_limit: PAGE_SIZE,
    p_offset: (Math.max(page, 1) - 1) * PAGE_SIZE,
  });
  fromDb(error, "Searching influencers");
  const rows = (data ?? []) as SearchRow[];
  return { rows, total: rows[0] ? Number(rows[0].total_count) : 0 };
}

export async function getInfluencer(db: Db, workspaceId: string, id: string) {
  if (!z.uuid().safeParse(id).success) throw new ServiceError("Influencer not found", "not_found");
  const { data, error } = await db
    .from("influencers_thunder")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("id", id)
    .maybeSingle();
  fromDb(error, "Loading influencer");
  if (!data) throw new ServiceError("Influencer not found", "not_found");
  return data;
}

export async function findByHandle(db: Db, workspaceId: string, handle: string) {
  const { data, error } = await db
    .from("influencers_thunder")
    .select("id, name, handle")
    .eq("workspace_id", workspaceId)
    .eq("handle", normalizeHandle(handle))
    .is("deleted_at", null)
    .maybeSingle();
  fromDb(error, "Checking handle");
  return data;
}

export async function influencerHistory(db: Db, workspaceId: string, id: string) {
  const [rates, deals, promos] = await Promise.all([
    db.from("rate_history_thunder").select("id, format, amount, effective_date, campaign_id")
      .eq("workspace_id", workspaceId).eq("influencer_id", id).order("effective_date", { ascending: false }).limit(50),
    db.from("deals_thunder")
      .select("id, payout, client_price, posting_date, campaign:campaigns_thunder(id, name, status, brand:brands_thunder(name)), stage:pipeline_stages_thunder(name)")
      .eq("workspace_id", workspaceId).eq("influencer_id", id).is("deleted_at", null).order("created_at", { ascending: false }),
    db.from("influencer_competitor_promotions_thunder").select("id, brand_name, promoted_on, post_url")
      .eq("workspace_id", workspaceId).eq("influencer_id", id).order("promoted_on", { ascending: false }),
  ]);
  fromDb(rates.error, "Loading rate history");
  fromDb(deals.error, "Loading campaign history");
  fromDb(promos.error, "Loading competitor promotions");
  return { rates: rates.data ?? [], deals: deals.data ?? [], promos: promos.data ?? [] };
}

// ── Writes ───────────────────────────────────────────────────
function duplicateMessage(handle: string) {
  return `@${handle} is already in your database.`;
}

export async function createInfluencer(db: Db, workspaceId: string, userId: string, input: unknown) {
  const values = parseInput(input);
  const existing = await findByHandle(db, workspaceId, values.handle);
  if (existing) throw new ServiceError(duplicateMessage(values.handle), "validation");

  const { data, error } = await db
    .from("influencers_thunder")
    .insert({ ...values, workspace_id: workspaceId, created_by: userId, source: "manual" })
    .select("id")
    .single();
  if (error?.code === "23505") throw new ServiceError(duplicateMessage(values.handle), "validation");
  fromDb(error, "Saving influencer");
  return data!.id as string;
}

export async function updateInfluencer(db: Db, workspaceId: string, id: string, input: unknown) {
  const values = parseInput(input);
  const existing = await findByHandle(db, workspaceId, values.handle);
  if (existing && existing.id !== id) throw new ServiceError(duplicateMessage(values.handle), "validation");

  const { error } = await db.from("influencers_thunder").update(values).eq("workspace_id", workspaceId).eq("id", id);
  if (error?.code === "23505") throw new ServiceError(duplicateMessage(values.handle), "validation");
  fromDb(error, "Updating influencer");
}

export async function setBlacklist(db: Db, workspaceId: string, id: string, blacklisted: boolean, reason?: string) {
  const { error } = await db
    .from("influencers_thunder")
    .update({ is_blacklisted: blacklisted, blacklist_reason: blacklisted ? reason?.trim() || null : null })
    .eq("workspace_id", workspaceId)
    .eq("id", id);
  fromDb(error, "Updating blacklist");
}

export async function softDeleteInfluencer(db: Db, workspaceId: string, id: string) {
  const { error } = await db
    .from("influencers_thunder")
    .update({ deleted_at: new Date().toISOString() })
    .eq("workspace_id", workspaceId)
    .eq("id", id);
  fromDb(error, "Deleting influencer");
}

export async function restoreInfluencer(db: Db, workspaceId: string, id: string) {
  const { data: row } = await db.from("influencers_thunder").select("handle").eq("id", id).maybeSingle();
  if (row && (await findByHandle(db, workspaceId, row.handle)))
    throw new ServiceError(`Another active profile already uses @${row.handle}.`, "validation");
  const { error } = await db.from("influencers_thunder").update({ deleted_at: null }).eq("workspace_id", workspaceId).eq("id", id);
  fromDb(error, "Restoring influencer");
}

export const promoInput = z.object({
  brand_name: z.string().trim().min(1, "Brand is required").max(120),
  promoted_on: z.iso.date("Enter a date"),
  post_url: z.preprocess((v) => (v === "" ? null : v), z.url().nullable()).optional(),
});

export async function addCompetitorPromo(db: Db, workspaceId: string, influencerId: string, input: unknown) {
  const parsed = promoInput.safeParse(input);
  if (!parsed.success) throw new ServiceError(parsed.error.issues[0].message, "validation");
  const { error } = await db
    .from("influencer_competitor_promotions_thunder")
    .insert({ ...parsed.data, workspace_id: workspaceId, influencer_id: influencerId });
  fromDb(error, "Saving competitor promotion");
}

export async function removeCompetitorPromo(db: Db, workspaceId: string, promoId: string) {
  const { error } = await db
    .from("influencer_competitor_promotions_thunder")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("id", promoId);
  fromDb(error, "Removing competitor promotion");
}

// ── Self-registration review queue ───────────────────────────
export async function listPending(db: Db, workspaceId: string) {
  const { data, error } = await db
    .from("pending_influencers_thunder")
    .select("id, payload, created_at")
    .eq("workspace_id", workspaceId)
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  fromDb(error, "Loading registrations");
  return data ?? [];
}

export async function countPending(db: Db, workspaceId: string) {
  const { count, error } = await db
    .from("pending_influencers_thunder")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("status", "pending");
  fromDb(error, "Counting registrations");
  return count ?? 0;
}

export async function approvePending(db: Db, pendingId: string) {
  const { data, error } = await db.rpc("approve_registration_thunder", { p_pending_id: pendingId });
  fromDb(error, "Approving registration");
  return data as string;
}

export async function rejectPending(db: Db, workspaceId: string, userId: string, pendingId: string) {
  const { error } = await db
    .from("pending_influencers_thunder")
    .update({ status: "rejected", reviewed_by: userId, reviewed_at: new Date().toISOString() })
    .eq("workspace_id", workspaceId)
    .eq("id", pendingId)
    .eq("status", "pending");
  fromDb(error, "Rejecting registration");
}

// ── Public self-registration (anon) ──────────────────────────
export const registrationInput = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  handle: z.string().transform(normalizeHandle).pipe(z.string().regex(/^[a-z0-9._]{1,30}$/, "Enter a valid Instagram handle")),
  city: z.string().trim().max(80).optional(),
  state: z.string().trim().max(80).optional(),
  phone: z.string().trim().max(30).optional(),
  email: z.preprocess((v) => (v === "" ? undefined : v), z.email().optional()),
  whatsapp: z.string().trim().max(30).optional(),
  gender: z.preprocess((v) => (v === "" ? undefined : v), z.enum(["female", "male", "other"]).optional()),
  languages: tags,
  niche_tags: tags,
  formats: tags,
  followers: z.string().trim().max(15).optional(),
  avg_reel_views: z.string().trim().max(15).optional(),
  rate_reel: z.string().trim().max(15).optional(),
  rate_story: z.string().trim().max(15).optional(),
  open_to_barter: z.preprocess((v) => v === "on" || v === true, z.boolean()),
});

export async function submitRegistration(db: Db, formToken: string, input: unknown, consent: boolean) {
  const parsed = registrationInput.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new ServiceError(issue.message, "validation");
  }
  if (!consent) throw new ServiceError("Please accept the consent checkbox.", "validation");
  const clean = Object.fromEntries(
    Object.entries(parsed.data).map(([k, v]) => [k, typeof v === "string" && /^(followers|avg_reel_views|rate_)/.test(k) ? v.replace(/[^\d]/g, "") : v]),
  );
  const { error } = await db.rpc("submit_registration_thunder", { p_form_token: formToken, p_payload: clean, p_consent: true });
  if (error?.code === "P0002") throw new ServiceError("This registration link is no longer valid.", "not_found");
  fromDb(error, "Submitting registration");
}
