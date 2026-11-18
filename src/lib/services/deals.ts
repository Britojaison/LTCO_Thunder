import { z } from "zod";
import type { Db } from "@/lib/supabase/server";
import { ServiceError, fromDb } from "./errors";
import { BUCKET } from "./storage";

/** Deal services: one deal = one influencer in one campaign. Holds the money. */

const one = <T,>(v: T | T[] | null | undefined): T | undefined => (Array.isArray(v) ? v[0] : v ?? undefined);
const money = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? null : Number(String(v).replace(/[₹, ]/g, ""))),
  z.number().nonnegative("Amounts can't be negative").max(1e10).nullable(),
);
const optDate = z.preprocess((v) => (v === "" || v === undefined ? null : v), z.iso.date().nullable());
const count = z.coerce.number().int().min(0).max(1000).default(0);

export type RateStats = Partial<Record<"reel" | "story" | "carousel" | "collab", { avg: number; deals: number }>> & { all?: { avg_payout: number; deals: number } };

export const PAYMENT_STATUSES = ["pending", "partly_paid", "paid"] as const;
export const CONTACT_CHANNELS = ["call", "whatsapp", "email", "instagram_dm", "other"] as const;

export type DealRow = {
  id: string; stage_id: string | null; position: number; owner_id: string | null;
  deliverables: { format: string; count: number }[];
  client_price: number | null; payout: number | null; margin: number | null; margin_pct: number | null;
  due_date: string | null; posting_date: string | null; payment_status: string; payment_due_date: string | null;
  influencer: { id: string; name: string; handle: string; followers: number | null; city: string | null } | undefined;
  owner: { full_name: string | null; email: string } | undefined;
};

const DEAL_LIST = `id, stage_id, position, owner_id, deliverables, client_price, payout, margin, margin_pct, due_date, posting_date,
  payment_status, payment_due_date,
  influencer:influencers_thunder(id, name, handle, followers, city),
  owner:workspace_members_thunder(full_name, email)`;

function shapeDeal(d: Record<string, unknown>): DealRow {
  return {
    ...(d as unknown as DealRow),
    deliverables: z.array(z.object({ format: z.string(), count: z.number() })).catch([]).parse(d.deliverables),
    influencer: one(d.influencer as DealRow["influencer"] | DealRow["influencer"][]),
    owner: one(d.owner as DealRow["owner"] | DealRow["owner"][]),
  };
}

export async function listStages(db: Db, workspaceId: string) {
  const { data, error } = await db.from("pipeline_stages_thunder").select("id, name, position, kind")
    .eq("workspace_id", workspaceId).is("deleted_at", null).order("position");
  fromDb(error, "Loading stages");
  return (data ?? []) as { id: string; name: string; position: number; kind: "open" | "done" | "dropped" }[];
}

export async function listMembers(db: Db, workspaceId: string) {
  const { data, error } = await db.from("workspace_members_thunder").select("user_id, full_name, email").eq("workspace_id", workspaceId).order("full_name");
  fromDb(error, "Loading team");
  return (data ?? []) as { user_id: string; full_name: string | null; email: string }[];
}

export type DealFilters = { stage?: string; owner?: string; payment?: string };

export async function listDeals(db: Db, workspaceId: string, campaignId: string, f: DealFilters = {}) {
  let q = db.from("deals_thunder").select(DEAL_LIST)
    .eq("workspace_id", workspaceId).eq("campaign_id", campaignId).is("deleted_at", null)
    .order("position").order("created_at");
  if (f.stage && z.uuid().safeParse(f.stage).success) q = q.eq("stage_id", f.stage);
  if (f.owner && z.uuid().safeParse(f.owner).success) q = q.eq("owner_id", f.owner);
  if (f.payment && (PAYMENT_STATUSES as readonly string[]).includes(f.payment)) q = q.eq("payment_status", f.payment);
  const { data, error } = await q;
  fromDb(error, "Loading deals");
  return (data ?? []).map(shapeDeal);
}

