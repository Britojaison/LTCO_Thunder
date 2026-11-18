import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import { getCampaign } from "@/lib/services/campaigns";
import { campaignPerformance, listDueSnapshots } from "@/lib/services/posts";
import { derive, sumMetrics, type Metrics } from "@/lib/services/metrics";
import { ServiceError } from "@/lib/services/errors";
import { Card } from "@/components/ui";
import { DueSnapshots } from "@/components/due-snapshots";
import { compact, inr } from "@/lib/format";
import { CampaignTabs } from "../../campaign-tabs";
import { StatusBadge } from "../../status-badge";

export const metadata = { title: "Performance" };

export default function PerformancePage({ params, searchParams }: PageProps<"/campaigns/[id]/performance">) {
  return <Suspense fallback={<p className="text-sm text-zinc-400">Loading…</p>}><Perf params={params} searchParams={searchParams} /></Suspense>;
}

const n = (v: number | null | undefined) => (v === null || v === undefined ? "–" : compact(v));
const money2 = (v: number | null) => (v === null ? "–" : `₹${v}`);

async function Perf({ params, searchParams }: { params: PageProps<"/campaigns/[id]/performance">["params"]; searchParams: PageProps<"/campaigns/[id]/performance">["searchParams"] }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const basis = sp.basis === "payout" ? "payout" : "client";
  const { db, workspace } = await requireWorkspace();
  const campaign = await getCampaign(db, workspace.id, id).catch((e) => {
    if (e instanceof ServiceError && e.code === "not_found") notFound();
    throw e;
  });
  const [rows, due] = await Promise.all([campaignPerformance(db, workspace.id, id), listDueSnapshots(db, workspace.id, { campaignId: id })]);

  const lines = rows.map(({ deal, posts }) => {
    const m = sumMetrics(posts.map((p) => p.latest).filter(Boolean) as Metrics[]);
    const price = basis === "payout" ? deal.payout : deal.client_price;
    return { deal, posts, m, d: derive(m, price), price };
  });
  const withData = lines.filter((l) => l.posts.some((p) => p.latest));
  const total = sumMetrics(withData.map((l) => l.m));
  const totalPrice = withData.reduce((t, l) => t + (l.price ?? 0), 0);
  const td = derive(total, totalPrice || null);
  const cols = ["views", "likes", "comments", "shares", "saves", "reposts", "reach"] as const;

  return (
    <section className="space-y-4">
      <div>
        <Link href={`/brands/${campaign.brand_id}`} className="text-sm text-zinc-500 hover:underline">{campaign.brand?.name}</Link>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">{campaign.name} <StatusBadge status={campaign.status} /></h1>
      </div>
      <CampaignTabs id={id} active="performance" />

      <dl className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {[
          ["Views", n(total.views)], ["Engagements", n(td.engagements)], ["Reach", n(total.reach)],
          ["Engagement rate", td.engagementRate === null ? "–" : `${td.engagementRate}%`],
          [`Cost per view (${basis === "payout" ? "payout" : "client"})`, money2(td.costPerView)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-zinc-200 bg-white p-4">
            <dt className="text-xs text-zinc-500">{label}</dt><dd className="mt-1 text-2xl font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="flex items-center gap-2 text-xs">
        <span className="text-zinc-500">Costs based on:</span>
        <Link href={`/campaigns/${id}/performance`} className={`rounded-md px-2 py-1 ${basis === "client" ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-200"}`}>Cost to client</Link>
        <Link href={`/campaigns/${id}/performance?basis=payout`} className={`rounded-md px-2 py-1 ${basis === "payout" ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-200"}`}>Our payout (internal)</Link>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs text-zinc-500">
              <tr>
                <th className="p-2">Influencer</th><th className="p-2 text-right">Posts</th>
                {cols.map((c) => <th key={c} className="p-2 text-right capitalize">{c}</th>)}
                <th className="p-2 text-right">ER</th><th className="p-2 text-right">₹/view</th><th className="p-2 text-right">₹/engagement</th>
              </tr>
            </thead>
            <tbody>
              {lines.map(({ deal, posts, m, d, price }) => (
                <tr key={deal.id} className="border-b border-zinc-100">
                  <td className="p-2">
                    <Link href={`/campaigns/${id}/deals/${deal.id}`} className="font-medium text-blue-700 hover:underline">{deal.influencer?.name}</Link>
                    <div className="text-xs text-zinc-500">{price !== null ? inr(price) : "no price"}</div>
                  </td>
                  <td className="p-2 text-right tabular-nums">{posts.length || <span className="text-zinc-300">0</span>}</td>
                  {cols.map((c) => <td key={c} className="p-2 text-right tabular-nums">{n(m[c])}</td>)}
                  <td className="p-2 text-right tabular-nums">{d.engagementRate === null ? "–" : `${d.engagementRate}%`}</td>
                  <td className="p-2 text-right tabular-nums">{money2(d.costPerView)}</td>
                  <td className="p-2 text-right tabular-nums">{money2(d.costPerEngagement)}</td>
                </tr>
              ))}
            </tbody>
            {withData.length > 0 && (
              <tfoot className="bg-zinc-50 font-medium">
                <tr>
                  <td className="p-2">Total ({withData.length} with data)</td>
                  <td className="p-2 text-right tabular-nums">{lines.reduce((t, l) => t + l.posts.length, 0)}</td>
                  {cols.map((c) => <td key={c} className="p-2 text-right tabular-nums">{n(total[c])}</td>)}
                  <td className="p-2 text-right tabular-nums">{td.engagementRate === null ? "–" : `${td.engagementRate}%`}</td>
                  <td className="p-2 text-right tabular-nums">{money2(td.costPerView)}</td>
                  <td className="p-2 text-right tabular-nums">{money2(td.costPerEngagement)}</td>
                </tr>
              </tfoot>
            )}
          </table>
          {lines.length === 0 && <p className="p-3 text-sm text-zinc-500">No influencers in this campaign yet.</p>}
        </div>
        <DueSnapshots rows={due} showCampaign={false} />
      </div>
      <Card>
        <p className="text-xs text-zinc-500">
          Uses each post’s latest snapshot. Engagements = likes + comments + shares + saves + reposts. Engagement rate is per reach, or per views when reach
          isn’t entered. Totals and costs only count influencers who have numbers.
        </p>
      </Card>
    </section>
  );
}
