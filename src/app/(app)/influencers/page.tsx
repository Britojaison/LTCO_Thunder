import { Suspense } from "react";
import { requireWorkspace } from "@/lib/auth";
import { workspaceStats } from "@/lib/services/workspaces";

export const metadata = { title: "Influencers" };

export default function InfluencersPage() {
  return (
    <section className="max-w-3xl">
      <h1 className="text-2xl font-semibold">Influencers</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Database and search (module 1) is the next build. Workspace data below proves the wiring.
      </p>
      <Suspense fallback={<p className="mt-6 text-sm text-zinc-400">Loading workspace…</p>}>
        <Stats />
      </Suspense>
    </section>
  );
}

async function Stats() {
  const { db, workspace } = await requireWorkspace();
  const stats = await workspaceStats(db, workspace.id);
  return (
    <dl className="mt-6 grid grid-cols-3 gap-3">
      {Object.entries(stats).map(([k, v]) => (
        <div key={k} className="rounded-lg border border-zinc-200 bg-white p-4">
          <dt className="text-xs capitalize text-zinc-500">{k}</dt>
          <dd className="text-2xl font-semibold">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
