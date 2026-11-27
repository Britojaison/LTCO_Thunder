"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type { SearchRow } from "@/lib/services/influencers";
import { addToCampaignAction } from "./actions";
import { Badge, btnPrimary, FitScore, inputCls } from "@/components/ui";
import { cap, compact, inr, pct } from "@/lib/format";

type Campaign = { id: string; name: string; brand: string };
const fitCell = "px-2 py-3 text-center tabular-nums";
const metricCell = "whitespace-nowrap px-3 py-3 text-right tabular-nums";

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
      <div data-gsap-enter className="glass-card glass-interactive mb-3 flex flex-wrap items-center gap-2 p-3 text-sm">
        <span className="px-1 text-zinc-600">{selected.size} selected</span>
        {campaigns.length ? (
          <>
            <select aria-label="Campaign" value={campaignId} onChange={(e) => setCampaignId(e.target.value)} className={`${inputCls} sm:w-auto sm:max-w-80`}>
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
              <span aria-hidden="true" className="mr-2 text-lg leading-none">+</span>{pending ? "Adding…" : "Add to campaign"}
            </button>
          </>
        ) : (
          <span className="text-zinc-400">Create a campaign to add influencers to it.</span>
        )}
        {result.ok && <span className="text-emerald-700">{result.ok}</span>}
        {result.error && <span className="text-red-600">{result.error}</span>}
      </div>

      <div className="glass-card overflow-x-auto">
        <table className="w-full min-w-[52rem] table-fixed text-sm">
          <thead className="border-b border-white/80 bg-white/45 text-left text-xs font-medium text-slate-500">
            <tr>
              <th className="w-10 px-2 py-3 text-center align-middle">
                <input type="checkbox" aria-label="Select all" checked={allOn}
                  onChange={() => setSelected(allOn ? new Set() : new Set(rows.map((r) => r.id)))} />
              </th>
              <th className={`w-16 ${fitCell}`}>Fit</th>
              <th className="w-[24%] p-2">Influencer</th>
              <th className="p-2">Location</th>
              <th className="p-2">Niches</th>
              <th className={metricCell}>Followers</th>
              <th className={`w-16 ${metricCell}`}>ER</th>
              <th className={metricCell}>Avg views</th>
              <th className={metricCell} title="Latest amount paid, or quoted rate if no deals yet">{cap(rateFormat)} rate</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr data-gsap-row key={r.id} className={`border-b border-white/70 transition-colors last:border-0 ${selected.has(r.id) ? "bg-orange-50/60" : "hover:bg-white/55"}`}>
                <td className="px-2 py-3 text-center"><input type="checkbox" aria-label={`Select ${r.name}`} checked={selected.has(r.id)} onChange={() => toggle(r.id)} /></td>
                <td className={fitCell}><FitScore score={r.fit_score} /></td>
                <td className="p-2">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-100 via-white to-sky-100 text-xs font-bold text-[#5b51c8] ring-1 ring-white shadow-sm">{r.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</span>
                    <div className="min-w-0">
                      <Link href={`/influencers/${r.id}`} className="font-medium hover:underline">{r.name}</Link>
                      <div className="flex flex-wrap items-center gap-1 text-xs text-zinc-500">
                        @{r.handle}
                        {r.worked_before && <Badge tone="green"><svg className="mr-1 h-3 w-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m3 8 3.2 3.2L13 4.8" /></svg>Worked with us</Badge>}
                        {r.is_blacklisted && <Badge tone="red">Blacklisted</Badge>}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="p-2 text-zinc-600">{[r.city, r.state].filter(Boolean).map(cap).join(", ") || "–"}</td>
                <td className="p-2 text-zinc-600">{r.niche_tags.slice(0, 3).map(cap).join(", ") || "–"}</td>
                <td className={metricCell}>{compact(r.followers)}</td>
                <td className={metricCell}>{pct(r.engagement_rate)}</td>
                <td className={metricCell}>{compact(r.avg_reel_views)}</td>
                <td className={metricCell}>{inr(rateOf(r))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
