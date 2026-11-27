import Link from "next/link";
import { Suspense } from "react";
import { requireWorkspace } from "@/lib/auth";
import { listCampaigns, pipelineMix, memberName, CAMPAIGN_STATUSES, type CampaignStatus } from "@/lib/services/campaigns";
import { listMembers } from "@/lib/services/team";
import { signedUrls } from "@/lib/services/storage";
import { Card } from "@/components/ui";
import { CampaignTable } from "./campaign-table";
import { CampaignCard } from "./campaign-cards";
import { listDueSnapshots } from "@/lib/services/posts";
import { DueSnapshots } from "@/components/due-snapshots";
import { inr } from "@/lib/format";
import { AnimatedDropdown } from "@/components/animated-dropdown";
import { GlassEntrance } from "../glass-entrance";

export const metadata = { title: "Campaigns" };

const headerButton = "inline-flex h-10 w-fit shrink-0 items-center justify-center whitespace-nowrap rounded-full bg-[#ff5a1f] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#ea650d] hover:shadow-md";

const TABS = [["", "Active"], ...CAMPAIGN_STATUSES.map((s) => [s, s.charAt(0).toUpperCase() + s.slice(1)]), ["all", "All"]];
const SECTIONS: [CampaignStatus, string][] = [["live", "Live"], ["planning", "Planning"], ["completed", "Completed"], ["archived", "Archived"]];

export default function CampaignsPage({ searchParams }: PageProps<"/campaigns">) {
  return (
    <section className="space-y-4">
      <GlassEntrance>
        <div data-gsap-enter className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="min-w-0 self-start sm:self-auto">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#f97316]">Campaign management</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-[#111827]">Campaigns</h1>
            <p className="mt-1 text-sm text-[#6b7280]">Track your creator partnerships and campaign performance.</p>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-3">
            <Link href="/import" className={headerButton}>Import</Link>
            <Link href="/campaigns/new" className={headerButton}><span aria-hidden="true" className="mr-2 text-lg leading-none">+</span>New campaign</Link>
          </div>
        </div>
      </GlassEntrance>
      <Suspense fallback={<p className="text-sm text-zinc-400">Loading…</p>}><List searchParams={searchParams} /></Suspense>
    </section>
  );
}

