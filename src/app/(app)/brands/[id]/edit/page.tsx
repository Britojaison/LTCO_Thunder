import { Suspense } from "react";
import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import { getBrand } from "@/lib/services/brands";
import { signedUrls } from "@/lib/services/storage";
import { ServiceError } from "@/lib/services/errors";
import { BrandForm } from "../../brand-form";
import { updateBrandAction } from "../../actions";

export const metadata = { title: "Edit brand" };

export default function EditBrandPage({ params }: PageProps<"/brands/[id]/edit">) {
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Edit brand</h1>
      <Suspense fallback={<p className="text-sm text-zinc-400">Loading…</p>}><Edit params={params} /></Suspense>
    </section>
  );
}

async function Edit({ params }: { params: PageProps<"/brands/[id]/edit">["params"] }) {
  const { id } = await params;
  const { db, workspace } = await requireWorkspace();
  const brand = await getBrand(db, workspace.id, id).catch((e) => {
    if (e instanceof ServiceError && e.code === "not_found") notFound();
    throw e;
  });
  const urls = await signedUrls(db, [brand.logo_path]);
  return (
    <BrandForm action={updateBrandAction.bind(null, id)} initial={brand} logoUrl={brand.logo_path ? urls[brand.logo_path] : undefined}
      cancelHref={`/brands/${id}`} submitLabel="Save changes" />
  );
}
