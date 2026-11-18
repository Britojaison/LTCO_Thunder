import Link from "next/link";
import { Suspense } from "react";
import { requireWorkspace } from "@/lib/auth";
import { listPending } from "@/lib/services/influencers";
import { getFormToken } from "@/lib/services/workspaces";
import { env } from "@/lib/env";
import { btnPrimary, btnSecondary, Card } from "@/components/ui";
import { cap, dateIN } from "@/lib/format";
import { approvePendingAction, rejectPendingAction } from "../actions";

export const metadata = { title: "Review queue" };

export default function PendingPage() {
  return (
    <section className="space-y-4">
      <Link href="/influencers" className="text-sm text-zinc-500 hover:underline">← Influencers</Link>
      <h1 className="text-2xl font-semibold">Self-registration review</h1>
      <Suspense fallback={<p className="text-sm text-zinc-400">Loading…</p>}>
        <Queue />
      </Suspense>
    </section>
  );
}

type Payload = Record<string, string | string[] | boolean | undefined>;

async function Queue() {
  const { db, workspace } = await requireWorkspace();
  const [items, token] = await Promise.all([listPending(db, workspace.id), getFormToken(db, workspace.id)]);
  const link = `${env.NEXT_PUBLIC_SITE_URL}/register/${token}`;
  const show = (v: unknown) => (Array.isArray(v) ? v.map((x) => cap(String(x))).join(", ") : v === true ? "Yes" : v ? String(v) : "–");

  return (
    <>
      <Card title="Your public registration link">
        <p className="text-sm text-zinc-600">Share this with creators. Submissions land here for review before entering the database.</p>
        <code className="mt-2 block break-all rounded-md bg-zinc-100 px-3 py-2 text-sm">{link}</code>
      </Card>

      {items.length === 0 ? (
        <Card><p className="text-sm text-zinc-500">Nothing waiting for review.</p></Card>
      ) : (
        items.map((item) => {
          const p = item.payload as Payload;
          return (
            <Card key={item.id} title={`${p.name ?? "Unnamed"} · @${String(p.handle ?? "").replace(/^@/, "")}`}
              actions={<span className="text-xs text-zinc-400">{dateIN(item.created_at)}</span>}>
              <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
                {[
                  ["City", p.city], ["State", p.state], ["Languages", p.languages], ["Niches", p.niche_tags],
                  ["Formats", p.formats], ["Followers", p.followers], ["Avg reel views", p.avg_reel_views],
                  ["Reel ₹", p.rate_reel], ["Story ₹", p.rate_story], ["Barter", p.open_to_barter],
                  ["Phone", p.phone], ["WhatsApp", p.whatsapp], ["Email", p.email],
                ].map(([k, v]) => (
                  <div key={k as string} className="flex justify-between gap-2 border-b border-zinc-100 py-1">
                    <dt className="text-zinc-500">{k as string}</dt><dd>{show(v)}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-3 flex gap-2">
                <form action={approvePendingAction}><input type="hidden" name="id" value={item.id} /><button className={btnPrimary}>Approve</button></form>
                <form action={rejectPendingAction}><input type="hidden" name="id" value={item.id} /><button className={btnSecondary}>Reject</button></form>
              </div>
              <p className="mt-2 text-xs text-zinc-400">If the handle already exists, approving links this registration to the existing profile instead of creating a duplicate.</p>
            </Card>
          );
        })
      )}
    </>
  );
}
