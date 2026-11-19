import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import { getCampaign } from "@/lib/services/campaigns";
import { listDeals, listStages } from "@/lib/services/deals";
import { ServiceError } from "@/lib/services/errors";
import { btnPrimary, Card } from "@/components/ui";
import { CampaignTabs } from "../../campaign-tabs";
import { StatusBadge } from "../../status-badge";
import { Board } from "./board";
import { brandProducts } from "@/lib/services/deals";
import { QuickAdd } from "../../quick-add";

export const metadata = { title: "Pipeline" };

export default function PipelinePage({ params }: PageProps<"/campaigns/[id]/pipeline">) {
  return <Suspense fallback={<p className="text-sm text-zinc-400">Loading…</p>}><Pipeline params={params} /></Suspense>;
}

async function Pipeline({ params }: { params: PageProps<"/campaigns/[id]/pipeline">["params"] }) {
  const { id } = await params;
  const { db, workspace } = await requireWorkspace();
  const campaign = await getCampaign(db, workspace.id, id).catch((e) => {
    if (e instanceof ServiceError && e.code === "not_found") notFound();
    throw e;
  });
  const [stages, deals] = await Promise.all([listStages(db, workspace.id), listDeals(db, workspace.id, id)]);

  const products = await brandProducts(db, workspace.id, campaign.brand_id);
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <Link href={`/brands/${campaign.brand_id}`} className="text-sm text-zinc-500 hover:underline">{campaign.brand?.name}</Link>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">{campaign.name} <StatusBadge status={campaign.status} /></h1>
        </div>
        <Link href={`/campaigns/${id}/add`} className={btnPrimary}>Add from databank</Link>
      </div>
      <CampaignTabs id={id} active="pipeline" />
      <QuickAdd products={products} campaignId={id} />
      {deals.length === 0 ? (
        <Card><p className="text-sm text-zinc-600">No influencers in this campaign yet. <Link href={`/campaigns/${id}/add`} className="underline">Add some from your databank</Link>.</p></Card>
      ) : (
        <Board campaignId={id} stages={stages} deals={deals} />
      )}
    </section>
  );
}
