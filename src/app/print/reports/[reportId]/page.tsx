import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import { getReport, loadReportData } from "@/lib/services/reports";
import { ServiceError } from "@/lib/services/errors";
import { ReportDocument } from "@/components/report/report-document";
import { AutoPrint, PrintButton } from "./auto-print";

export const metadata = { title: "Report" };

export default function PrintReportPage({ params }: PageProps<"/print/reports/[reportId]">) {
  return (
    <main className="min-h-screen bg-zinc-200 print:bg-white">
      <Suspense fallback={<p className="p-6 text-sm text-zinc-500">Preparing report…</p>}>
        <PrintView params={params} />
      </Suspense>
    </main>
  );
}

async function PrintView({ params }: { params: PageProps<"/print/reports/[reportId]">["params"] }) {
  const { reportId } = await params;
  const { db, workspace } = await requireWorkspace();
  const report = await getReport(db, workspace.id, reportId).catch((e) => {
    if (e instanceof ServiceError && e.code === "not_found") notFound();
    throw e;
  });
  const data = await loadReportData(db, workspace.id, report.campaign_id, 24 * 3600);
  const file = `${data.brand.name} - ${report.config.title || data.campaign.name}`;
  return (
    <>
      <title>{file}</title>
      <div className="no-print sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-zinc-300 bg-white px-4 py-2">
        <Link href={`/campaigns/${report.campaign_id}/report`} className="text-sm text-zinc-600 hover:underline">← Back to report builder</Link>
        <span className="hidden text-xs text-zinc-500 sm:block">In the print dialog choose “Save as PDF”, paper A4, and turn on “Background graphics”.</span>
        <PrintButton />
      </div>
      <div className="mx-auto my-4 w-[210mm] bg-white shadow-lg print:my-0 print:shadow-none">
        <ReportDocument data={data} config={report.config} />
      </div>
      <AutoPrint />
    </>
  );
}