async function List({ searchParams }: { searchParams: PageProps<"/campaigns">["searchParams"] }) {
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const status = str("status"), poc = str("poc"), view = str("view") === "table" ? "table" : "cards";
  const { db, workspace, user } = await requireWorkspace();
  const mine = sp.due !== "all";
  const [campaigns, dueAll, team] = await Promise.all([
    listCampaigns(db, workspace.id, { status, pocId: poc === "me" ? user.id : poc }),
    listDueSnapshots(db, workspace.id),
    listMembers(db, workspace.id),
  ]);
  const [mix, logos] = await Promise.all([
    pipelineMix(db, workspace.id, campaigns.map((c) => c.id)),
    signedUrls(db, [...new Set(campaigns.map((c) => c.brand_logo).filter(Boolean))] as string[]),
  ]);
  const due = mine ? dueAll.filter((d) => d.owner_id === user.id) : dueAll;
  const dueBy = new Map<string, number>();
  for (const d of dueAll) dueBy.set(d.campaign_id, (dueBy.get(d.campaign_id) ?? 0) + 1);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

  const qs = (o: Record<string, string>) => {
    const p = new URLSearchParams({ ...(status ? { status } : {}), ...(poc ? { poc } : {}), ...(view === "table" ? { view } : {}), ...o });
    for (const [k, v] of [...p]) if (!v) p.delete(k);
    const s = p.toString();
    return `/campaigns${s ? `?${s}` : ""}`;
  };
  const pill = (on: boolean) => `rounded-full px-3 py-1.5 transition ${on ? "bg-[#f97316] text-white shadow-sm" : "text-slate-600 hover:bg-white"}`;
  const pocTabs: [string, string][] = [["", "Everyone"], ["me", "Mine"],
    ...team.filter((m) => m.user_id !== user.id).map((m) => [m.user_id, memberName(m)!] as [string, string]), ["none", "No POC"]];

  // Summary for what's on screen.
  const sum = campaigns.reduce((t, c) => ({
    live: t.live + (c.status === "live" ? 1 : 0), infl: t.infl + c.fin.influencer_count, client: t.client + c.fin.cost_to_client,
    profit: t.profit + c.fin.profit, missing: t.missing + c.fin.missing_payout,
  }), { live: 0, infl: 0, client: 0, profit: 0, missing: 0 });
  const dueOnScreen = campaigns.reduce((t, c) => t + (dueBy.get(c.id) ?? 0), 0);
  const stats: [string, string, string?][] = [
    ["Live campaigns", String(sum.live)],
    ["Influencers", String(sum.infl)],
    ["Cost to client", inr(sum.client)],
    ["Profit", sum.missing ? "–" : inr(sum.profit), sum.missing ? `${sum.missing} payout${sum.missing > 1 ? "s" : ""} missing` : undefined],
    ["Snapshots due", String(dueOnScreen), dueOnScreen ? "across these campaigns" : undefined],
  ];

  return (
    <>
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <nav aria-label="Campaign status" className="flex flex-wrap gap-1 text-sm">
          {TABS.map(([key, label]) => <Link key={key} href={qs({ status: key })} className={pill(key === status)}>{label}</Link>)}
        </nav>
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm xl:justify-end">
          <AnimatedDropdown label={`POC: ${pocTabs.find(([key]) => key === poc)?.[1] ?? "Everyone"}`} ariaLabel="Filter by point of contact">
            {pocTabs.map(([key, label]) => <Link key={key || "all"} href={qs({ poc: key })} role="menuitem" data-menu-item className={`block rounded-lg px-3 py-2 text-xs ${key === poc ? "bg-orange-50 font-semibold text-orange-700" : "text-slate-600 hover:bg-slate-50"}`}>{label}</Link>)}
          </AnimatedDropdown>
          <nav aria-label="Campaign view" className="flex rounded-full border border-white/80 bg-white/65 p-1 text-xs shadow-sm backdrop-blur-lg">
            <Link href={qs({ view: "" })} aria-current={view === "cards" ? "page" : undefined} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 transition ${view === "cards" ? "bg-[#f97316] text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"}`}>
              <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M2 2h5v5H2zM9 2h5v5H9zM2 9h5v5H2zM9 9h5v5H9z" /></svg>Cards
            </Link>
            <Link href={qs({ view: "table" })} aria-current={view === "table" ? "page" : undefined} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 transition ${view === "table" ? "bg-[#f97316] text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"}`}>
              <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M2 3h12M2 7h12M2 11h12M2 14h12" /></svg>Table
            </Link>
          </nav>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map(([label, value, note], index) => (
          <div key={label} className={index === 0 ? "rounded-2xl bg-gradient-to-br from-[#f97316] to-[#fb923c] px-4 py-3 text-white shadow-[0_8px_20px_rgba(249,115,22,0.16)]" : "glass-card px-4 py-3"}>
            <dt className={index === 0 ? "text-xs text-white/80" : "text-xs text-zinc-500"}>{label}</dt>
            <dd className="mt-0.5 text-xl font-semibold tabular-nums">{value}</dd>
            {note && <p className={index === 0 ? "text-[11px] text-white/75" : "text-[11px] text-amber-700"}>{note}</p>}
          </div>
        ))}
      </dl>

      {campaigns.length === 0 ? (
        <Card><p className="text-sm text-zinc-600">No campaigns here yet.</p></Card>
      ) : view === "table" ? (
        <CampaignTable campaigns={campaigns} />
      ) : (
        SECTIONS.map(([key, label]) => {
          const list = campaigns.filter((c) => c.status === key);
          if (!list.length) return null;
          return (
            <section key={key} className="space-y-2">
              <h2 className="text-sm font-semibold text-zinc-700">{label} <span className="font-normal text-zinc-400">{list.length}</span></h2>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {list.map((c) => (
                  <CampaignCard key={c.id} c={c} today={today}
                    mix={mix.get(c.id) ?? { total: 0, working: 0, confirmed: 0, done: 0, dropped: 0 }}
                    due={dueBy.get(c.id) ?? 0} logo={c.brand_logo ? logos[c.brand_logo] : undefined} />
                ))}
              </div>
            </section>
          );
        })
      )}

      <DueSnapshots
        rows={due}
        title={mine ? "My snapshots due" : "All snapshots due"}
        actions={
          <span className="flex gap-1 text-xs">
            <Link href={qs({ due: "" })} className={`rounded-full px-3 py-1.5 ${mine ? "bg-[#f97316] font-semibold text-white" : "text-slate-600 hover:bg-slate-50"}`}>Mine</Link>
            <span className="text-zinc-300">|</span>
            <Link href={qs({ due: "all" })} className={`rounded-full px-3 py-1.5 ${!mine ? "bg-[#f97316] font-semibold text-white" : "text-slate-600 hover:bg-slate-50"}`}>Everyone</Link>
          </span>
        }
      />
      <p className="text-xs text-zinc-500">“Active” hides archived campaigns. Money is internal and never appears in client reports.</p>
    </>
  );
}
