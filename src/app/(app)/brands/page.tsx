import Link from "next/link";
import { Suspense } from "react";
import { requireWorkspace } from "@/lib/auth";
import { listBrands } from "@/lib/services/brands";
import { signedUrls } from "@/lib/services/storage";
import { btnPrimary, Card } from "@/components/ui";

export const metadata = { title: "Brands" };

export default function BrandsPage() {
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-[#18191c]">Brands</h1>
          <p className="mt-1 text-sm text-[#6b7280]">Manage client brands and their campaign history.</p>
        </div>
        <Link href="/brands/new" className={btnPrimary}>Add brand</Link>
      </div>
      <Suspense fallback={<p className="text-sm text-zinc-400">Loading…</p>}><BrandList /></Suspense>
    </section>
  );
}

async function BrandList() {
  const { db, workspace } = await requireWorkspace();
  const brands = await listBrands(db, workspace.id);
  const logos = await signedUrls(db, brands.map((b) => b.logo_path));
  if (!brands.length) return <Card><p className="text-sm text-zinc-600">No brands yet. Add your first client brand to start a campaign.</p></Card>;
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {brands.map((b) => (
        <Link key={b.id} href={`/brands/${b.id}`} className="flex items-center gap-3 rounded-2xl border border-[#eceef2] bg-white p-4 shadow-[0_2px_12px_rgba(24,25,28,0.035)] transition hover:border-orange-200 hover:shadow-md">
          {b.logo_path && logos[b.logo_path] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logos[b.logo_path]} alt="" className="h-12 w-12 rounded-md object-contain" />
          ) : (
            <span className="flex h-12 w-12 items-center justify-center rounded-md bg-zinc-100 text-lg font-semibold text-zinc-500">{b.name.charAt(0)}</span>
          )}
          <span className="min-w-0">
            <span className="block truncate font-medium">{b.name}</span>
            <span className="block text-xs text-zinc-500">
              {[b.category, `${b.campaigns.total} campaign${b.campaigns.total === 1 ? "" : "s"}`, b.campaigns.live ? `${b.campaigns.live} live` : ""].filter(Boolean).join(" · ")}
            </span>
          </span>
        </Link>
      ))}
    </div>
  );
}
