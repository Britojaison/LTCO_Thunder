import { z } from "zod";
import type { Db } from "@/lib/supabase/server";
import { ServiceError, fromDb } from "./errors";
import { signedUrls } from "./storage";
import { reportConfigSchema, templateFromConfig, type ReportConfig } from "./report-config";
import type { Metrics } from "./metrics";

/**
 * Client report data. SAFETY RULE: this file reads campaign numbers only from
 * report_deals_thunder and report_post_metrics_thunder, which have no payout, margin,
 * payment, ratings or notes. Never query deals_thunder here.
 */

export type ReportSnapshot = Metrics & { snapshot_point: string; captured_at: string; screenshot_paths: string[] };
export type ReportPost = { post_id: string; url: string; format: string; posted_at: string | null; snapshots: ReportSnapshot[] };
export type ReportInfluencer = {
  deal_id: string; name: string; handle: string; profile_url: string; followers: number | null; city: string | null;
  client_price: number | null; deliverables: { format: string; count: number }[]; product: string | null; posts: ReportPost[];
};
export type ReportData = {
  agency: { name: string; logoUrl: string | null; color: string };
  brand: { name: string; logoUrl: string | null };
  campaign: { id: string; name: string; start_date: string | null; end_date: string | null };
  influencers: ReportInfluencer[];
  screenshotUrls: Record<string, string>;
  generatedAt: string;
};

const one = <T,>(v: T | T[] | null | undefined): T | undefined => (Array.isArray(v) ? v[0] : v ?? undefined);

