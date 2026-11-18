"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type { SearchRow } from "@/lib/services/influencers";
import { addToThisCampaignAction } from "../../actions";
import { Badge, btnPrimary, FitScore } from "@/components/ui";
import { cap, compact, inr, pct } from "@/lib/format";

export function CampaignPicker({ campaignId, rows, inCampaign }: { campaignId: string; rows: SearchRow[]; inCampaign: string[] }) {
  const already = new Set(inCampaign);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<{ ok?: string; error?: string }>({});
  const [pending, start] = useTransition();
  const selectable = rows.filter((r) => !already.has(r.id) && !added.has(r.id));
  const allOn = selectable.length > 0 && selectable.every((r) => selected.has(r.id));
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const add = (ids: string[]) =>
    start(async () => {
      const res = await addToThisCampaignAction(campaignId, ids);
      setResult(res);
      if (res.ok) {
        setAdded((a) => new Set([...a, ...ids]));
        setSelected(new Set());
      }
    });

  return (
    <div>
      <div className="sticky top-0 z-10 mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-zinc-200 bg-white p-2 text-sm shadow-sm">
        <span className="px-1 text-zinc-600">{selected.size} selected</span>
        <button disabled={!selected.size || pending} onClick={() => add([...selected])} className={btnPrimary}>
          {pending ? "Adding…" : `Add ${selected.size || ""} to campaign`}
        </button>
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
                  onChange={() => setSelected(allOn ? new Set() : new Set(selectable.map((r) => r.id)))} />
              </th>
              <th className="p-2">Fit</th><th className="p-2">Influencer</th><th className="p-2">Location</th><th className="p-2">Niches</th>
              <th className="p-2 text-right">Followers</th><th className="p-2 text-right">ER</th><th className="p-2 text-right" title="Average of real deals, or quoted rate if none yet">Avg reel rate</th><th className="p-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const inIt = already.has(r.id) || added.has(r.id);
              return (
                <tr key={r.id} className={`border-b border-zinc-100 last:border-0 ${inIt ? "bg-emerald-50/40" : selected.has(r.id) ? "bg-zinc-50" : ""}`}>
                  <td className="p-2">
                    <input type="checkbox" aria-label={`Select ${r.name}`} disabled={inIt} checked={inIt || selected.has(r.id)} onChange={() => toggle(r.id)} />
                  </td>
                  <td className="p-2"><FitScore score={r.fit_score} /></td>
                  <td className="p-2">
                    <Link href={`/influencers/${r.id}`} target="_blank" className="font-medium hover:underline">{r.name}</Link>
                    <div className="flex flex-wrap items-center gap-1 text-xs text-zinc-500">
                      @{r.handle}{r.worked_before && <Badge tone="green">Worked with us</Badge>}{r.is_blacklisted && <Badge tone="red">Blacklisted</Badge>}
                    </div>
                  </td>
                  <td className="p-2 text-zinc-600">{[r.city, r.state].filter(Boolean).map(cap).join(", ") || "–"}</td>
                  <td className="p-2 text-zinc-600">{r.niche_tags.slice(0, 3).map(cap).join(", ") || "–"}</td>
                  <td className="p-2 text-right tabular-nums">{compact(r.followers)}</td>
                  <td className="p-2 text-right tabular-nums">{pct(r.engagement_rate)}</td>
                  <td className="p-2 text-right tabular-nums">{inr(r.rate_reel)}</td>
                  <td className="p-2 text-right">
                    {inIt ? <Badge tone="green">In campaign</Badge> : (
                      <button disabled={pending} onClick={() => add([r.id])} className="text-xs text-zinc-700 underline hover:text-zinc-900">Add</button>
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
