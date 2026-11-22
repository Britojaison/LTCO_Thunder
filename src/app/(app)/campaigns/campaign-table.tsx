import Link from "next/link";
import type { listCampaigns } from "@/lib/services/campaigns";
import { StatusBadge } from "./status-badge";
import { dateIN, inr } from "@/lib/format";

type Row = Awaited<ReturnType<typeof listCampaigns>>[number];

export function CampaignTable({ campaigns, showBrand = true }: { campaigns: Row[]; showBrand?: boolean }) {
  const total = campaigns.reduce(
    (t, c) => ({ client: t.client + c.fin.cost_to_client, agency: t.agency + c.fin.cost_to_agency, profit: t.profit + c.fin.profit, n: t.n + c.fin.influencer_count, missing: t.missing + c.fin.missing_payout }),
    { client: 0, agency: 0, profit: 0, n: 0, missing: 0 },
  );
  const pct = total.client > 0 ? `${((total.profit / total.client) * 100).toFixed(1)}%` : "–";
  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
      <table className="w-full text-sm">
        <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs text-zinc-500">
          <tr>
            <th className="p-2">Campaign</th>
            {showBrand && <th className="p-2">Brand</th>}
            <th className="p-2">POC</th>
            <th className="p-2">Status</th>
            <th className="p-2">Dates</th>
            <th className="p-2 text-right">Influencers</th>
            <th className="p-2 text-right">Cost to client</th>
            <th className="p-2 text-right">Cost to agency</th>
            <th className="p-2 text-right">Profit</th>
            <th className="p-2 text-right">Profit %</th>
          </tr>
        </thead>
        <tbody>
          {campaigns.map((c) => (
            <tr key={c.id} className="border-b border-zinc-100">
              <td className="p-2"><Link href={`/campaigns/${c.id}`} className="font-medium hover:underline">{c.name}</Link></td>
              {showBrand && <td className="p-2 text-zinc-600"><Link href={`/brands/${c.brand_id}`} className="hover:underline">{c.brand}</Link></td>}
              <td className="whitespace-nowrap p-2 text-zinc-600">{c.poc ?? <span className="text-amber-700">Not set</span>}</td>
              <td className="p-2"><StatusBadge status={c.status} /></td>
              <td className="whitespace-nowrap p-2 text-zinc-600">{c.start_date ? `${dateIN(c.start_date)} – ${dateIN(c.end_date)}` : "–"}</td>
              <td className="p-2 text-right tabular-nums">{c.fin.influencer_count}</td>
              <td className="p-2 text-right tabular-nums">{inr(c.fin.cost_to_client)}</td>
              <td className="p-2 text-right tabular-nums">{inr(c.fin.cost_to_agency)}</td>
              {c.fin.influencer_count > 0 && c.fin.missing_payout === c.fin.influencer_count ? (
                <td colSpan={2} className="p-2 text-right text-xs text-amber-700">Payouts missing</td>
              ) : (
                <>
                  <td className={`p-2 text-right tabular-nums ${c.fin.profit < 0 ? "text-red-700" : ""}`}>
                    {inr(c.fin.profit)}
                    {c.fin.missing_payout > 0 && (
                      <div className="text-[11px] text-amber-700">partial · {c.fin.influencer_count - c.fin.missing_payout} of {c.fin.influencer_count} payouts</div>
                    )}
                  </td>
                  <td className="p-2 text-right tabular-nums">{c.fin.profit_pct === null ? "–" : `${c.fin.profit_pct}%`}</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
        {campaigns.length > 1 && (
          <tfoot className="bg-zinc-50 font-medium">
            <tr>
              <td className="p-2" colSpan={showBrand ? 5 : 4}>Total</td>
              <td className="p-2 text-right tabular-nums">{total.n}</td>
              <td className="p-2 text-right tabular-nums">{inr(total.client)}</td>
              <td className="p-2 text-right tabular-nums">{inr(total.agency)}</td>
              <td className={`p-2 text-right tabular-nums ${total.profit < 0 ? "text-red-700" : ""}`}>
                {inr(total.profit)}
                {total.missing > 0 && <div className="text-[11px] font-normal text-amber-700">partial · {total.missing} payout{total.missing > 1 ? "s" : ""} missing</div>}
              </td>
              <td className="p-2 text-right tabular-nums">{pct}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
