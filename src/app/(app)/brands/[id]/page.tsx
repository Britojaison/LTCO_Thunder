import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import { getBrand } from "@/lib/services/brands";
import { listCampaigns } from "@/lib/services/campaigns";
import { signedUrls } from "@/lib/services/storage";
import { ServiceError } from "@/lib/services/errors";
import { Badge, btnPrimary, btnSecondary, Card } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { CampaignTable } from "../../campaigns/campaign-table";
import { deleteBrandAction } from "../actions";

export const metadata = { title: "Brand" };

export default function BrandPage({ params }: PageProps<"/brands/[id]">) {
  return <Suspense fallback={<p className="text-sm text-zinc-400">Loading…</p>}><Brand params={params} /></Suspense>;
}

async function Brand({ params }: { params: PageProps<"/brands/[id]">["params"] }) {
  const { id } = await params;
  const { db, workspace } = await requireWorkspace();
  const brand = await getBrand(db, workspace.id, id).catch((e) => {
    if (e instanceof ServiceError && e.code === "not_found") notFound();
    throw e;
  });
  const [campaigns, urls] = await Promise.all([
    listCampaigns(db, workspace.id, { brandId: id, status: "all" }),
    signedUrls(db, [brand.logo_path]),
  ]);
  const logo = brand.logo_path ? urls[brand.logo_path] : undefined;

  return (
    <section className="space-y-4">
      <Link href="/brands" className="text-sm text-zinc-500 hover:underline">← Brands</Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt="" className="h-14 w-14 rounded-md border border-zinc-200 object-contain" />
          ) : (
            <span className="flex h-14 w-14 items-center justify-center rounded-md bg-zinc-100 text-xl font-semibold text-zinc-500">{brand.name.charAt(0)}</span>
          )}
          <div>
            <h1 className="text-2xl font-semibold">{brand.name}</h1>
            {brand.category && <p className="text-sm text-zinc-500">{brand.category}</p>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/campaigns/new?brand=${id}`} className={btnPrimary}>New campaign</Link>
          <Link href={`/brands/${id}/edit`} className={btnSecondary}>Edit</Link>
          <ConfirmButton label="Delete" confirmText="Delete this brand?" action={deleteBrandAction.bind(null, id)} />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Client contacts">
          {brand.client_contacts.length === 0 ? <p className="text-sm text-zinc-400">No contacts yet.</p> : (
            <ul className="space-y-2 text-sm">
              {brand.client_contacts.map((c, i) => (
                <li key={i}>
                  <span className="font-medium">{c.name || "–"}</span>{c.role && <span className="text-zinc-500"> · {c.role}</span>}
                  <div className="text-zinc-600">{[c.email, c.phone].filter(Boolean).join(" · ")}</div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Competitor brands">
          {(brand.competitor_brands as string[]).length === 0 ? <p className="text-sm text-zinc-400">None listed.</p> : (
            <div className="flex flex-wrap gap-1">{(brand.competitor_brands as string[]).map((c) => <Badge key={c}>{c}</Badge>)}</div>
          )}
          <Link href={`/influencers?competitor_brand_id=${id}&competitor_days=90`} className="mt-3 inline-block text-sm text-zinc-600 underline">
            Find influencers with no competitor promotion in 90 days
          </Link>
        </Card>
      </div>

      <h2 className="pt-2 text-lg font-semibold">Campaigns</h2>
      {campaigns.length === 0 ? <Card><p className="text-sm text-zinc-500">No campaigns for this brand yet.</p></Card> : <CampaignTable campaigns={campaigns} showBrand={false} />}
    </section>
  );
}
