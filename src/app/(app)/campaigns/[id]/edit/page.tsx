import { Suspense } from "react";
import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import { listBrands } from "@/lib/services/brands";
import { getCampaign, memberName } from "@/lib/services/campaigns";
import { listMembers } from "@/lib/services/team";
import { ServiceError } from "@/lib/services/errors";
import { CampaignForm } from "../../campaign-form";
import { updateCampaignAction } from "../../actions";

export const metadata = { title: "Edit campaign" };

export default function EditCampaignPage({ params }: PageProps<"/campaigns/[id]/edit">) {
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Edit campaign</h1>
      <Suspense fallback={<p className="text-sm text-zinc-400">Loading…</p>}><Edit params={params} /></Suspense>
    </section>
  );
}

async function Edit({ params }: { params: PageProps<"/campaigns/[id]/edit">["params"] }) {
  const { id } = await params;
  const { db, workspace } = await requireWorkspace();
  const [campaign, brands] = await Promise.all([
    getCampaign(db, workspace.id, id).catch((e) => {
      if (e instanceof ServiceError && e.code === "not_found") notFound();
      throw e;
    }),
    listBrands(db, workspace.id),
  ]);
  const members = (await listMembers(db, workspace.id)).map((m) => ({ user_id: m.user_id, name: memberName(m)! }));
  return <CampaignForm action={updateCampaignAction.bind(null, id)} brands={brands} members={members} initial={campaign} cancelHref={`/campaigns/${id}`} submitLabel="Save changes" />;
}
