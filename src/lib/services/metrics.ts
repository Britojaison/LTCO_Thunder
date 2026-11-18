/** Pure metric calculations, shared by deal pages, campaign performance and (later) client reports. */

export const METRIC_KEYS = ["views", "likes", "comments", "shares", "saves", "reposts", "reach", "profile_visits", "link_clicks"] as const;
export type MetricKey = (typeof METRIC_KEYS)[number];
export type Metrics = Partial<Record<MetricKey, number | null>>;

export const METRIC_LABELS: Record<MetricKey, string> = {
  views: "Views", likes: "Likes", comments: "Comments", shares: "Shares", saves: "Saves",
  reposts: "Reposts", reach: "Reach", profile_visits: "Profile visits", link_clicks: "Link clicks",
};

/** Engagements = likes + comments + shares + saves + reposts. */
export function engagements(m: Metrics) {
  const parts = [m.likes, m.comments, m.shares, m.saves, m.reposts];
  if (parts.every((x) => x === null || x === undefined)) return null;
  return parts.reduce<number>((t, x) => t + (x ?? 0), 0);
}

/** Adds metrics across posts. A metric stays null only if no post has it. */
export function sumMetrics(list: Metrics[]): Metrics {
  const out: Metrics = {};
  for (const k of METRIC_KEYS) {
    const vals = list.map((m) => m[k]).filter((v): v is number => v !== null && v !== undefined);
    out[k] = vals.length ? vals.reduce((a, b) => a + Number(b), 0) : null;
  }
  return out;
}

export type Derived = {
  engagements: number | null;
  engagementRate: number | null;      // % of reach, or of views when reach is missing
  erBase: "reach" | "views" | null;
  costPerView: number | null;
  costPerEngagement: number | null;
  costPer1kReach: number | null;
};

/** Rates for a set of metrics against a price (client price for clients, payout internally). */
export function derive(m: Metrics, price: number | null | undefined): Derived {
  const eng = engagements(m);
  const base = m.reach ? "reach" : m.views ? "views" : null;
  const denom = base === "reach" ? m.reach! : base === "views" ? m.views! : null;
  const p = price === null || price === undefined ? null : Number(price);
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return {
    engagements: eng,
    engagementRate: eng !== null && denom ? r2((eng / denom) * 100) : null,
    erBase: base,
    costPerView: p !== null && m.views ? r2(p / m.views) : null,
    costPerEngagement: p !== null && eng ? r2(p / eng) : null,
    costPer1kReach: p !== null && m.reach ? r2((p / m.reach) * 1000) : null,
  };
}
