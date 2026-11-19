"use client";

import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";
import type { DealRow } from "@/lib/services/deals";
import { moveDealAction } from "../../deal-actions";
import { compact, inr, dateIN } from "@/lib/format";

type Stage = { id: string; name: string; kind: "open" | "done" | "dropped" };

const initials = (o: DealRow["owner"]) =>
  (o?.full_name || o?.email || "?").split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");

export function Board({ campaignId, stages, deals }: { campaignId: string; stages: Stage[]; deals: DealRow[] }) {
  const [optimistic, applyMove] = useOptimistic(deals, (state, m: { id: string; stage: string }) =>
    state.map((d) => (d.id === m.id ? { ...d, stage_id: m.stage } : d)),
  );
  const [error, setError] = useState<string>();
  const [dragging, setDragging] = useState<string>();
  const [over, setOver] = useState<string>();
  const [, start] = useTransition();

  const move = (id: string, stage: string) => {
    const deal = optimistic.find((d) => d.id === id);
    if (!deal || deal.stage_id === stage) return;
    start(async () => {
      applyMove({ id, stage });
      const res = await moveDealAction(id, stage);
      setError(res.error);
    });
  };

  return (
    <div>
      {error && <p className="mb-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="flex gap-3 overflow-x-auto pb-4">
        {stages.map((s) => {
          const cards = optimistic.filter((d) => d.stage_id === s.id);
          const total = cards.reduce((t, d) => t + (d.payout ?? 0), 0);
          return (
            <section
              key={s.id}
              onDragOver={(e) => { e.preventDefault(); setOver(s.id); }}
              onDragLeave={() => setOver((o) => (o === s.id ? undefined : o))}
              onDrop={(e) => { e.preventDefault(); setOver(undefined); const id = e.dataTransfer.getData("text/plain"); if (id) move(id, s.id); }}
              className={`flex w-64 shrink-0 flex-col rounded-xl border p-2 transition-colors ${
                over === s.id ? "border-zinc-900 bg-zinc-100" : s.kind === "dropped" ? "border-zinc-200 bg-zinc-50/60" : "border-zinc-200 bg-zinc-50"
              }`}
            >
              <header className="mb-2 flex items-baseline justify-between px-1">
                <h3 className="text-sm font-semibold">{s.name} <span className="font-normal text-zinc-400">{cards.length}</span></h3>
                {total > 0 && <span className="text-xs text-zinc-500">{inr(total)}</span>}
              </header>
              <div className="flex min-h-16 flex-col gap-2">
                {cards.map((d) => (
                  <article
                    key={d.id}
                    draggable
                    onDragStart={(e) => { e.dataTransfer.setData("text/plain", d.id); e.dataTransfer.effectAllowed = "move"; setDragging(d.id); }}
                    onDragEnd={() => setDragging(undefined)}
                    className={`cursor-grab rounded-lg border border-zinc-200 bg-white p-2.5 text-sm shadow-sm active:cursor-grabbing ${dragging === d.id ? "opacity-40" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <Link href={`/campaigns/${campaignId}/deals/${d.id}`} className="font-medium leading-tight text-blue-700 hover:underline">
                        {d.influencer?.name ?? "–"}
                      </Link>
                      <span title={d.owner?.full_name || d.owner?.email || "No owner"}
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-[10px] font-semibold text-zinc-700">
                        {d.owner ? initials(d.owner) : "–"}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-500">@{d.influencer?.handle} · {compact(d.influencer?.followers)}</p>
                    {d.product && <p className="mt-1 inline-block rounded bg-violet-50 px-1.5 py-0.5 text-[11px] text-violet-800">{d.product}</p>}
                    {d.deliverables.length > 0 && (
                      <p className="mt-1 text-xs text-zinc-600">{d.deliverables.map((x) => `${x.count} ${x.format}`).join(", ")}</p>
                    )}
                    <div className="mt-1.5 flex items-center justify-between text-xs">
                      <span className="tabular-nums text-zinc-700">{d.payout !== null ? `Payout ${inr(d.payout)}` : <span className="text-amber-700">No payout yet</span>}</span>
                      {d.due_date && <span className="text-zinc-500">Due {dateIN(d.due_date)}</span>}
                    </div>
                    <label className="mt-2 block">
                      <span className="sr-only">Move to stage</span>
                      <select value={d.stage_id ?? ""} onChange={(e) => move(d.id, e.target.value)}
                        className="w-full rounded-md border border-zinc-200 bg-zinc-50 px-1.5 py-1 text-xs">
                        {stages.map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}
                      </select>
                    </label>
                  </article>
                ))}
              </div>
            </section>
          );
        })}
      </div>
      <p className="text-xs text-zinc-500">Drag cards between columns, or use the stage menu on each card (handy on phones). Column totals are payouts.</p>
    </div>
  );
}
