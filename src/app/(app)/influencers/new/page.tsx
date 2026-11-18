import { Suspense } from "react";
import { requireWorkspace } from "@/lib/auth";
import { workspaceVocab } from "@/lib/services/lists";
import { normalizeHandle } from "@/lib/services/influencers";
import { InfluencerForm } from "../influencer-form";
import { createInfluencerAction } from "../actions";

export const metadata = { title: "Add influencer" };

export default function NewInfluencerPage({ searchParams }: PageProps<"/influencers/new">) {
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Add influencer</h1>
      <Suspense fallback={<p className="text-sm text-zinc-400">Loading…</p>}>
        <NewForm searchParams={searchParams} />
      </Suspense>
    </section>
  );
}

async function NewForm({ searchParams }: { searchParams: PageProps<"/influencers/new">["searchParams"] }) {
  const sp = await searchParams;
  const { db, workspace } = await requireWorkspace();
  const vocab = await workspaceVocab(db, workspace.id);
  const handle = typeof sp.handle === "string" ? normalizeHandle(sp.handle) : "";
  return <InfluencerForm action={createInfluencerAction} initial={{ handle }} vocab={vocab} cancelHref="/influencers" submitLabel="Save influencer" />;
}
