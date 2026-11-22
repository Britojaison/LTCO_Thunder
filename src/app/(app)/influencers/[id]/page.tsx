import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import { getInfluencer, influencerHistory } from "@/lib/services/influencers";
import { ServiceError } from "@/lib/services/errors";
import { Badge, btnSecondary, Card, FitScore } from "@/components/ui";
import { cap, compact, dateIN, inr, pct } from "@/lib/format";
import { removePromoAction } from "../actions";
import { AddPromoForm, BlacklistControl, DeleteControl } from "./profile-actions";
import { RefreshProfileButton } from "@/components/instagram";

export const metadata = { title: "Influencer" };

export default function InfluencerPage({ params }: PageProps<"/influencers/[id]">) {
  return (
    <Suspense fallback={<p className="text-sm text-zinc-400">Loading…</p>}>
      <Profile params={params} />
    </Suspense>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-zinc-100 py-1.5 text-sm last:border-0">
      <span className="text-zinc-500">{label}</span>
      <span className="text-right text-zinc-900">{children || "–"}</span>
    </div>
  );
}

const one = <T,>(v: T | T[] | null | undefined): T | undefined => (Array.isArray(v) ? v[0] : v ?? undefined);

async function Profile({ params }: { params: PageProps<"/influencers/[id]">["params"] }) {
  const { id } = await params;
  const { db, workspace } = await requireWorkspace();
  const inf = await getInfluencer(db, workspace.id, id).catch((e) => {
    if (e instanceof ServiceError && e.code === "not_found") notFound();
    throw e;
  });
  const history = await influencerHistory(db, workspace.id, id);
  const deleted = Boolean(inf.deleted_at);
  const ratings = [inf.rating_reliability, inf.rating_quality, inf.rating_ease];

  return (
    <section className="space-y-4">
      <Link href="/influencers" className="text-sm text-zinc-500 hover:underline">← Influencers</Link>

      {deleted && <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">This profile is deleted. Restore it within 30 days to keep it.</p>}
      {inf.is_blacklisted && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">Blacklisted{inf.blacklist_reason ? `: ${inf.blacklist_reason}` : ""}</p>
      )}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{inf.name}</h1>
          <a href={inf.profile_url} target="_blank" rel="noreferrer" className="text-sm text-zinc-600 hover:underline">@{inf.handle} ↗</a>
          <div className="mt-2 flex flex-wrap gap-1">
            {(inf.niche_tags as string[]).map((t) => <Badge key={t}>{cap(t)}</Badge>)}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-zinc-500">Base fit</span>
          <FitScore score={inf.fit_base_score !== null ? Math.round(Number(inf.fit_base_score)) : null} />
          {!deleted && <Link href={`/influencers/${id}/edit`} className={btnSecondary}>Edit</Link>}
          {!deleted && <BlacklistControl id={id} blacklisted={inf.is_blacklisted} />}
          <DeleteControl id={id} deleted={deleted} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Audience">
          <Row label="Followers">{compact(inf.followers)}</Row>
          <Row label="Avg reel views">{compact(inf.avg_reel_views)}</Row>
          <Row label="Engagement rate">{pct(inf.engagement_rate)}</Row>
          <Row label="Followers updated">{dateIN(inf.followers_updated_at ?? inf.updated_at)}</Row>
          {!deleted && <div className="pt-2"><RefreshProfileButton id={id} /></div>}
        </Card>
        <Card title="Rates (latest paid)">
          {(["reel", "story", "carousel", "collab"] as const).map((f) => {
            const st = (inf.rate_stats ?? {})[f] as { latest: number; on: string; deals: number } | undefined;
            const v = inf[`rate_${f}` as const];
            return (
              <Row key={f} label={f === "collab" ? "Collab post" : cap(f)}>
                {st ? <>{inr(st.latest)} <span className="text-xs text-zinc-400">paid {dateIN(st.on)}</span></> : v !== null ? <>{inr(v)} <span className="text-xs text-zinc-400">quoted</span></> : "–"}
              </Row>
            );
          })}
          <Row label="Last payout">
            {inf.rate_stats?.all ? <>{inr(inf.rate_stats.all.latest_payout)} <span className="text-xs text-zinc-400">{dateIN(inf.rate_stats.all.on)} · {inf.rate_stats.all.deals} deal{inf.rate_stats.all.deals > 1 ? "s" : ""}</span></> : "–"}
          </Row>
          <Row label="Open to barter">{inf.open_to_barter ? "Yes" : "No"}</Row>
          <Row label="GST registered">{inf.gst_registered === null ? "Unknown" : inf.gst_registered ? "Yes" : "No"}</Row>
        </Card>
        <Card title="Contact">
          <Row label="Location">{[inf.city, inf.state].filter(Boolean).join(", ")}</Row>
          <Row label="Phone">{inf.phone}</Row>
          <Row label="WhatsApp">{inf.whatsapp}</Row>
          <Row label="Email">{inf.email}</Row>
          <Row label="Manager">{inf.manager_contact}</Row>
          <Row label="Languages">{(inf.languages as string[]).map(cap).join(", ")}</Row>
        </Card>
        <Card title="Content">
          <Row label="Styles">{(inf.content_styles as string[]).map(cap).join(", ")}</Row>
          <Row label="Formats">{(inf.formats as string[]).map(cap).join(", ")}</Row>
          <Row label="On camera">{inf.on_camera === null ? "–" : inf.on_camera ? "Yes" : "No"}</Row>
          <Row label="Gender / age">{[cap(inf.gender), inf.age_group].filter(Boolean).join(" · ")}</Row>
          {(inf.sample_posts as string[]).length > 0 && (
            <ul className="mt-2 space-y-1 text-sm">
              {(inf.sample_posts as string[]).map((u) => (
                <li key={u}><a href={u} target="_blank" rel="noreferrer" className="break-all text-zinc-600 hover:underline">{u}</a></li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Team ratings (internal)">
          <Row label="Reliability">{ratings[0] ? `${ratings[0]} / 5` : ""}</Row>
          <Row label="Content quality">{ratings[1] ? `${ratings[1]} / 5` : ""}</Row>
          <Row label="Ease of working">{ratings[2] ? `${ratings[2]} / 5` : ""}</Row>
          {inf.negotiation_notes && <p className="mt-2 whitespace-pre-line text-sm text-zinc-600">{inf.negotiation_notes}</p>}
        </Card>
        <Card title="Rate history">
          {history.rates.length === 0 ? <p className="text-sm text-zinc-400">Filled automatically from agreed deals.</p> : (
            history.rates.map((r) => <Row key={r.id} label={`${cap(r.format)} · ${dateIN(r.effective_date)}`}>{inr(r.amount)}</Row>)
          )}
        </Card>
      </div>

      <Card title="Campaign history">
        {history.deals.length === 0 ? <p className="text-sm text-zinc-400">Not in any campaign yet.</p> : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-zinc-500">
              <tr><th className="py-1">Campaign</th><th>Stage</th><th>Posting date</th><th className="text-right">Payout</th></tr>
            </thead>
            <tbody>
              {history.deals.map((d) => {
                const c = one(d.campaign as unknown as { id: string; name: string; brand: { name: string } | { name: string }[] });
                return (
                  <tr key={d.id} className="border-t border-zinc-100">
                    <td className="py-1.5">{one(c?.brand)?.name ? `${one(c?.brand)?.name} · ` : ""}{c?.name}</td>
                    <td>{one(d.stage as unknown as { name: string })?.name ?? "–"}</td>
                    <td>{dateIN(d.posting_date)}</td>
                    <td className="text-right">{inr(d.payout)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      <Card title="Competitor brands promoted">
        {history.promos.length === 0 && <p className="text-sm text-zinc-400">None recorded. These feed the “no competitor promotion” search filter.</p>}
        <ul className="space-y-1">
          {history.promos.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2 text-sm">
              <span>
                {p.brand_name} · {dateIN(p.promoted_on)}
                {p.post_url && <> · <a href={p.post_url} target="_blank" rel="noreferrer" className="text-zinc-500 hover:underline">post ↗</a></>}
              </span>
              <form action={removePromoAction}>
                <input type="hidden" name="id" value={p.id} />
                <button className="text-xs text-zinc-400 hover:text-red-600">Remove</button>
              </form>
            </li>
          ))}
        </ul>
        {!deleted && <AddPromoForm influencerId={id} />}
      </Card>
    </section>
  );
}
