"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type { PreviousRow } from "@/lib/services/campaigns";
import { addFromPreviousAction } from "../../actions";
import { Badge, btnPrimary } from "@/components/ui";
import { compact, inr } from "@/lib/format";

/** Pick influencers from a previous campaign. Dropped ones are hidden unless asked for. */
export function PreviousPicker({ campaignId, sourceId, sourceName, rows, inCampaign }: {
  campaignId: string; sourceId: string; sourceName: string; rows: PreviousRow[]; inCampaign: string[];
}) {
  const already = new Set(inCampaign);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showDropped, setShowDropped] = useState(false);
  const [copy, setCopy] = useState(false);
  const [result, setResult] = useState<{ ok?: string; error?: string }>({});
  const [pending, start] = useTransition();

  const visible = rows.filter((r) => showDropped || !r.dropped);
  const hiddenDropped = rows.filter((r) => r.dropped).length;
  const isIn = (id: string) => already.has(id) || added.has(id);
  const selectable = visible.filter((r) => !isIn(r.influencer.id) && !r.influencer.is_blacklisted);
  const allOn = selectable.length > 0 && selectable.every((r) => selected.has(r.influencer.id));
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const add = (ids: string[]) => start(async () => {
    const res = await addFromPreviousAction(campaignId, ids, copy ? sourceId : null);
    setResult(res);
    if (res.ok) { setAdded((a) => new Set([...a, ...ids])); setSelected(new Set()); }
  });

  return (
    <div>
      <div className="sticky top-0 z-10 mb-2 flex flex-wrap items-center gap-3 rounded-lg border border-zinc-200 bg-white p-2 text-sm shadow-sm">
        <span className="px-1 text-zinc-600">{selected.size} selected</span>
        <button disabled={!selected.size || pending} onClick={() => add([...selected])} className={btnPrimary}>
          {pending ? "Adding…" : `Add ${selected.size || ""} to campaign`}
        </button>
        <label className="flex items-center gap-1.5 text-zinc-700" title="Copies cost to client, payout, product and deliverables. You can edit them on each deal.">
          <input type="checkbox" checked={copy} onChange={(e) => setCopy(e.target.checked)} />
          Copy price, payout and product from {sourceName}
        </label>
        {hiddenDropped > 0 && (
          <label className="flex items-center gap-1.5 text-zinc-500">
            <input type="checkbox" checked={showDropped} onChange={(e) => setShowDropped(e.target.checked)} /> Show {hiddenDropped} dropped
          </label>
        )}
        <Link href={`/campaigns/${campaignId}`} className="text-zinc-600 underline">Back to campaign</Link>
        {result.ok && <span className="text-emerald-700">{result.ok}</span>}
        {result.error && <span className="text-red-600">{result.error}</span>}
      </div>

      <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs text-zinc-500">
            <tr>
              <th className="w-8 p-2">
                <input type="checkbox" aria-label="Select all" checked={allOn} disabled={!selectable.length}
                  onChange={() => setSelected(allOn ? new Set() : new Set(selectable.map((r) => r.influencer.id)))} />
              </th>
              <th className="p-2">Influencer</th>
              <th className="p-2 text-right">Followers</th>
              <th className="p-2">Stage reached</th>
              <th className="p-2">Product</th>
              <th className="p-2 text-right">Cost to client</th>
              <th className="p-2 text-right">Payout</th>
              <th className="p-2 text-right">Views</th>
              <th className="p-2 text-right">Cost per view</th>
              <th className="p-2" />
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => {
              const id = r.influencer.id;
              const inIt = isIn(id);
              const blocked = r.influencer.is_blacklisted;
              const cpv = r.client_price && r.views ? Math.round((Number(r.client_price) / r.views) * 100) / 100 : null;
              return (
                <tr key={id} className={`border-b border-zinc-100 last:border-0 ${inIt ? "bg-emerald-50/40" : selected.has(id) ? "bg-zinc-50" : ""} ${r.dropped ? "text-zinc-400" : ""}`}>
                  <td className="p-2">
                    <input type="checkbox" aria-label={`Select ${r.influencer.name}`} disabled={inIt || blocked} checked={inIt || selected.has(id)} onChange={() => toggle(id)} />
                  </td>
                  <td className="p-2">
                    <Link href={`/influencers/${id}`} target="_blank" className="font-medium hover:underline">{r.influencer.name}</Link>
                    <div className="flex flex-wrap items-center gap-1 text-xs text-zinc-500">@{r.influencer.handle}{blocked && <Badge tone="red">Blacklisted</Badge>}</div>
                  </td>
                  <td className="p-2 text-right tabular-nums">{compact(r.influencer.followers)}</td>
                  <td className="p-2">{r.stage}</td>
                  <td className="p-2 text-zinc-600">{r.product ?? "–"}</td>
                  <td className="p-2 text-right tabular-nums">{inr(r.client_price)}</td>
                  <td className="p-2 text-right tabular-nums">{inr(r.payout)}</td>
                  <td className="p-2 text-right tabular-nums">{r.views === null ? "–" : compact(r.views)}</td>
                  <td className="p-2 text-right tabular-nums">{cpv === null ? "–" : `₹${cpv}`}</td>
                  <td className="p-2 text-right">
                    {inIt ? <Badge tone="green">In campaign</Badge> : blocked ? null : (
                      <button disabled={pending} onClick={() => add([id])} className="text-xs text-zinc-700 underline hover:text-zinc-900">Add</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
