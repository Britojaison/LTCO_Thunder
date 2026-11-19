import { z } from "zod";

/** Report selections. Shared by the builder (browser), the print page and saved templates. */

export const REPORT_SECTIONS = ["summary", "top_posts", "influencer_table", "post_detail", "screenshots"] as const;
export const REPORT_METRICS = ["views", "likes", "comments", "shares", "saves", "reposts", "reach", "engagement_rate", "cost_per_engagement", "cost_per_view"] as const;
export const REPORT_SNAPSHOTS = ["24h", "7d", "30d", "latest"] as const;

export const SECTION_LABELS: Record<(typeof REPORT_SECTIONS)[number], string> = {
  summary: "Summary totals", top_posts: "Top posts", influencer_table: "Per-influencer table",
  post_detail: "Post-by-post detail", screenshots: "Insights screenshots",
};
export const REPORT_METRIC_LABELS: Record<(typeof REPORT_METRICS)[number], string> = {
  views: "Views", likes: "Likes", comments: "Comments", shares: "Shares", saves: "Saves", reposts: "Reposts", reach: "Reach",
  engagement_rate: "Engagement rate", cost_per_engagement: "Cost per engagement", cost_per_view: "Cost per view",
};

export const reportConfigSchema = z.object({
  title: z.string().trim().max(120).default(""),
  intro: z.string().trim().max(1500).default(""),
  sections: z.array(z.enum(REPORT_SECTIONS)).default([...REPORT_SECTIONS]),
  metrics: z.array(z.enum(REPORT_METRICS)).default([...REPORT_METRICS]),
  snapshot: z.enum(REPORT_SNAPSHOTS).default("latest"),
  costs: z.enum(["client_price", "hidden"]).default("client_price"),
  showProduct: z.boolean().default(true),
  excludedDeals: z.array(z.string()).default([]),
  excludedPosts: z.array(z.string()).default([]),
});
export type ReportConfig = z.infer<typeof reportConfigSchema>;

export const defaultReportConfig = (): ReportConfig => reportConfigSchema.parse({});

/** Templates are reusable across campaigns, so they never carry campaign-specific exclusions. */
export function templateFromConfig(c: ReportConfig) {
  return { ...c, excludedDeals: [], excludedPosts: [], title: "", intro: c.intro };
}

/** Cost metrics only exist when costs are shown. */
export function visibleMetrics(c: ReportConfig) {
  return c.metrics.filter((m) => c.costs === "client_price" || (m !== "cost_per_view" && m !== "cost_per_engagement"));
}
