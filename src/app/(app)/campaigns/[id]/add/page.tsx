import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import { getCampaign, campaignInfluencerIds, previousCampaigns, previousCampaignInfluencers } from "@/lib/services/campaigns";
import { searchInfluencers, normalizeHandle, PAGE_SIZE } from "@/lib/services/influencers";
import { filtersFromParams, filtersToQuery, type Filters } from "@/lib/services/filters";
import { workspaceVocab } from "@/lib/services/lists";
import { ServiceError } from "@/lib/services/errors";
import { btnPrimary, btnSecondary, Card, Field, inputCls } from "@/components/ui";
import { CampaignPicker } from "./picker";
import { PreviousPicker } from "./previous-picker";
import { brandProducts } from "@/lib/services/deals";
import { dateIN } from "@/lib/format";
import { QuickAdd } from "../../quick-add";

export const metadata = { title: "Add influencers" };

export default function AddInfluencersPage({ params, searchParams }: PageProps<"/campaigns/[id]/add">) {
  return (
    <section className="space-y-4">
      <Suspense fallback={<p className="text-sm text-zinc-400">Loading…</p>}>
        <Picker params={params} searchParams={searchParams} />
      </Suspense>
    </section>
  );
}

/** One page to add influencers: search the databank, or pick a previous campaign in the same
 *  filter bar to list who worked on it (with how they did). Quick add for new people. */
