import type { Filters } from "@/lib/services/filters";
import { btnPrimary, btnSecondary, compactInputCls, Field, filterSelectCls } from "@/components/ui";
import Link from "next/link";
import { CheckboxFilter } from "./checkbox-filter";

type Vocab = { niches: string[]; cities: string[]; languages: string[]; brands: { id: string; name: string }[] };

/** Plain GET form: filters live in the URL, so every search is shareable and bookmarkable. */
export function FilterPanel({ filters: f, vocab, sort }: { filters: Filters; vocab: Vocab; sort: string }) {
  const join = (a?: string[]) => (a ?? []).join(", ");
  const activeCriteriaCount = [
    Boolean(f.languages?.length),
    Boolean(f.gender),
    f.followers_min !== undefined || f.followers_max !== undefined,
    f.worked_before !== undefined,
    Boolean(f.competitor_brand_id),
  ].filter(Boolean).length;
  return (
    <form action="/influencers" method="get" className="space-y-3.5">
      <input type="hidden" name="sort" value={sort} />
      <Field label="Name or handle">
        <input name="q" defaultValue={f.q ?? ""} placeholder="Name or @handle" className={compactInputCls} />
      </Field>
      <Field label="Niches">
        <input name="niches" defaultValue={join(f.niches)} placeholder="Comma separated" list="niche-list" className={compactInputCls} />
        <datalist id="niche-list">{vocab.niches.map((n) => <option key={n} value={n} />)}</datalist>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Cities">
          <input name="cities" defaultValue={join(f.cities)} placeholder="e.g. Delhi" list="city-list" className={compactInputCls} />
          <datalist id="city-list">{vocab.cities.map((n) => <option key={n} value={n} />)}</datalist>
        </Field>
        <Field label="States">
          <input name="states" defaultValue={join(f.states)} placeholder="e.g. NCR" className={compactInputCls} />
        </Field>
      </div>
      <details className="group/criteria">
        <summary className="group flex w-full cursor-pointer list-none items-center justify-between gap-2 border-t border-slate-200/70 pt-2.5 pb-1.5 text-left [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-2 text-xs font-semibold text-slate-700 group-hover:text-slate-900">
            Creator &amp; campaign criteria
            {activeCriteriaCount > 0 && (
              <span className="rounded-full bg-[#ff5a1f]/10 px-1.5 py-0.5 text-[11px] font-medium text-[#ff5a1f]" aria-label={`${activeCriteriaCount} active criteria`}>
                {activeCriteriaCount}
              </span>
            )}
          </span>
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0 text-slate-500 transition-transform duration-200 group-open/criteria:rotate-180 motion-reduce:transition-none">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </summary>
        <div className="space-y-3.5 pt-2">
          <CheckboxFilter key={`languages:${join(f.languages)}`} label="Languages" name="languages" options={vocab.languages} defaultSelected={f.languages} />
          <Field label="Creator gender">
            <select name="gender" defaultValue={f.gender ?? ""} className={filterSelectCls}>
              <option value="">Any</option>
              <option value="female">Female</option>
              <option value="male">Male</option>
              <option value="other">Other</option>
              <option value="mixed">Mixed (couple / group)</option>
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Followers min"><input name="followers_min" type="number" min={0} defaultValue={f.followers_min ?? ""} className={compactInputCls} /></Field>
            <Field label="Followers max"><input name="followers_max" type="number" min={0} defaultValue={f.followers_max ?? ""} className={compactInputCls} /></Field>
          </div>
          <Field label="Worked with us before">
            <select name="worked_before" defaultValue={f.worked_before === undefined ? "" : String(f.worked_before)} className={filterSelectCls}>
              <option value="">Any</option><option value="true">Yes</option><option value="false">No, new to us</option>
            </select>
          </Field>
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <Field label="No competitor promotion for">
                <select name="competitor_brand_id" defaultValue={f.competitor_brand_id ?? ""} className={compactInputCls}>
                  <option value="">No rule</option>
                  {vocab.brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </Field>
            </div>
            <Field label="In last days"><input name="competitor_days" type="number" min={1} defaultValue={f.competitor_days ?? 90} className={compactInputCls} /></Field>
          </div>
        </div>
      </details>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" name="include_blacklisted" value="true" defaultChecked={f.include_blacklisted} /> Include blacklisted
      </label>
      <div className="grid grid-cols-2 items-stretch gap-2">
        <button className={`${btnPrimary} min-h-11 min-w-0 px-2 text-center`}>Apply filters</button>
        <Link href="/influencers" className={`${btnSecondary} min-h-11 min-w-0 px-2`}>Clear</Link>
      </div>
    </form>
  );
}
