import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import { getCampaign } from "@/lib/services/campaigns";
import { listDeals, listStages, listMembers, brandProducts } from "@/lib/services/deals";
import { ProductCell } from "./product-cell";
import { ServiceError } from "@/lib/services/errors";
import { Badge, btnPrimary, btnSecondary, Card, inputCls } from "@/components/ui";
import { compact, dateIN, inr } from "@/lib/format";
import { CampaignTabs } from "../../campaign-tabs";
import { StatusBadge } from "../../status-badge";

export const metadata = { title: "Campaign table" };

const PAY_TONE = { pending: "amber", partly_paid: "amber", paid: "green" } as const;

export default function DealsTablePage({ params, searchParams }: PageProps<"/campaigns/[id]/deals">) {
  return <Suspense fallback={<p className="text-sm text-zinc-400">Loading…</p>}><Table params={params} searchParams={searchParams} /></Suspense>;
}

async function Table({ params, searchParams }: { params: PageProps<"/campaigns/[id]/deals">["params"]; searchParams: PageProps<"/campaigns/[id]/deals">["searchParams"] }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const { db, workspace } = await requireWorkspace();
  const campaign = await getCampaign(db, workspace.id, id).catch((e) => {
    if (e instanceof ServiceError && e.code === "not_found") notFound();
    throw e;
  });
  const f = { stage: str(sp.stage), owner: str(sp.owner), payment: str(sp.payment) };
  const [stages, members, deals, products] = await Promise.all([
    listStages(db, workspace.id), listMembers(db, workspace.id), listDeals(db, workspace.id, id, f), brandProducts(db, workspace.id, campaign.brand_id),
  ]);
  const stageName = new Map(stages.map((s) => [s.id, s.name]));
  const query = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][]).toString();
  const totals = deals.reduce((t, d) => ({ c: t.c + (d.client_price ?? 0), p: t.p + (d.payout ?? 0) }), { c: 0, p: 0 });

  return (
    <section className="space-y-4">
      <div>
        <Link href={`/brands/${campaign.brand_id}`} className="text-sm text-zinc-500 hover:underline">{campaign.brand?.name}</Link>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">{campaign.name} <StatusBadge status={campaign.status} /></h1>
      </div>
      <CampaignTabs id={id} active="table" />

      <form method="get" className="flex flex-wrap items-end gap-2">
        <select name="stage" defaultValue={f.stage ?? ""} className={`${inputCls} w-auto`}>
          <option value="">All stages</option>
          {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select name="owner" defaultValue={f.owner ?? ""} className={`${inputCls} w-auto`}>
          <option value="">All owners</option>
          {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.full_name || m.email}</option>)}
        </select>
        <select name="payment" defaultValue={f.payment ?? ""} className={`${inputCls} w-auto`}>
          <option value="">Any payment status</option>
          <option value="pending">Pending</option><option value="partly_paid">Partly paid</option><option value="paid">Paid</option>
        </select>
        <button className={btnSecondary}>Filter</button>
        <a href={`/campaigns/${id}/deals/export${query ? `?${query}` : ""}`} className={btnPrimary}>Export CSV</a>
      </form>

      <datalist id="table-products">{products.map((p) => <option key={p} value={p} />)}</datalist>
      {deals.length === 0 ? <Card><p className="text-sm text-zinc-600">No influencers match.</p></Card> : (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs text-zinc-500">
              <tr>
                <th className="p-2">Influencer</th><th className="p-2">Product</th><th className="p-2">Stage</th><th className="p-2">Owner</th><th className="p-2">Deliverables</th>
                <th className="p-2 text-right">Cost to client</th><th className="p-2 text-right">Cost to agency</th><th className="p-2 text-right">Profit</th>
                <th className="p-2 text-right">Profit %</th><th className="p-2">Posting</th><th className="p-2">Payment</th>
              </tr>
            </thead>
            <tbody>
              {deals.map((d) => (
                <tr key={d.id} className="border-b border-zinc-100">
                  <td className="p-2">
                    <Link href={`/campaigns/${id}/deals/${d.id}`} className="font-medium text-blue-700 underline decoration-blue-200 underline-offset-2 hover:decoration-blue-700">{d.influencer?.name}</Link>
                    <div className="text-xs text-zinc-500">@{d.influencer?.handle} · {compact(d.influencer?.followers)}</div>
                  </td>
                  <td className="p-2"><ProductCell dealId={d.id} value={d.product} listId="table-products" /></td>
                  <td className="p-2">{stageName.get(d.stage_id ?? "") ?? "–"}</td>
                  <td className="p-2 text-zinc-600">{d.owner?.full_name || d.owner?.email || "–"}</td>
                  <td className="p-2 text-zinc-600">{d.deliverables.map((x) => `${x.count} ${x.format}`).join(", ") || "–"}</td>
                  <td className="p-2 text-right tabular-nums">{inr(d.client_price)}</td>
                  <td className="p-2 text-right tabular-nums">{inr(d.payout)}</td>
                  <td className={`p-2 text-right tabular-nums ${(d.margin ?? 0) < 0 ? "text-red-700" : ""}`}>{d.payout === null ? <span className="text-xs text-amber-700">No payout</span> : inr(d.margin)}</td>
                  <td className="p-2 text-right tabular-nums">{d.margin_pct === null ? "–" : `${d.margin_pct}%`}</td>
                  <td className="whitespace-nowrap p-2 text-zinc-600">{dateIN(d.posting_date)}</td>
                  <td className="p-2"><Badge tone={PAY_TONE[d.payment_status as keyof typeof PAY_TONE] ?? "zinc"}>{d.payment_status.replace("_", " ")}</Badge></td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-zinc-50 font-medium">
              <tr>
                <td className="p-2" colSpan={5}>Total ({deals.length})</td>
                <td className="p-2 text-right tabular-nums">{inr(totals.c)}</td>
                <td className="p-2 text-right tabular-nums">{inr(totals.p)}</td>
                <td className="p-2 text-right tabular-nums">{inr(totals.c - totals.p)}</td>
                <td className="p-2 text-right tabular-nums">{totals.c > 0 ? `${(((totals.c - totals.p) / totals.c) * 100).toFixed(1)}%` : "–"}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <p className="text-xs text-zinc-500">Totals here include every listed row (Dropped too). The campaign overview excludes Dropped. The export is internal and includes payouts.</p>
    </section>
  );
}

const str = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);
