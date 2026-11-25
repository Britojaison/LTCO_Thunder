"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type { SearchRow } from "@/lib/services/influencers";
import { addToCampaignAction } from "./actions";
import { Badge, btnPrimary, FitScore, inputCls } from "@/components/ui";
import { cap, compact, inr, pct } from "@/lib/format";

type Campaign = { id: string; name: string; brand: string };

export function ResultsTable({ rows, campaigns, rateFormat }: { rows: SearchRow[]; campaigns: Campaign[]; rateFormat: string }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [campaignId, setCampaignId] = useState(campaigns[0]?.id ?? "");
  const [result, setResult] = useState<{ ok?: string; error?: string }>({});
  const [pending, start] = useTransition();

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  const allOn = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const rateOf = (r: SearchRow) =>
    ({ story: r.rate_story, carousel: r.rate_carousel, collab: r.rate_collab } as Record<string, number | null>)[rateFormat] ?? r.rate_reel;

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2 rounded-2xl border border-[#eceef2] bg-white p-3 text-sm shadow-[0_2px_12px_rgba(24,25,28,0.035)]">
        <span className="px-1 text-zinc-600">{selected.size} selected</span>
        {campaigns.length ? (
          <>
            <select value={campaignId} onChange={(e) => setCampaignId(e.target.value)} className={`${inputCls} w-auto`}>
              {campaigns.map((c) => <option key={c.id} value={c.id}>{c.brand ? `${c.brand} · ` : ""}{c.name}</option>)}
            </select>
            <button
              disabled={!selected.size || pending}
              className={btnPrimary}
              onClick={() =>
                start(async () => {
                  const res = await addToCampaignAction(campaignId, [...selected]);
                  setResult(res);
                  if (res.ok) setSelected(new Set());
                })
              }
            >
              <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l10-6.5-10-6.5Z" /></svg>{pending ? "Adding…" : "Add to campaign"}
            </button>
          </>
        ) : (
          <span className="text-zinc-400">Create a campaign to add influencers to it.</span>
        )}
        {result.ok && <span className="text-emerald-700">{result.ok}</span>}
        {result.error && <span className="text-red-600">{result.error}</span>}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-[#eceef2] bg-white shadow-[0_2px_12px_rgba(24,25,28,0.035)]">
        <table className="w-full table-fixed text-sm">
          <thead className="border-b border-[#e5e7eb] bg-[#f8f9fb] text-left text-xs font-medium text-slate-500">
            <tr>
              <th className="w-8 p-2 align-middle">
                <input type="checkbox" aria-label="Select all" checked={allOn}
                  onChange={() => setSelected(allOn ? new Set() : new Set(rows.map((r) => r.id)))} />
              </th>
              <th className="p-2 text-center">Fit</th>
              <th className="w-[22%] p-2">Influencer</th>
              <th className="p-2">Location</th>
              <th className="p-2">Niches</th>
              <th className="p-2 text-right tabular-nums">Followers</th>
              <th className="p-2 text-right tabular-nums">ER</th>
              <th className="p-2 text-right tabular-nums">Avg views</th>
              <th className="p-2 text-right tabular-nums" title="Latest amount paid, or quoted rate if no deals yet">{cap(rateFormat)} rate</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={`border-b border-zinc-100 last:border-0 ${selected.has(r.id) ? "bg-orange-50/60" : "hover:bg-zinc-50/70"}`}>
                <td className="p-2"><input type="checkbox" aria-label={`Select ${r.name}`} checked={selected.has(r.id)} onChange={() => toggle(r.id)} /></td>
                <td className="p-2 text-center"><FitScore score={r.fit_score} /></td>
                <td className="p-2">
                  <Link href={`/influencers/${r.id}`} className="font-medium hover:underline">{r.name}</Link>
                  <div className="flex flex-wrap items-center gap-1 text-xs text-zinc-500">
                    @{r.handle}
                    {r.worked_before && <Badge tone="green"><svg className="mr-1 h-3 w-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m3 8 3.2 3.2L13 4.8" /></svg>Worked with us</Badge>}
                    {r.is_blacklisted && <Badge tone="red">Blacklisted</Badge>}
                  </div>
                </td>
                <td className="p-2 text-zinc-600">{[r.city, r.state].filter(Boolean).map(cap).join(", ") || "–"}</td>
                <td className="p-2 text-zinc-600">{r.niche_tags.slice(0, 3).map(cap).join(", ") || "–"}</td>
                <td className="p-2 text-right tabular-nums">{compact(r.followers)}</td>
                <td className="p-2 text-right tabular-nums">{pct(r.engagement_rate)}</td>
                <td className="p-2 text-right tabular-nums">{compact(r.avg_reel_views)}</td>
                <td className="p-2 text-right tabular-nums">{inr(rateOf(r))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
