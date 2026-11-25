import Link from "next/link";
import type { listDueSnapshots } from "@/lib/services/posts";
import { Badge, Card } from "./ui";

type Row = Awaited<ReturnType<typeof listDueSnapshots>>[number];

/** Snapshots to collect: overdue first. Each row opens the deal where the numbers are entered. */
export function DueSnapshots({ rows, showCampaign = true, title = "Snapshots due", actions }: { rows: Row[]; showCampaign?: boolean; title?: string; actions?: React.ReactNode }) {
  return (
    <Card title={`${title} (${rows.length})`} actions={actions}>
      {rows.length === 0 ? <p className="text-sm text-zinc-500">All caught up.</p> : (
        <ul className="divide-y divide-zinc-100">
          {rows.slice(0, 50).map((r) => {
            const late = r.late;
            const days = r.overdueDays;
            return (
              <li key={`${r.post_id}-${r.snapshot_point}`} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span className="min-w-0">
                  <Badge tone={late ? "red" : "amber"}>{r.snapshot_point}</Badge>{" "}
                  <Link href={`/campaigns/${r.campaign_id}/deals/${r.deal_id}`} className="font-medium text-slate-800 hover:text-[#f97316]">{r.influencer?.name ?? "Influencer"}</Link>
                  <span className="text-zinc-500"> · {r.format}{showCampaign && r.campaign ? ` · ${r.campaign}` : ""}</span>
                </span>
                <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${late ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800"}`}>{late ? (days > 0 ? `${days} day${days > 1 ? "s" : ""} overdue` : "due today") : "due within a day"}</span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
