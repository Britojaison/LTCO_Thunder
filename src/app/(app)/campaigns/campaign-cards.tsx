import Link from "next/link";
import type { listCampaigns, PipelineMix } from "@/lib/services/campaigns";
import { StatusBadge } from "./status-badge";
import { dateIN, inr } from "@/lib/format";

type Row = Awaited<ReturnType<typeof listCampaigns>>[number];

const initials = (name: string | null) => (name ?? "?").split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
const DAY = 864e5;

/** Day X of Y for a running campaign, or how far off / how long ago. Dates are calendar days in IST. */
function timeline(start: string | null, end: string | null, today: string) {
  if (!start) return null;
  const d = (x: string) => new Date(`${x}T00:00:00Z`).getTime();
  const s = d(start), e = d(end ?? start), t = d(today);
  const span = Math.max(1, Math.round((e - s) / DAY) + 1);
  if (t < s) { const n = Math.round((s - t) / DAY); return { pct: 0, text: `Starts in ${n} day${n > 1 ? "s" : ""}` }; }
  if (t > e) { const n = Math.round((t - e) / DAY); return { pct: 100, text: `Ended ${n} day${n > 1 ? "s" : ""} ago` }; }
  const day = Math.round((t - s) / DAY) + 1;
  const left = span - day;
  return { pct: Math.round((day / span) * 100), text: `Day ${day} of ${span}${left ? ` · ${left} left` : " · last day"}` };
}

function MixBar({ m }: { m: PipelineMix }) {
  if (!m.total) return <p className="text-xs text-zinc-400">No influencers yet</p>;
  const seg = [
    { n: m.working, cls: "bg-amber-300", label: "in progress" },
    { n: m.confirmed, cls: "bg-blue-500", label: "confirmed" },
    { n: m.done, cls: "bg-emerald-500", label: "done" },
    { n: m.dropped, cls: "bg-zinc-300", label: "dropped" },
  ].filter((x) => x.n > 0);
  return (
      <p className="text-xs text-zinc-500">
        <span className="font-medium text-zinc-800">{m.total - m.dropped}</span> influencer{m.total - m.dropped === 1 ? "" : "s"}
        {seg.filter((x) => x.label !== "dropped" || x.n).map((x) => (
          <span key={x.label}> · <span className={`mr-0.5 inline-block h-1.5 w-1.5 rounded-full align-middle ${x.cls}`} />{x.n} {x.label}</span>
        ))}
      </p>
  );
}

export function CampaignCard({ c, mix, due, logo, today }: { c: Row; mix: PipelineMix; due: number; logo?: string; today: string }) {
  const tl = (c.status === "live" || c.status === "planning") && c.start_date && c.end_date ? timeline(c.start_date, c.end_date, today) : null;
  const ended = c.status === "live" && Boolean(c.end_date && tl?.text.startsWith("Ended "));
  const f = c.fin;
  const allMissing = f.influencer_count > 0 && f.missing_payout === f.influencer_count;
  return (
    <Link href={`/campaigns/${c.id}`}
      className="glass-card glass-interactive group flex flex-col gap-3 p-4">
      <div className="flex items-start gap-3">
        {logo
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={logo} alt="" className="h-9 w-9 shrink-0 rounded-md border border-zinc-200 object-contain" />
          : <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-zinc-100 text-xs font-semibold text-zinc-600">{initials(c.brand)}</span>}
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs text-zinc-500">{c.brand}</p>
          <h3 className="truncate font-semibold text-[#111827] transition-colors group-hover:text-[#f97316]">{c.name}</h3>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          <StatusBadge status={c.status} ended={ended} />
          {due > 0 && <span className="rounded-full border border-red-100 bg-red-50 px-2 py-1 text-[11px] font-medium text-red-700">{due} snapshot{due > 1 ? "s" : ""} due</span>}
        </div>
      </div>

      <div className="text-xs text-zinc-500">
        {c.start_date ? `${dateIN(c.start_date)} – ${dateIN(c.end_date)}` : "No dates set"}
        {tl && (
          <div className="mt-1.5">
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${ended ? "bg-slate-400" : "bg-[#f97316]"}`} style={{ width: `${tl.pct}%` }} /></div>
            <p className="mt-1">{tl.text}</p>
          </div>
        )}
      </div>

      <MixBar m={mix} />

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-[#e5e7eb] pt-3 text-xs">
        <div>
          <p className="text-zinc-500">Client <span className="font-medium tabular-nums text-zinc-900">{inr(f.cost_to_client)}</span></p>
          {f.influencer_count === 0 ? null : allMissing
            ? <p className="text-amber-700">Payouts missing</p>
            : <p className="text-zinc-500">Profit <span className={`font-medium tabular-nums ${f.profit < 0 ? "text-red-700" : "text-zinc-900"}`}>{inr(f.profit)}</span>
                {f.profit_pct !== null && <span> · {f.profit_pct}%</span>}
                {f.missing_payout > 0 && <span className="text-amber-700"> · partial</span>}</p>}
        </div>
        <div className="flex items-center gap-2">
          <span title={c.poc ? `POC: ${c.poc}` : "No POC"}
            className={`flex h-7 items-center gap-1.5 rounded-full pl-0.5 pr-2 ${c.poc ? "bg-zinc-100 text-zinc-700" : "bg-amber-50 text-amber-700"}`}>
            <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold ${c.poc ? "bg-zinc-800 text-white" : "bg-amber-200"}`}>{c.poc ? initials(c.poc) : "?"}</span>
            {c.poc ? c.poc.split(" ")[0] : "No POC"}
          </span>
        </div>
      </div>
    </Link>
  );
}
