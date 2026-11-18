import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import { getCampaign } from "@/lib/services/campaigns";
import { loadReportData, listTemplates, listReports } from "@/lib/services/reports";
import { ServiceError } from "@/lib/services/errors";
import { CampaignTabs } from "../../campaign-tabs";
import { StatusBadge } from "../../status-badge";
import { ReportBuilder } from "./builder";

export const metadata = { title: "Client report" };

export default function ReportPage({ params }: PageProps<"/campaigns/[id]/report">) {
  return <Suspense fallback={<p className="text-sm text-zinc-400">Loading…</p>}><Report params={params} /></Suspense>;
}

async function Report({ params }: { params: PageProps<"/campaigns/[id]/report">["params"] }) {
  const { id } = await params;
  const { db, workspace } = await requireWorkspace();
  const campaign = await getCampaign(db, workspace.id, id).catch((e) => {
    if (e instanceof ServiceError && e.code === "not_found") notFound();
    throw e;
  });
  const [data, templates, past] = await Promise.all([
    loadReportData(db, workspace.id, id),
    listTemplates(db, workspace.id, campaign.brand_id),
    listReports(db, workspace.id, id),
  ]);
  return (
    <section className="space-y-4">
      <div>
        <Link href={`/brands/${campaign.brand_id}`} className="text-sm text-zinc-500 hover:underline">{campaign.brand?.name}</Link>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">{campaign.name} <StatusBadge status={campaign.status} /></h1>
      </div>
      <CampaignTabs id={id} active="report" />
      <ReportBuilder data={data} templates={templates} past={past} brandId={campaign.brand_id} />
    </section>
  );
}