export async function getDeal(db: Db, workspaceId: string, dealId: string) {
  if (!z.uuid().safeParse(dealId).success) throw new ServiceError("Deal not found", "not_found");
  const { data, error } = await db.from("deals_thunder")
    .select(`*, influencer:influencers_thunder(id, name, handle, followers, city, phone, whatsapp, email, rate_reel, rate_story, rate_carousel, rate_collab, rate_stats),
      campaign:campaigns_thunder(id, name, deliverables, brand:brands_thunder(name))`)
    .eq("workspace_id", workspaceId).eq("id", dealId).is("deleted_at", null).maybeSingle();
  fromDb(error, "Loading deal");
  if (!data) throw new ServiceError("Deal not found", "not_found");
  const campaign = one(data.campaign as unknown as { id: string; name: string; deliverables: unknown; brand: { name: string } | { name: string }[] });
  return {
    ...data,
    deliverables: z.array(z.object({ format: z.string(), count: z.number() })).catch([]).parse(data.deliverables),
    influencer: one(data.influencer as unknown as Record<string, unknown>) as {
      id: string; name: string; handle: string; followers: number | null; city: string | null; phone: string | null; whatsapp: string | null;
      email: string | null; rate_reel: number | null; rate_story: number | null; rate_carousel: number | null; rate_collab: number | null;
      rate_stats: RateStats;
    },
    campaign: campaign && {
      id: campaign.id, name: campaign.name, brand: one(campaign.brand)?.name ?? "",
      deliverables: z.array(z.object({ format: z.string(), count: z.number() })).catch([]).parse(campaign.deliverables),
    },
  };
}

// ── Updates ──────────────────────────────────────────────────
export const dealInput = z.object({
  stage_id: z.uuid(),
  owner_id: z.preprocess((v) => (v === "" ? null : v), z.uuid().nullable()),
  deliv_reel: count, deliv_story: count, deliv_carousel: count, deliv_collab: count,
  client_price: money, payout: money, barter_value: money,
  due_date: optDate, posting_date: optDate,
  usage_rights_days: z.preprocess((v) => (v === "" || v === undefined ? null : Number(v)), z.number().int().min(0).max(3650).nullable()),
});

export async function updateDeal(db: Db, workspaceId: string, dealId: string, input: unknown) {
  const p = dealInput.safeParse(input);
  if (!p.success) throw new ServiceError(p.error.issues[0].message, "validation");
  const { deliv_reel, deliv_story, deliv_carousel, deliv_collab, ...rest } = p.data;
  const deliverables = ([["reel", deliv_reel], ["story", deliv_story], ["carousel", deliv_carousel], ["collab", deliv_collab]] as const)
    .filter(([, n]) => n > 0).map(([format, count]) => ({ format, count }));
  const { error } = await db.from("deals_thunder").update({ ...rest, deliverables }).eq("workspace_id", workspaceId).eq("id", dealId);
  fromDb(error, "Saving deal");
}

export const paymentInput = z.object({
  invoice_amount: money, gst_amount: money, tds_amount: money,
  payment_due_date: optDate, paid_on: optDate,
  amount_paid: z.preprocess((v) => (v === "" || v === null || v === undefined ? 0 : Number(String(v).replace(/[₹, ]/g, ""))), z.number().nonnegative()),
});

/** Net payable to the influencer = invoice + GST − TDS. */
export function netPayable(p: { invoice_amount: number | null; gst_amount: number | null; tds_amount: number | null }) {
  if (p.invoice_amount === null) return null;
  return Math.round((p.invoice_amount + (p.gst_amount ?? 0) - (p.tds_amount ?? 0)) * 100) / 100;
}

/** Payment status follows the amounts: nothing paid → Pending, part → Partly paid, all → Paid. */
export function derivePaymentStatus(net: number | null, paid: number) {
  if (paid <= 0) return "pending";
  if (net !== null && paid + 0.005 < net) return "partly_paid";
  return "paid";
}

export async function updatePayment(db: Db, workspaceId: string, dealId: string, input: unknown) {
  const p = paymentInput.safeParse(input);
  if (!p.success) throw new ServiceError(p.error.issues[0].message, "validation");
  const v = p.data;
  const net = netPayable(v);
  if (net !== null && net < 0) throw new ServiceError("TDS can't be more than the invoice plus GST.", "validation");
  const status = derivePaymentStatus(net, v.amount_paid);
  const paid_on = status === "paid" ? v.paid_on ?? new Date().toISOString().slice(0, 10) : v.paid_on;
  const { error } = await db.from("deals_thunder").update({ ...v, paid_on, payment_status: status }).eq("workspace_id", workspaceId).eq("id", dealId);
  fromDb(error, "Saving payment");
  return status;
}

/** Moves a deal to another stage (drag and drop or stage picker). New position = end of column. */
export async function moveDeal(db: Db, workspaceId: string, dealId: string, stageId: string) {
  if (!z.uuid().safeParse(dealId).success || !z.uuid().safeParse(stageId).success) throw new ServiceError("Invalid move", "validation");
  const { error } = await db.from("deals_thunder")
    .update({ stage_id: stageId, position: Math.floor(Date.now() / 1000) })
    .eq("workspace_id", workspaceId).eq("id", dealId);
  if (error?.code === "23503") throw new ServiceError("That stage no longer exists.", "validation");
  fromDb(error, "Moving deal");
}

