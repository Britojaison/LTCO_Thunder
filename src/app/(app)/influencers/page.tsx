import Link from "next/link";
import { Suspense } from "react";
import { requireWorkspace } from "@/lib/auth";
import { filterChips, filtersFromParams, filtersToQuery, withoutKeys, SORTS } from "@/lib/services/filters";
import { searchInfluencers, countPending, PAGE_SIZE } from "@/lib/services/influencers";
import { workspaceVocab } from "@/lib/services/lists";
import { listSavedSearches } from "@/lib/services/saved-searches";
import { listOpenCampaigns } from "@/lib/services/campaigns";
import { briefSearchEnabled } from "@/lib/services/brief-search";
import { btnPrimary, btnSecondary, Card } from "@/components/ui";
import { BriefSearchForm } from "./brief-search-form";
import { FilterPanel } from "./filter-panel";
import { ResultsTable } from "./results-table";
import { SaveSearchForm } from "./save-search-form";
import { deleteSavedSearchAction } from "./actions";

export const metadata = { title: "Influencers" };

export default function InfluencersPage({ searchParams }: PageProps<"/influencers">) {
  return (
    <section className="space-y-4">
      <Suspense fallback={<p className="text-sm text-zinc-400">Loading…</p>}>
        <SearchView searchParams={searchParams} />
      </Suspense>
    </section>
  );
}

const SORT_LABELS: Record<string, string> = { fit: "Best fit", followers: "Followers", er: "Engagement", rate: "Lowest rate", recent: "Recently added" };

async function SearchView({ searchParams }: { searchParams: PageProps<"/influencers">["searchParams"] }) {
  const sp = await searchParams;
  const { db, workspace } = await requireWorkspace();
  const filters = filtersFromParams(sp);
  const sort = (SORTS as readonly string[]).includes(String(sp.sort)) ? String(sp.sort) : "fit";
  const page = Math.max(1, Number(sp.page) || 1);
  const brief = typeof sp.brief === "string" ? sp.brief : undefined;

  const [{ rows, total }, vocab, saved, campaigns, pending] = await Promise.all([
    searchInfluencers(db, workspace.id, filters, sort, page),
    workspaceVocab(db, workspace.id),
    listSavedSearches(db, workspace.id),
    listOpenCampaigns(db, workspace.id),
    countPending(db, workspace.id),
  ]);

  const brandName = vocab.brands.find((b) => b.id === filters.competitor_brand_id)?.name;
  const chips = filterChips(filters, brandName);
  const query = filtersToQuery(filters);
  const link = (extra: Record<string, string | undefined>) => `/influencers${filtersToQuery(filters, { sort, ...extra })}`;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#ff5a1f]">Creator network</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-[#18191c]">Influencers</h1>
          <p className="mt-1 text-sm text-[#6b7280]">Discover, filter, and manage your creator relationships.</p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Link href="/influencers" aria-current="page" className={`${btnSecondary} h-11 whitespace-nowrap`}>All influencers</Link>
          <Link href="/influencers/pending" className={`${btnSecondary} h-11 whitespace-nowrap`}>
            Review queue{pending ? ` (${pending})` : ""}
          </Link>
          <Link href="/influencers/new" className={`${btnPrimary} h-11 whitespace-nowrap`}><span aria-hidden="true" className="mr-2 text-lg leading-none">+</span>Add Influencer</Link>
        </div>
      </div>

      <BriefSearchForm initial={brief} enabled={briefSearchEnabled()} />

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {chips.map((c) => (
            <Link key={c.label} href={`/influencers${filtersToQuery(withoutKeys(filters, c.remove), { sort })}`}
              className="inline-flex items-center gap-1 rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs text-orange-800 hover:border-orange-400">
              {c.label} <span aria-hidden className="text-zinc-400">×</span>
              <span className="sr-only">Remove filter</span>
            </Link>
          ))}
          <Link href="/influencers" className="text-xs text-zinc-500 underline">Clear all</Link>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <aside className="space-y-4">
          <Card title="Filters" actions={<span className="flex items-center gap-2 text-zinc-400" aria-hidden="true"><svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 5h16l-6.5 7.5V19l-3 1v-7.5L4 5Z" /></svg><span className="text-xs">⌃</span></span>}><FilterPanel filters={filters} vocab={vocab} sort={sort} /></Card>
          <Card title="Saved searches">
            {saved.length === 0 && <p className="mb-2 text-xs text-zinc-400">None yet.</p>}
            <ul className="mb-3 space-y-1">
              {saved.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2 text-sm">
                  <Link href={`/influencers${filtersToQuery(s.filters)}`} className="truncate hover:underline">{s.name}</Link>
                  <form action={deleteSavedSearchAction}>
                    <input type="hidden" name="id" value={s.id} />
                    <button className="text-xs text-zinc-400 hover:text-red-600" aria-label={`Delete ${s.name}`}>×</button>
                  </form>
                </li>
              ))}
            </ul>
            {query && <SaveSearchForm query={query.slice(1)} />}
          </Card>
        </aside>

        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <p className="text-zinc-600">{total.toLocaleString("en-IN")} {total === 1 ? "match" : "matches"}</p>
            <div className="flex flex-wrap gap-1">
              {SORTS.map((s) => (
                <Link key={s} href={link({ sort: s })}
                  className={`rounded-full px-3 py-1.5 text-xs ${s === sort ? "bg-[#ff5a1f] text-white" : "text-zinc-600 hover:bg-white"}`}>
                  {SORT_LABELS[s]}
                </Link>
              ))}
            </div>
          </div>

          {rows.length === 0 ? (
            <Card>
              <p className="text-sm text-zinc-600">
                {chips.length ? "No influencers match these filters. Remove a chip to widen the search." : "No influencers yet."}
              </p>
              {!chips.length && <Link href="/influencers/new" className={`${btnPrimary} mt-3`}>Add your first influencer</Link>}
            </Card>
          ) : (
            <ResultsTable rows={rows} campaigns={campaigns} rateFormat={filters.rate_format ?? "reel"} />
          )}

          {pages > 1 && (
            <div className="flex items-center justify-between text-sm">
              {page > 1 ? <Link href={link({ page: String(page - 1) })} className={btnSecondary}>Previous</Link> : <span />}
              <span className="text-zinc-500">Page {page} of {pages}</span>
              {page < pages ? <Link href={link({ page: String(page + 1) })} className={btnSecondary}>Next</Link> : <span />}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
