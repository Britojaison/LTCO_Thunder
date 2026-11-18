import { Suspense } from "react";
import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import { workspaceVocab } from "@/lib/services/lists";
import { getInfluencer } from "@/lib/services/influencers";
import { ServiceError } from "@/lib/services/errors";
import { InfluencerForm } from "../../influencer-form";
import { updateInfluencerAction } from "../../actions";

export const metadata = { title: "Edit influencer" };

export default function EditInfluencerPage({ params }: PageProps<"/influencers/[id]/edit">) {
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Edit influencer</h1>
      <Suspense fallback={<p className="text-sm text-zinc-400">Loading…</p>}>
        <EditForm params={params} />
      </Suspense>
    </section>
  );
}

async function EditForm({ params }: { params: PageProps<"/influencers/[id]/edit">["params"] }) {
  const { id } = await params;
  const { db, workspace } = await requireWorkspace();
  const [influencer, vocab] = await Promise.all([
    getInfluencer(db, workspace.id, id).catch((e) => {
      if (e instanceof ServiceError && e.code === "not_found") notFound();
      throw e;
    }),
    workspaceVocab(db, workspace.id),
  ]);
  return (
    <InfluencerForm
      action={updateInfluencerAction.bind(null, id)}
      initial={influencer}
      vocab={vocab}
      cancelHref={`/influencers/${id}`}
      submitLabel="Save changes"
    />
  );
}