async function Picker({ params, searchParams }: { params: PageProps<"/campaigns/[id]/add">["params"]; searchParams: PageProps<"/campaigns/[id]/add">["searchParams"] }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const { db, workspace } = await requireWorkspace();
  const campaign = await getCampaign(db, workspace.id, id).catch((e) => {
    if (e instanceof ServiceError && e.code === "not_found") notFound();
    throw e;
  });
  const here = `/campaigns/${id}/add`;

  // Competitor rule for this campaign's brand is on unless the user turns it off.
  const hideCompetitors = sp.competitors !== "show";
  const base = filtersFromParams(sp);
  const filters: Filters = {
    ...base,
    ...(hideCompetitors ? { competitor_brand_id: campaign.brand_id, competitor_days: base.competitor_days ?? 90 } : { competitor_brand_id: undefined }),
  };
  const page = Math.max(1, Number(sp.page) || 1);
  const [inCampaign, vocab, products, options] = await Promise.all([
    campaignInfluencerIds(db, workspace.id, id),
    workspaceVocab(db, workspace.id),
    brandProducts(db, workspace.id, campaign.brand_id),
    previousCampaigns(db, workspace.id, id, campaign.brand_id),
  ]);

  // Previous-campaign mode: ?from=<campaign id> (older links with ?tab=previous pick the latest one).
  const fromParam = typeof sp.from === "string" ? sp.from : sp.tab === "previous" ? options[0]?.id ?? "" : "";
  const source = options.find((o) => o.id === fromParam);
  const q = base.q ? normalizeHandle(base.q) : "";
  const prevRows = source
    ? (await previousCampaignInfluencers(db, workspace.id, source.id)).filter((r) => !q || r.influencer.handle.includes(q) || r.influencer.name.toLowerCase().includes(base.q!.toLowerCase()))
    : [];
  const { rows, total } = source ? { rows: [], total: 0 } : await searchInfluencers(db, workspace.id, filters, "fit", page);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const keep = (extra: Record<string, string | undefined>) =>
    `${here}${filtersToQuery({ ...base, competitor_brand_id: undefined }, { competitors: hideCompetitors ? undefined : "show", ...extra })}`;
  const join = (a?: string[]) => (a ?? []).join(", ");
  const label = (o: (typeof options)[number]) => `${o.name}${o.start_date ? ` (${dateIN(o.start_date)})` : ""} · ${o.count}`;
  const same = options.filter((o) => o.sameBrand), other = options.filter((o) => !o.sameBrand);

  return (
    <>
      <div>
        <Link href={`/campaigns/${id}`} className="text-sm text-zinc-500 hover:underline">← {campaign.brand?.name} · {campaign.name}</Link>
        <h1 className="text-2xl font-semibold">Add influencers</h1>
        <p className="text-sm text-zinc-500">{inCampaign.size} already in this campaign. New additions start as Shortlisted.</p>
      </div>

      <QuickAdd products={products} campaignId={id} defaultOpen={!source && rows.length === 0} defaultHandle={!source && rows.length === 0 && base.q ? base.q : ""} />

      <Card>
        <form action={here} method="get" className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <Field label="From a previous campaign" hint="Lists who worked on it, with results">
            <select name="from" defaultValue={source?.id ?? ""} className={inputCls}>
              <option value="">All influencers (databank)</option>
              {same.length > 0 && <optgroup label={campaign.brand?.name ?? "This brand"}>{same.map((o) => <option key={o.id} value={o.id}>{label(o)}</option>)}</optgroup>}
              {other.length > 0 && <optgroup label="Other brands">{other.map((o) => <option key={o.id} value={o.id}>{o.brand} · {label(o)}</option>)}</optgroup>}
            </select>
          </Field>
          <Field label="Name or handle"><input name="q" defaultValue={base.q ?? ""} className={inputCls} /></Field>
          <Field label="Niches">
            <input name="niches" defaultValue={join(base.niches)} list="pick-niches" className={inputCls} />
            <datalist id="pick-niches">{vocab.niches.map((n) => <option key={n} value={n} />)}</datalist>
          </Field>
          <Field label="Cities">
            <input name="cities" defaultValue={join(base.cities)} list="pick-cities" className={inputCls} />
            <datalist id="pick-cities">{vocab.cities.map((n) => <option key={n} value={n} />)}</datalist>
          </Field>
          <Field label="Languages"><input name="languages" defaultValue={join(base.languages)} className={inputCls} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Min followers"><input name="followers_min" type="number" min={0} defaultValue={base.followers_min ?? ""} className={inputCls} /></Field>
            <Field label="Max followers"><input name="followers_max" type="number" min={0} defaultValue={base.followers_max ?? ""} className={inputCls} /></Field>
          </div>
          <Field label="Max reel rate ₹"><input name="rate_max" type="number" min={0} defaultValue={base.rate_max ?? ""} className={inputCls} /></Field>
          <label className="flex items-center gap-2 text-sm lg:col-span-3">
            <input type="checkbox" name="competitors" value="show" defaultChecked={!hideCompetitors} />
            Include influencers who promoted {campaign.brand?.name}’s competitors in the last 90 days
          </label>
          <div className="flex gap-2 lg:col-span-2 lg:justify-end">
            <button className={btnPrimary}>Search</button>
            <Link href={here} className={btnSecondary}>Clear</Link>
          </div>
        </form>
      </Card>

      {source ? (
        <>
          <p className="text-sm text-zinc-600">
            {prevRows.length} from <span className="font-medium">{source.brand} · {source.name}</span>
            {q && <> matching “{base.q}”</>}. Only name or handle applies here; other filters apply to the databank.
          </p>
          {prevRows.length === 0
            ? <Card><p className="text-sm text-zinc-600">No influencers match in that campaign.</p></Card>
            : <PreviousPicker key={source.id} campaignId={id} sourceId={source.id} sourceName={source.name} rows={prevRows} inCampaign={[...inCampaign]} />}
        </>
      ) : (
        <>
          <p className="text-sm text-zinc-600">
            {total.toLocaleString("en-IN")} {total === 1 ? "match" : "matches"}, best fit first. Not in the databank? Use Quick add above.
          </p>
          {rows.length === 0 ? (
            <Card><p className="text-sm text-zinc-600">No influencers match. Add them with Quick add above, clear a filter, or include competitor promoters.</p></Card>
          ) : (
            <CampaignPicker campaignId={id} rows={rows} inCampaign={[...inCampaign]} />
          )}
          {pages > 1 && (
            <div className="flex items-center justify-between text-sm">
              {page > 1 ? <Link href={keep({ page: String(page - 1) })} className={btnSecondary}>Previous</Link> : <span />}
              <span className="text-zinc-500">Page {page} of {pages}</span>
              {page < pages ? <Link href={keep({ page: String(page + 1) })} className={btnSecondary}>Next</Link> : <span />}
            </div>
          )}
        </>
      )}
    </>
  );
}