export async function loadReportData(db: Db, workspaceId: string, campaignId: string, urlSeconds = 3600): Promise<ReportData> {
  if (!z.uuid().safeParse(campaignId).success) throw new ServiceError("Campaign not found", "not_found");
  const [ws, camp, deals, metrics] = await Promise.all([
    db.from("workspaces_thunder").select("name, logo_path, brand_colors").eq("id", workspaceId).single(),
    db.from("campaigns_thunder").select("id, name, start_date, end_date, brand:brands_thunder(name, logo_path)")
      .eq("workspace_id", workspaceId).eq("id", campaignId).is("deleted_at", null).maybeSingle(),
    db.from("report_deals_thunder").select("deal_id, influencer_name, influencer_handle, profile_url, followers, city, client_price, deliverables, product")
      .eq("workspace_id", workspaceId).eq("campaign_id", campaignId).order("influencer_name"),
    db.from("report_post_metrics_thunder").select("*").eq("workspace_id", workspaceId).eq("campaign_id", campaignId),
  ]);
  fromDb(ws.error, "Loading agency");
  fromDb(camp.error, "Loading campaign");
  fromDb(deals.error, "Loading influencers");
  fromDb(metrics.error, "Loading metrics");
  if (!camp.data) throw new ServiceError("Campaign not found", "not_found");

  const brand = one(camp.data.brand as unknown as { name: string; logo_path: string | null });
  const posts = new Map<string, ReportPost>();
  const dealOfPost = new Map<string, string>();
  for (const r of (metrics.data ?? []) as Record<string, unknown>[]) {
    const pid = r.post_id as string;
    if (!posts.has(pid)) {
      posts.set(pid, { post_id: pid, url: r.url as string, format: r.format as string, posted_at: r.posted_at as string | null, snapshots: [] });
      dealOfPost.set(pid, r.deal_id as string);
    }
    if (r.snapshot_point) {
      posts.get(pid)!.snapshots.push({
        snapshot_point: r.snapshot_point as string, captured_at: r.captured_at as string,
        screenshot_paths: (r.screenshot_paths as string[] | null) ?? [],
        views: r.views as number | null, likes: r.likes as number | null, comments: r.comments as number | null,
        shares: r.shares as number | null, saves: r.saves as number | null, reposts: r.reposts as number | null,
        reach: r.reach as number | null, profile_visits: r.profile_visits as number | null, link_clicks: r.link_clicks as number | null,
      });
    }
  }

  const allShots = [...posts.values()].flatMap((p) => p.snapshots.flatMap((s) => s.screenshot_paths));
  const urls = await signedUrls(db, [ws.data?.logo_path, brand?.logo_path, ...allShots], urlSeconds);
  const colors = (ws.data?.brand_colors ?? {}) as { primary?: string };

  return {
    agency: { name: ws.data?.name ?? "", logoUrl: ws.data?.logo_path ? urls[ws.data.logo_path] ?? null : null, color: /^#[0-9a-f]{6}$/i.test(colors.primary ?? "") ? colors.primary! : "#18181b" },
    brand: { name: brand?.name ?? "", logoUrl: brand?.logo_path ? urls[brand.logo_path] ?? null : null },
    campaign: { id: camp.data.id, name: camp.data.name, start_date: camp.data.start_date, end_date: camp.data.end_date },
    influencers: (deals.data ?? []).map((d) => ({
      deal_id: d.deal_id, name: d.influencer_name, handle: d.influencer_handle, profile_url: d.profile_url,
      followers: d.followers, city: d.city, client_price: d.client_price === null ? null : Number(d.client_price),
      deliverables: Array.isArray(d.deliverables) ? d.deliverables : [], product: (d.product as string | null) ?? null,
      posts: [...posts.values()].filter((p) => dealOfPost.get(p.post_id) === d.deal_id)
        .sort((a, b) => (a.posted_at ?? "").localeCompare(b.posted_at ?? "")),
    })),
    screenshotUrls: Object.fromEntries(allShots.filter((p) => urls[p]).map((p) => [p, urls[p]])),
    generatedAt: new Date().toISOString(),
  };
}

// ── Saved reports ────────────────────────────────────────────
export async function saveReport(db: Db, workspaceId: string, userId: string, campaignId: string, config: unknown, templateId?: string | null) {
  const c = reportConfigSchema.safeParse(config);
  if (!c.success) throw new ServiceError("Invalid report settings", "validation");
  const { data, error } = await db.from("reports_thunder").insert({
    workspace_id: workspaceId, campaign_id: campaignId, config: c.data, status: "ready",
    title: c.data.title || null, template_id: templateId && z.uuid().safeParse(templateId).success ? templateId : null, created_by: userId,
  }).select("id").single();
  fromDb(error, "Saving report");
  return data!.id as string;
}

export async function getReport(db: Db, workspaceId: string, reportId: string) {
  if (!z.uuid().safeParse(reportId).success) throw new ServiceError("Report not found", "not_found");
  const { data, error } = await db.from("reports_thunder").select("id, campaign_id, config, title, created_at")
    .eq("workspace_id", workspaceId).eq("id", reportId).maybeSingle();
  fromDb(error, "Loading report");
  if (!data) throw new ServiceError("Report not found", "not_found");
  return { ...data, config: reportConfigSchema.catch(reportConfigSchema.parse({})).parse(data.config) as ReportConfig };
}

export async function listReports(db: Db, workspaceId: string, campaignId?: string) {
  let q = db.from("reports_thunder")
    .select("id, campaign_id, title, created_at, created_by, campaign:campaigns_thunder(name, brand:brands_thunder(name))")
    .eq("workspace_id", workspaceId).order("created_at", { ascending: false }).limit(100);
  if (campaignId) q = q.eq("campaign_id", campaignId);
  const { data, error } = await q;
  fromDb(error, "Loading reports");
  return (data ?? []).map((r) => {
    const c = one(r.campaign as unknown as { name: string; brand: { name: string } | { name: string }[] });
    return { id: r.id as string, campaign_id: r.campaign_id as string, title: r.title as string | null, created_at: r.created_at as string,
      campaign: c?.name ?? "", brand: one(c?.brand)?.name ?? "" };
  });
}

// ── Templates (per brand) ────────────────────────────────────
export async function listTemplates(db: Db, workspaceId: string, brandId: string) {
  const { data, error } = await db.from("report_templates_thunder").select("id, name, config")
    .eq("workspace_id", workspaceId).eq("brand_id", brandId).is("deleted_at", null).order("name");
  fromDb(error, "Loading templates");
  return (data ?? []).map((t) => ({ id: t.id as string, name: t.name as string, config: reportConfigSchema.catch(reportConfigSchema.parse({})).parse(t.config) as ReportConfig }));
}

export async function saveTemplate(db: Db, workspaceId: string, userId: string, brandId: string, name: string, config: unknown) {
  const n = z.string().trim().min(1, "Name the template").max(80).safeParse(name);
  if (!n.success) throw new ServiceError(n.error.issues[0].message, "validation");
  const c = reportConfigSchema.safeParse(config);
  if (!c.success) throw new ServiceError("Invalid report settings", "validation");
  const { error } = await db.from("report_templates_thunder").insert({
    workspace_id: workspaceId, brand_id: brandId, name: n.data, config: templateFromConfig(c.data), created_by: userId,
  });
  fromDb(error, "Saving template");
}

export async function deleteTemplate(db: Db, workspaceId: string, templateId: string) {
  const { error } = await db.from("report_templates_thunder").update({ deleted_at: new Date().toISOString() }).eq("workspace_id", workspaceId).eq("id", templateId);
  fromDb(error, "Deleting template");
}
