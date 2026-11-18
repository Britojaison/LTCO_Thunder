import { NextResponse, type NextRequest } from "next/server";
import { requireWorkspace } from "@/lib/auth";
import { getCampaign } from "@/lib/services/campaigns";
import { dealsToCsv, listDeals, listStages } from "@/lib/services/deals";

/** Internal CSV export of a campaign's deals (includes payouts and profit). */
export async function GET(request: NextRequest, { params }: RouteContext<"/campaigns/[id]/deals/export">) {
  const { id } = await params;
  const { db, workspace } = await requireWorkspace();
  const campaign = await getCampaign(db, workspace.id, id).catch(() => null);
  if (!campaign) return new NextResponse("Not found", { status: 404 });
  const sp = request.nextUrl.searchParams;
  const [stages, deals] = await Promise.all([
    listStages(db, workspace.id),
    listDeals(db, workspace.id, id, { stage: sp.get("stage") ?? undefined, owner: sp.get("owner") ?? undefined, payment: sp.get("payment") ?? undefined }),
  ]);
  const names = new Map(stages.map((s) => [s.id, s.name]));
  const csv = dealsToCsv(deals, (sid) => names.get(sid ?? "") ?? "");
  const file = `${campaign.brand?.name ?? "campaign"}-${campaign.name}`.replace(/[^\w-]+/g, "_").slice(0, 80);
  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${file}.csv"`,
      "cache-control": "no-store",
    },
  });
}
