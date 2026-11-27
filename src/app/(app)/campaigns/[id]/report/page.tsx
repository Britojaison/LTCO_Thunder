import Link from "next/link";
import { Suspense } from "react";
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
  let campaign: Awaited<ReturnType<typeof getCampaign>> | null = null;
  try {
    campaign = await getCampaign(db, workspace.id, id);
  } catch (e) {
    if (!(e instanceof ServiceError && e.code === "not_found")) throw e;
  }

  if (!campaign) {
    return (
      <section className="glass-card mx-auto max-w-xl p-6 text-center space-y-3">
        <h1 className="text-xl font-semibold text-slate-900">Campaign not found</h1>
        <p className="text-sm text-slate-600">
          This campaign may have been deleted or belongs to a different workspace.
        </p>
        <div className="flex justify-center gap-3 pt-2">
          <Link href="/campaigns" className="rounded-xl bg-[#ff5a1f] px-4 py-2 text-sm font-semibold text-white hover:bg-[#e64a13]">
            Back to Campaigns
          </Link>
          <Link href="/reports" className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            View Reports
          </Link>
        </div>
      </section>
    );
  }

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
