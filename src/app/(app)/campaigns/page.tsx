import Link from "next/link";
import { Suspense } from "react";
import { requireWorkspace } from "@/lib/auth";
import { listCampaigns, CAMPAIGN_STATUSES } from "@/lib/services/campaigns";
import { btnPrimary, Card } from "@/components/ui";
import { CampaignTable } from "./campaign-table";

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
  const { db, workspace } = await requireWorkspace();
  const campaigns = await listCampaigns(db, workspace.id, { status });
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
    </>
  );
}
