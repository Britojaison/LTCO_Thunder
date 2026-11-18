import Link from "next/link";
import { Suspense } from "react";
import { requireWorkspace } from "@/lib/auth";
import { listCampaigns, CAMPAIGN_STATUSES } from "@/lib/services/campaigns";
import { btnPrimary, Card } from "@/components/ui";
import { CampaignTable } from "./campaign-table";
import { listDueSnapshots } from "@/lib/services/posts";
import { DueSnapshots } from "@/components/due-snapshots";

export const metadata = { title: "Campaigns" };

const TABS = [["", "Active"], ...CAMPAIGN_STATUSES.map((s) => [s, s.charAt(0).toUpperCase() + s.slice(1)]), ["all", "All"]];

export default function CampaignsPage({ searchParams }: PageProps<"/campaigns">) {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Campaigns</h1>
        <Link href="/campaigns/new" className={btnPrimary}>New campaign</Link>
      </div>
      <Suspense fallback={<p className="text-sm text-zinc-400">Loading…</p>}><List searchParams={searchParams} /></Suspense>
    </section>
  );
}

async function List({ searchParams }: { searchParams: PageProps<"/campaigns">["searchParams"] }) {
  const sp = await searchParams;
  const status = typeof sp.status === "string" ? sp.status : "";
  const { db, workspace, user } = await requireWorkspace();
  const mine = sp.due !== "all";
  const [campaigns, due] = await Promise.all([
    listCampaigns(db, workspace.id, { status }),
    listDueSnapshots(db, workspace.id, mine ? { ownerId: user.id } : {}),
  ]);
  return (
    <>
      <nav className="flex flex-wrap gap-1">
        {TABS.map(([key, label]) => (
          <Link key={key} href={key ? `/campaigns?status=${key}` : "/campaigns"}
            className={`rounded-md px-3 py-1.5 text-sm ${key === status ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-200"}`}>
            {label}
          </Link>
        ))}
      </nav>
      {campaigns.length === 0 ? (
        <Card><p className="text-sm text-zinc-600">No campaigns here yet.</p></Card>
      ) : (
        <CampaignTable campaigns={campaigns} />
      )}
      <p className="text-xs text-zinc-500">“Active” hides archived campaigns. Money columns are internal and never appear in client reports.</p>
      <DueSnapshots
        rows={due}
        title={mine ? "My snapshots due" : "All snapshots due"}
        actions={
          <span className="flex gap-1 text-xs">
            <Link href={`/campaigns${status ? `?status=${status}` : ""}`} className={mine ? "font-semibold" : "text-zinc-500 underline"}>Mine</Link>
            <span className="text-zinc-300">|</span>
            <Link href={`/campaigns?due=all${status ? `&status=${status}` : ""}`} className={!mine ? "font-semibold" : "text-zinc-500 underline"}>Everyone</Link>
          </span>
        }
      />
    </>
  );
}