export async function removeDeal(db: Db, workspaceId: string, dealId: string) {
  const { error } = await db.from("deals_thunder").update({ deleted_at: new Date().toISOString() }).eq("workspace_id", workspaceId).eq("id", dealId);
  fromDb(error, "Removing deal");
}

// ── Contact log ──────────────────────────────────────────────
export async function listContacts(db: Db, workspaceId: string, dealId: string) {
  const { data, error } = await db.from("contact_logs_thunder").select("id, channel, note, contacted_at, member_id")
    .eq("workspace_id", workspaceId).eq("deal_id", dealId).order("contacted_at", { ascending: false });
  fromDb(error, "Loading contact log");
  return data ?? [];
}

export const contactInput = z.object({
  channel: z.enum(CONTACT_CHANNELS),
  note: z.string().trim().max(2000).optional(),
  contacted_on: z.preprocess((v) => (v === "" || v === undefined ? undefined : v), z.iso.date().optional()),
});

export async function addContact(db: Db, workspaceId: string, userId: string, dealId: string, input: unknown) {
  const p = contactInput.safeParse(input);
  if (!p.success) throw new ServiceError(p.error.issues[0].message, "validation");
  const { contacted_on, ...rest } = p.data;
  const when = contacted_on && contacted_on !== new Date().toISOString().slice(0, 10) ? `${contacted_on}T12:00:00+05:30` : new Date().toISOString();
  const { error } = await db.from("contact_logs_thunder").insert({ ...rest, workspace_id: workspaceId, deal_id: dealId, member_id: userId, contacted_at: when });
  fromDb(error, "Saving contact");
}

// ── Files (contract, invoice): browser uploads straight to storage with a signed URL ──
export const DEAL_FILE_KINDS = ["contract", "invoice"] as const;
const DOC_TYPES: Record<string, string> = { "application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
export const MAX_DOC_BYTES = 10 * 1024 * 1024;

export async function createDealUpload(db: Db, workspaceId: string, dealId: string, kind: string, contentType: string, size: number) {
  if (!(DEAL_FILE_KINDS as readonly string[]).includes(kind)) throw new ServiceError("Unknown file type", "validation");
  const ext = DOC_TYPES[contentType];
  if (!ext) throw new ServiceError("Upload a PDF or an image (PNG, JPG, WebP).", "validation");
  if (size > MAX_DOC_BYTES) throw new ServiceError("Files must be under 10 MB.", "validation");
  const path = `${workspaceId}/deals/${dealId}/${kind}-${Date.now()}.${ext}`;
  const { data, error } = await db.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) throw new ServiceError(`Couldn't start upload: ${error?.message ?? "unknown error"}`);
  return { path, token: data.token };
}

export async function attachDealFile(db: Db, workspaceId: string, dealId: string, kind: string, path: string) {
  if (!(DEAL_FILE_KINDS as readonly string[]).includes(kind)) throw new ServiceError("Unknown file type", "validation");
  if (!path.startsWith(`${workspaceId}/deals/${dealId}/${kind}-`)) throw new ServiceError("Invalid file", "validation");
  const column = kind === "contract" ? "contract_path" : "invoice_path";
  const { error } = await db.from("deals_thunder").update({ [column]: path }).eq("workspace_id", workspaceId).eq("id", dealId);
  fromDb(error, "Saving file");
}

export async function detachDealFile(db: Db, workspaceId: string, dealId: string, kind: string) {
  if (!(DEAL_FILE_KINDS as readonly string[]).includes(kind)) throw new ServiceError("Unknown file type", "validation");
  const column = kind === "contract" ? "contract_path" : "invoice_path";
  const { error } = await db.from("deals_thunder").update({ [column]: null }).eq("workspace_id", workspaceId).eq("id", dealId);
  fromDb(error, "Removing file");
}

// ── CSV export (internal: includes payouts) ──────────────────
export function dealsToCsv(rows: DealRow[], stageName: (id: string | null) => string) {
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s; // block spreadsheet formula injection
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const head = ["Influencer", "Handle", "Followers", "City", "Stage", "Owner", "Deliverables", "Cost to client", "Cost to agency", "Profit", "Profit %", "Due date", "Posting date", "Payment status", "Payment due"];
  const lines = rows.map((d) => [
    d.influencer?.name, d.influencer?.handle ? `@${d.influencer.handle}` : "", d.influencer?.followers, d.influencer?.city,
    stageName(d.stage_id), d.owner?.full_name || d.owner?.email, d.deliverables.map((x) => `${x.count} ${x.format}`).join("; "),
    d.client_price, d.payout, d.margin, d.margin_pct, d.due_date, d.posting_date, d.payment_status.replace("_", " "), d.payment_due_date,
  ].map(esc).join(","));
  return "﻿" + [head.join(","), ...lines].join("\r\n");
}
