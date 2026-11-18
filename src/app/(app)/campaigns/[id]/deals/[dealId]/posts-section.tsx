import { Card } from "@/components/ui";
import type { Post, Snapshot } from "@/lib/services/posts";
import { latestSnapshot } from "@/lib/services/posts";
import { METRIC_KEYS, METRIC_LABELS, derive, sumMetrics } from "@/lib/services/metrics";
import { cap, compact, dateIN } from "@/lib/format";
import { AddPostForm } from "./add-post-form";
import { SnapshotForm, DeletePostButton, DeleteSnapshotButton } from "./snapshot-form";

const POINTS = ["24h", "7d", "30d"] as const;
const n = (v: number | null | undefined) => (v === null || v === undefined ? "–" : compact(v));

function nextPoint(post: Post) {
  if (!post.posted_at) return "adhoc";
  const age = Date.now() - new Date(post.posted_at).getTime();
  const due = POINTS.filter((p) => age >= { "24h": 864e5, "7d": 7 * 864e5, "30d": 30 * 864e5 }[p] - 864e5);
  return due.find((p) => !post.snapshots.some((s) => s.snapshot_point === p)) ?? due.at(-1) ?? "24h";
}

export function PostsSection({ dealId, posts, clientPrice, payout, shotUrls }: {
  dealId: string; posts: Post[]; clientPrice: number | null; payout: number | null; shotUrls: Record<string, string>;
}) {
  const latest = posts.map(latestSnapshot).filter(Boolean) as Snapshot[];
  const total = sumMetrics(latest);
  const forClient = derive(total, clientPrice);
  const internal = derive(total, payout);

  return (
    <Card title={`Posts and metrics (${posts.length})`}>
      {latest.length > 0 && (
        <div className="mb-4 rounded-lg bg-zinc-50 p-3">
          <p className="mb-2 text-xs font-medium text-zinc-600">This influencer, latest numbers across all posts</p>
          <dl className="grid grid-cols-3 gap-2 text-sm sm:grid-cols-6">
            {(["views", "likes", "comments", "shares", "saves", "reach"] as const).map((k) => (
              <div key={k}><dt className="text-[11px] text-zinc-500">{METRIC_LABELS[k]}</dt><dd className="font-semibold tabular-nums">{n(total[k])}</dd></div>
            ))}
          </dl>
          <dl className="mt-2 grid grid-cols-2 gap-2 border-t border-zinc-200 pt-2 text-sm sm:grid-cols-4">
            <div><dt className="text-[11px] text-zinc-500">Engagement rate</dt><dd className="font-semibold">{forClient.engagementRate === null ? "–" : `${forClient.engagementRate}%`}<span className="text-[11px] font-normal text-zinc-400"> of {forClient.erBase}</span></dd></div>
            <div><dt className="text-[11px] text-zinc-500">Cost per view (client)</dt><dd className="font-semibold">{forClient.costPerView === null ? "–" : `₹${forClient.costPerView}`}</dd></div>
            <div><dt className="text-[11px] text-zinc-500">Cost per engagement (client)</dt><dd className="font-semibold">{forClient.costPerEngagement === null ? "–" : `₹${forClient.costPerEngagement}`}</dd></div>
            <div><dt className="text-[11px] text-zinc-500">Cost per view (our payout)</dt><dd className="font-semibold">{internal.costPerView === null ? "–" : `₹${internal.costPerView}`}</dd></div>
          </dl>
        </div>
      )}

      <div className="space-y-4">
        {posts.map((p) => {
          const byPoint = Object.fromEntries(p.snapshots.filter((s) => s.snapshot_point !== "adhoc").map((s) => [s.snapshot_point, s]));
          const adhoc = p.snapshots.filter((s) => s.snapshot_point === "adhoc").at(-1);
          const cols = [...POINTS.map((pt) => ({ label: pt, s: byPoint[pt] as Snapshot | undefined })), ...(adhoc ? [{ label: "Latest", s: adhoc }] : [])];
          const shots = p.snapshots.flatMap((s) => s.screenshot_paths ?? []);
          return (
            <article key={p.id} className="rounded-lg border border-zinc-200 p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="min-w-0">
                  <a href={p.url} target="_blank" rel="noreferrer" className="break-all text-sm font-medium text-blue-700 hover:underline">{p.url.replace(/^https?:\/\/(www\.)?/, "")}</a>
                  <p className="text-xs text-zinc-500">{cap(p.format)} · {p.posted_at ? `posted ${dateIN(p.posted_at)}` : "posting date not set"}</p>
                </div>
                <DeletePostButton postId={p.id} />
              </div>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-left text-zinc-500">
                    <tr><th className="py-1 pr-2 font-normal" />{cols.map((c) => <th key={c.label} className="px-2 py-1 text-right font-medium">{c.label}</th>)}</tr>
                  </thead>
                  <tbody>
                    {METRIC_KEYS.map((k) => (
                      <tr key={k} className="border-t border-zinc-100">
                        <td className="py-1 pr-2 text-zinc-500">{METRIC_LABELS[k]}</td>
                        {cols.map((c) => <td key={c.label} className="px-2 py-1 text-right tabular-nums">{c.s ? n(c.s[k]) : <span className="text-zinc-300">–</span>}</td>)}
                      </tr>
                    ))}
                    <tr className="border-t border-zinc-200">
                      <td className="py-1 pr-2 text-zinc-500">Engagement rate</td>
                      {cols.map((c) => {
                        const d = c.s ? derive(c.s, null) : null;
                        return <td key={c.label} className="px-2 py-1 text-right tabular-nums">{d?.engagementRate !== null && d?.engagementRate !== undefined ? `${d.engagementRate}%` : "–"}</td>;
                      })}
                    </tr>
                    <tr>
                      <td className="py-1 pr-2 text-zinc-400" />
                      {cols.map((c) => (
                        <td key={c.label} className="px-2 py-1 text-right text-zinc-400">
                          {c.s ? <span className="inline-flex items-center gap-1">{dateIN(c.s.captured_at)} <DeleteSnapshotButton snapshotId={c.s.id} /></span> : ""}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
              {shots.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {shots.map((path) => shotUrls[path] && (
                    <a key={path} href={shotUrls[path]} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={shotUrls[path]} alt="Insights screenshot" className="h-16 w-16 rounded border border-zinc-200 object-cover" />
                    </a>
                  ))}
                </div>
              )}
              <SnapshotForm
                postId={p.id}
                defaultPoint={nextPoint(p)}
                existing={p.snapshots.map((s) => ({ ...(Object.fromEntries(METRIC_KEYS.map((k) => [k, s[k] ?? null])) as Record<string, number | null>), id: s.id, snapshot_point: s.snapshot_point }))}
              />
            </article>
          );
        })}
      </div>

      <div className="mt-4"><AddPostForm dealId={dealId} startOpen={posts.length === 0} /></div>
    </Card>
  );
}
