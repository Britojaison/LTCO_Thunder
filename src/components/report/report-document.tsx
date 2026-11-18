import type { ReportData, ReportPost, ReportSnapshot } from "@/lib/services/reports";
import { visibleMetrics, REPORT_METRIC_LABELS, type ReportConfig } from "@/lib/services/report-config";
import { derive, sumMetrics, type Metrics } from "@/lib/services/metrics";

/**
 * The client-facing report. Pure (no hooks, no data access): the builder renders it live
 * in the browser and the print page renders it on the server for "Save as PDF".
 * It only ever receives ReportData, which has no payout or margin fields.
 */

const fmtNum = (n: number | null | undefined) =>
  n === null || n === undefined ? "–" : new Intl.NumberFormat("en-IN", { notation: n >= 100000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(n);
const fmtInr = (n: number | null | undefined, dp = 0) =>
  n === null || n === undefined ? "–" : `₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: dp, minimumFractionDigits: dp }).format(n)}`;
const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "";

export function pickSnapshot(post: ReportPost, point: ReportConfig["snapshot"]): ReportSnapshot | null {
  if (point === "latest") return post.snapshots.reduce<ReportSnapshot | null>((b, s) => (!b || s.captured_at >= b.captured_at ? s : b), null);
  return post.snapshots.find((s) => s.snapshot_point === point) ?? null;
}

type Metric = ReturnType<typeof visibleMetrics>[number];

const SHORT: Partial<Record<Metric, string>> = { engagement_rate: "ER", cost_per_engagement: "₹/engagement", cost_per_view: "₹/view" };
const label = (m: Metric) => SHORT[m] ?? REPORT_METRIC_LABELS[m];
const MAX_COLS = 6;
const chunk = <T,>(a: T[], n: number) => (a.length <= n ? [a] : Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n)));

/** True if the metric has a value for at least one of these metric sets. */
function hasData(metric: Metric, sets: { m: Metrics; price: number | null }[]) {
  return sets.some(({ m, price }) => {
    const d = derive(m, price);
    if (metric === "engagement_rate") return d.engagementRate !== null;
    if (metric === "cost_per_view") return d.costPerView !== null;
    if (metric === "cost_per_engagement") return d.costPerEngagement !== null;
    return m[metric] !== null && m[metric] !== undefined;
  });
}

function Legend({ cols }: { cols: Metric[] }) {
  const used = cols.filter((c) => SHORT[c]);
  if (!used.length) return null;
  return (
    <p className="mt-2 text-[10px] text-zinc-500">
      {used.map((c) => `${SHORT[c]} = ${REPORT_METRIC_LABELS[c]}`).join(" · ")}
      {used.includes("engagement_rate") ? " (likes + comments + shares + saves + reposts, per reach or views)" : ""}
    </p>
  );
}

function value(metric: Metric, m: Metrics, price: number | null) {
  const d = derive(m, price);
  switch (metric) {
    case "engagement_rate": return d.engagementRate === null ? "–" : `${d.engagementRate}%`;
    case "cost_per_view": return fmtInr(d.costPerView, 2);
    case "cost_per_engagement": return fmtInr(d.costPerEngagement, 2);
    default: return fmtNum(m[metric]);
  }
}

