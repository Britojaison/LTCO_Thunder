import Link from "next/link";
import { Suspense } from "react";
import { requireWorkspace } from "@/lib/auth";
import { listBrands } from "@/lib/services/brands";
import { listMembers } from "@/lib/services/team";
import { memberName } from "@/lib/services/campaigns";
import { btnPrimary, Card } from "@/components/ui";
import { CampaignForm } from "../campaign-form";
import { createCampaignAction } from "../actions";

export const metadata = { title: "New campaign" };

export default function NewCampaignPage({ searchParams }: PageProps<"/campaigns/new">) {
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">New campaign</h1>
      <Suspense fallback={<p className="text-sm text-zinc-400">Loading…</p>}><NewForm searchParams={searchParams} /></Suspense>
    </section>
  );
}

async function NewForm({ searchParams }: { searchParams: PageProps<"/campaigns/new">["searchParams"] }) {
  const sp = await searchParams;
  const { db, workspace, user } = await requireWorkspace();
  const [brands, team] = await Promise.all([listBrands(db, workspace.id), listMembers(db, workspace.id)]);
  const members = team.map((m) => ({ user_id: m.user_id, name: memberName(m)! }));
  if (!brands.length)
    return <Card><p className="text-sm text-zinc-600">Add a brand first. Every campaign belongs to a brand.</p><Link href="/brands/new" className={`${btnPrimary} mt-3`}>Add brand</Link></Card>;
  const brandId = typeof sp.brand === "string" && brands.some((b) => b.id === sp.brand) ? sp.brand : "";
  return <CampaignForm action={createCampaignAction} brands={brands} members={members} initial={{ brand_id: brandId, poc_id: user.id }} cancelHref={brandId ? `/brands/${brandId}` : "/campaigns"} submitLabel="Create campaign" />;
}
