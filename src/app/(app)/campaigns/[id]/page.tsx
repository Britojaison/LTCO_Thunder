import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import { getCampaign, campaignOverview } from "@/lib/services/campaigns";
import { signedUrls } from "@/lib/services/storage";
import { ServiceError } from "@/lib/services/errors";
import { btnPrimary, btnSecondary, Card, inputCls } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { MoneyCards } from "@/components/money";
import { cap, compact, dateIN, inr } from "@/lib/format";
import { StatusBadge } from "../status-badge";
import { CampaignTabs } from "../campaign-tabs";
import { QuickAdd } from "../quick-add";
import { deleteCampaignAction, setStatusAction } from "../actions";

export const metadata = { title: "Campaign" };

export default function CampaignPage({ params }: PageProps<"/campaigns/[id]">) {
  return <Suspense fallback={<p className="text-sm text-zinc-400">Loading…</p>}><Overview params={params} /></Suspense>;
}

async function Overview({ params }: { params: PageProps<"/campaigns/[id]">["params"] }) {
  const { id } = await params;
  const { db, workspace } = await requireWorkspace();
  const campaign = await getCampaign(db, workspace.id, id).catch((e) => {
    if (e instanceof ServiceError && e.code === "not_found") notFound();
    throw e;
  });
  const [ov, urls] = await Promise.all([campaignOverview(db, workspace.id, id), signedUrls(db, [campaign.brand?.logo_path])]);
  const logo = campaign.brand?.logo_path ? urls[campaign.brand.logo_path] : undefined;
  const findHref = `/influencers?competitor_brand_id=${campaign.brand_id}&competitor_days=90`;

  return (
    <section className="space-y-4">
      <Link href="/campaigns" className="text-sm text-zinc-500 hover:underline">← Campaigns</Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          {logo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt="" className="h-12 w-12 rounded-md border border-zinc-200 object-contain" />
          )}
          <div>
            <Link href={`/brands/${campaign.brand_id}`} className="text-sm text-zinc-500 hover:underline">{campaign.brand?.name}</Link>
            <h1 className="flex items-center gap-2 text-2xl font-semibold">{campaign.name} <StatusBadge status={campaign.status} /></h1>
            <p className="text-sm text-zinc-500">{campaign.start_date ? `${dateIN(campaign.start_date)} – ${dateIN(campaign.end_date)}` : "No dates set"}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <form action={setStatusAction.bind(null, id)} className="flex gap-1">
            <select name="status" defaultValue={campaign.status} className={`${inputCls} w-auto py-1.5`}>
              <option value="planning">Planning</option><option value="live">Live</option>
              <option value="completed">Completed</option><option value="archived">Archived</option>
            </select>
            <button className={btnSecondary}>Update</button>
          </form>
          <Link href={`/campaigns/${id}/add`} className={btnPrimary}>Add influencers</Link>
          <Link href={`/campaigns/${id}/edit`} className={btnSecondary}>Edit</Link>
          <ConfirmButton label="Delete" confirmText="Delete this campaign?" action={deleteCampaignAction.bind(null, id)} />
        </div>
      </div>

      <CampaignTabs id={id} active="overview" />
      <QuickAdd campaignId={id} defaultOpen={ov.deals.length === 0} />

      <MoneyCards fin={ov.fin} />

      <Card title="Influencers by stage">
        <div className="flex flex-wrap gap-2">
          {ov.stages.map((s) => (
            <div key={s.id} className={`rounded-lg border px-3 py-2 text-center ${s.count ? "border-zinc-300 bg-white" : "border-zinc-100 bg-zinc-50 text-zinc-400"}`}>
              <div className="text-lg font-semibold tabular-nums">{s.count}</div>
              <div className="text-xs">{s.name}</div>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Influencers" className="lg:col-span-2">
          {ov.deals.length === 0 ? (
            <p className="text-sm text-zinc-500">
              No influencers yet. <Link href={`/campaigns/${id}/add`} className="underline">Add influencers from your databank</Link>, or use the full <Link href={findHref} className="underline">influencer search</Link>.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-zinc-500">
                  <tr><th className="py-1">Influencer</th><th>Stage</th><th className="text-right">Cost to client</th><th className="text-right">Cost to agency</th><th className="text-right">Profit</th><th className="text-right">Profit %</th></tr>
                </thead>
                <tbody>
                  {ov.deals.map((d) => (
                    <tr key={d.id} className={`border-t border-zinc-100 ${d.dropped ? "text-zinc-400 line-through" : ""}`}>
                      <td className="py-1.5">
                        <Link href={`/campaigns/${id}/deals/${d.id}`} className="font-medium text-blue-700 underline decoration-blue-200 underline-offset-2 hover:decoration-blue-700">{d.influencer?.name ?? "–"}</Link>
                        <span className="ml-1 text-xs text-zinc-400">{d.influencer ? `@${d.influencer.handle} · ${compact(d.influencer.followers)}` : ""}</span>
                      </td>
                      <td>{d.stage}</td>
                      {d.client_price === null && d.payout === null ? (
                        <td colSpan={2} className="text-right">
                          <Link href={`/campaigns/${id}/deals/${d.id}`} className="text-xs font-medium text-blue-700 hover:underline">Set price →</Link>
                        </td>
                      ) : (
                        <>
                          <td className="text-right tabular-nums">{inr(d.client_price)}</td>
                          <td className="text-right tabular-nums">{inr(d.payout)}</td>
                        </>
                      )}
                      <td className="text-right tabular-nums">{inr(d.margin)}</td>
                      <td className="text-right tabular-nums">{d.margin_pct === null ? "–" : `${d.margin_pct}%`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-zinc-400">Click an influencer’s name to open their deal: price, payout, contract, contact log and payment. Use the Pipeline tab to move them through stages.</p>
            </div>
          )}
        </Card>
        <Card title="Details">
          <dl className="space-y-2 text-sm">
            <div><dt className="text-xs text-zinc-500">Objective</dt><dd>{campaign.objective || "–"}</dd></div>
            <div>
              <dt className="text-xs text-zinc-500">Deliverables required</dt>
              <dd>{campaign.deliverables.length ? campaign.deliverables.map((d) => `${d.count} ${cap(d.format)}${d.count > 1 ? "s" : ""}`).join(", ") : "–"}</dd>
            </div>
            <div><dt className="text-xs text-zinc-500">Brief</dt><dd className="whitespace-pre-line">{campaign.brief || "–"}</dd></div>
          </dl>
        </Card>
      </div>
    </section>
  );
}