export function ReportDocument({ data, config }: { data: ReportData; config: ReportConfig }) {
  const metrics = visibleMetrics(config);
  const showCost = config.costs === "client_price";
  const has = (s: ReportConfig["sections"][number]) => config.sections.includes(s);
  const snapLabel = config.snapshot === "latest" ? "Latest numbers" : `${config.snapshot} after posting`;

  const influencers = data.influencers
    .filter((i) => !config.excludedDeals.includes(i.deal_id))
    .map((i) => {
      const posts = i.posts.filter((p) => !config.excludedPosts.includes(p.post_id)).map((p) => ({ post: p, snap: pickSnapshot(p, config.snapshot) }));
      const m = sumMetrics(posts.map((p) => p.snap).filter(Boolean) as Metrics[]);
      return { ...i, posts, m, hasData: posts.some((p) => p.snap) };
    });
  const withData = influencers.filter((i) => i.hasData);
  const total = sumMetrics(withData.map((i) => i.m));
  const totalCost = withData.reduce((t, i) => t + (i.client_price ?? 0), 0) || null;
  const allPosts = influencers.flatMap((i) => i.posts.map((p) => ({ ...p, influencer: i })));
  const topPosts = allPosts.filter((p) => p.snap).sort((a, b) => (b.snap!.views ?? 0) - (a.snap!.views ?? 0)).slice(0, 5);
  const topCols = metrics.filter((m) => !m.startsWith("cost") && hasData(m, topPosts.map((p) => ({ m: p.snap!, price: null })))).slice(0, 5);
  const accent = { color: data.agency.color };
  const accentBg = { backgroundColor: data.agency.color };

  return (
    <div className="report-doc bg-white text-[13px] leading-relaxed text-zinc-900">
      {/* Cover */}
      <section className="report-page flex min-h-[260mm] flex-col justify-between p-[14mm]">
        <div className="flex items-start justify-between">
          {data.agency.logoUrl
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={data.agency.logoUrl} alt={data.agency.name} className="h-10 max-w-[45mm] object-contain" />
            : <span className="text-sm font-semibold" style={accent}>{data.agency.name}</span>}
          <span className="text-xs text-zinc-500">Campaign report</span>
        </div>
        <div>
          {data.brand.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={data.brand.logoUrl} alt={data.brand.name} className="mb-6 h-24 max-w-[80mm] object-contain" />
          )}
          <p className="text-sm uppercase tracking-wide text-zinc-500">{data.brand.name}</p>
          <h1 className="mt-1 text-4xl font-semibold">{config.title || data.campaign.name}</h1>
          <p className="mt-2 text-zinc-600">
            {[data.campaign.start_date && `${fmtDate(data.campaign.start_date)} – ${fmtDate(data.campaign.end_date)}`, snapLabel].filter(Boolean).join(" · ")}
          </p>
          <div className="mt-6 h-1 w-24 rounded" style={accentBg} />
          {config.intro && <p className="mt-6 max-w-[150mm] whitespace-pre-line text-zinc-700">{config.intro}</p>}
        </div>
        <p className="text-xs text-zinc-400">Prepared by {data.agency.name} · {fmtDate(data.generatedAt)}</p>
      </section>

      {has("summary") && (
        <section className="report-page p-[14mm]">
          <h2 className="mb-4 text-xl font-semibold" style={accent}>Summary</h2>
          <div className="grid grid-cols-4 gap-3">
            <Stat label="Influencers" value={String(withData.length)} />
            <Stat label="Posts" value={String(allPosts.filter((p) => p.snap).length)} />
            {metrics.filter((m) => hasData(m, [{ m: total, price: totalCost }])).map((m) => <Stat key={m} label={REPORT_METRIC_LABELS[m]} value={value(m, total, totalCost)} />)}
            {showCost && <Stat label="Total investment" value={fmtInr(totalCost)} />}
          </div>
          {withData.length < influencers.length && (
            <p className="mt-3 text-xs text-zinc-500">{influencers.length - withData.length} influencer(s) without {config.snapshot === "latest" ? "" : `${config.snapshot} `}numbers yet are not counted.</p>
          )}
        </section>
      )}

      {has("top_posts") && topPosts.length > 0 && (
        <section className="report-page p-[14mm]">
          <h2 className="mb-4 text-xl font-semibold" style={accent}>Top posts by views</h2>
          <table className="w-full border-collapse">
            <thead><tr className="border-b-2 border-zinc-200 text-left text-xs text-zinc-500">
              <th className="py-2">#</th><th>Influencer</th><th>Post</th>
              {topCols.map((m) => <th key={m} className="whitespace-nowrap px-1 text-right">{label(m)}</th>)}
            </tr></thead>
            <tbody>
              {topPosts.map((p, i) => (
                <tr key={p.post.post_id} className="border-b border-zinc-100">
                  <td className="py-2 font-semibold" style={accent}>{i + 1}</td>
                  <td>{p.influencer.name}<div className="text-xs text-zinc-500">@{p.influencer.handle}</div></td>
                  <td className="text-xs"><a href={p.post.url} className="text-zinc-600 underline">{p.post.format}</a> · {fmtDate(p.post.posted_at)}</td>
                  {topCols.map((m) => <td key={m} className="whitespace-nowrap px-1 text-right tabular-nums">{value(m, p.snap!, null)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {has("influencer_table") && (() => {
        const cols = metrics.filter((m) => hasData(m, influencers.map((i) => ({ m: i.m, price: i.client_price }))));
        const showFollowers = influencers.some((i) => i.followers !== null);
        const groups = chunk(cols, MAX_COLS);
        return (
          <section className="report-page p-[14mm]">
            <h2 className="mb-4 text-xl font-semibold" style={accent}>Influencer performance</h2>
            {groups.map((group, gi) => (
              <table key={gi} className={`w-full border-collapse text-[11px] ${gi > 0 ? "mt-6" : ""}`}>
                <thead><tr className="border-b-2 border-zinc-200 text-left text-[10px] text-zinc-500">
                  <th className="w-[34%] py-2">Influencer</th>
                  {gi === 0 && showFollowers && <th className="whitespace-nowrap px-1 text-right">Followers</th>}
                  {gi === 0 && <th className="whitespace-nowrap px-1 text-right">Posts</th>}
                  {gi === 0 && showCost && <th className="whitespace-nowrap px-1 text-right">Investment</th>}
                  {group.map((m) => <th key={m} className="whitespace-nowrap px-1 text-right">{label(m)}</th>)}
                </tr></thead>
                <tbody>
                  {influencers.map((i) => (
                    <tr key={i.deal_id} className="border-b border-zinc-100 align-top">
                      <td className="py-1.5 pr-2">{i.name}<div className="text-[10px] text-zinc-500">@{i.handle}</div></td>
                      {gi === 0 && showFollowers && <td className="whitespace-nowrap px-1 text-right tabular-nums">{fmtNum(i.followers)}</td>}
                      {gi === 0 && <td className="whitespace-nowrap px-1 text-right tabular-nums">{i.posts.length}</td>}
                      {gi === 0 && showCost && <td className="whitespace-nowrap px-1 text-right tabular-nums">{fmtInr(i.client_price)}</td>}
                      {group.map((m) => <td key={m} className="whitespace-nowrap px-1 text-right tabular-nums">{i.hasData ? value(m, i.m, i.client_price) : "–"}</td>)}
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr className="border-t-2 border-zinc-200 font-semibold">
                  <td className="py-1.5">Total</td>
                  {gi === 0 && showFollowers && <td />}
                  {gi === 0 && <td className="px-1 text-right">{allPosts.length}</td>}
                  {gi === 0 && showCost && <td className="whitespace-nowrap px-1 text-right tabular-nums">{fmtInr(totalCost)}</td>}
                  {group.map((m) => <td key={m} className="whitespace-nowrap px-1 text-right tabular-nums">{value(m, total, totalCost)}</td>)}
                </tr></tfoot>
              </table>
            ))}
            <Legend cols={cols} />
          </section>
        );
      })()}

      {has("post_detail") && allPosts.length > 0 && (() => {
        const cols = metrics.filter((m) => !m.startsWith("cost") && hasData(m, allPosts.filter((p) => p.snap).map((p) => ({ m: p.snap!, price: null }))));
        const groups = chunk(cols, MAX_COLS + 1);
        return (
          <section className="report-page p-[14mm]">
            <h2 className="mb-4 text-xl font-semibold" style={accent}>Post-by-post detail</h2>
            {influencers.filter((i) => i.posts.length).map((i) => (
              <div key={i.deal_id} className="mb-5 break-inside-avoid">
                <h3 className="font-semibold">{i.name} <span className="font-normal text-zinc-500">@{i.handle}</span></h3>
                {groups.map((group, gi) => (
                  <table key={gi} className="mt-1 w-full border-collapse text-[11px]">
                    <thead><tr className="border-b border-zinc-200 text-left text-[10px] text-zinc-500">
                      <th className="w-[22%] py-1">Post</th><th className="w-[16%]">Posted</th>
                      {group.map((m) => <th key={m} className="whitespace-nowrap px-1 text-right">{label(m)}</th>)}
                    </tr></thead>
                    <tbody>
                      {i.posts.map((p) => (
                        <tr key={p.post.post_id} className="border-b border-zinc-100">
                          <td className="py-1"><a href={p.post.url} className="underline">{p.post.format}</a></td>
                          <td className="whitespace-nowrap">{fmtDate(p.post.posted_at)}</td>
                          {group.map((m) => <td key={m} className="whitespace-nowrap px-1 text-right tabular-nums">{p.snap ? value(m, p.snap, null) : "–"}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ))}
              </div>
            ))}
            <Legend cols={cols} />
          </section>
        );
      })()}

      {has("screenshots") && (
        <section className="report-page p-[14mm]">
          <h2 className="mb-4 text-xl font-semibold" style={accent}>Insights screenshots</h2>
          {influencers.map((i) => {
            const shots = i.posts.flatMap((p) => (p.snap?.screenshot_paths ?? []).map((path) => data.screenshotUrls[path]).filter(Boolean));
            if (!shots.length) return null;
            return (
              <div key={i.deal_id} className="mb-5 break-inside-avoid">
                <h3 className="mb-2 font-semibold">{i.name} <span className="font-normal text-zinc-500">@{i.handle}</span></h3>
                <div className="grid grid-cols-4 gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {shots.map((u) => <img key={u} src={u} alt="" className="w-full rounded border border-zinc-200" />)}
                </div>
              </div>
            );
          })}
          {!influencers.some((i) => i.posts.some((p) => p.snap?.screenshot_paths.length)) && (
            <p className="text-sm text-zinc-500">No screenshots for the selected snapshot.</p>
          )}
        </section>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 p-3">
      <div className="text-[11px] text-zinc-500">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}
