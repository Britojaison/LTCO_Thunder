import Link from "next/link";
import { Suspense } from "react";
import { requireWorkspace } from "@/lib/auth";
import { listReports } from "@/lib/services/reports";
import { Card } from "@/components/ui";
import { dateIN } from "@/lib/format";

export const metadata = { title: "Reports" };

export default function ReportsPage() {
  return (
    <section className="space-y-4">
      <h1 className="text-3xl font-semibold tracking-tight text-[#18191c]">Client reports</h1>
      <p className="text-sm text-zinc-500">To make a new report, open a campaign and choose the “Client report” tab.</p>
      <Suspense fallback={<p className="text-sm text-zinc-400">Loading…</p>}><List /></Suspense>
    </section>
  );
}

async function List() {
  const { db, workspace } = await requireWorkspace();
  const reports = await listReports(db, workspace.id);
  if (!reports.length) return <Card><p className="text-sm text-zinc-600">No reports yet.</p></Card>;
  return (
    <div className="glass-card overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs text-zinc-500">
          <tr><th className="p-2">Report</th><th className="p-2">Brand · campaign</th><th className="p-2">Created</th><th className="p-2" /></tr>
        </thead>
        <tbody>
          {reports.map((r) => (
            <tr key={r.id} className="border-b border-zinc-100">
              <td className="p-2"><Link href={`/print/reports/${r.id}`} className="font-medium text-blue-700 hover:underline">{r.title || r.campaign}</Link></td>
              <td className="p-2 text-zinc-600">{r.brand} · <Link href={`/campaigns/${r.campaign_id}/report`} className="hover:underline">{r.campaign}</Link></td>
              <td className="p-2 text-zinc-600">{dateIN(r.created_at)}</td>
              <td className="p-2 text-right"><Link href={`/print/reports/${r.id}`} className="text-xs text-zinc-600 underline">Open / download</Link></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
