import type { Filters } from "@/lib/services/filters";
import { btnPrimary, btnSecondary, Field, inputCls } from "@/components/ui";
import Link from "next/link";
import { cap } from "@/lib/format";

type Vocab = { niches: string[]; cities: string[]; languages: string[]; formats: string[]; brands: { id: string; name: string }[] };

/** Plain GET form: filters live in the URL, so every search is shareable and bookmarkable. */
export function FilterPanel({ filters: f, vocab, sort }: { filters: Filters; vocab: Vocab; sort: string }) {
  const join = (a?: string[]) => (a ?? []).join(", ");
  return (
    <form action="/influencers" method="get" className="space-y-4">
      <input type="hidden" name="sort" value={sort} />
      <Field label="Name or handle">
        <input name="q" defaultValue={f.q ?? ""} className={inputCls} />
      </Field>
      <Field label="Niches" hint="Comma separated">
        <input name="niches" defaultValue={join(f.niches)} list="niche-list" className={inputCls} />
        <datalist id="niche-list">{vocab.niches.map((n) => <option key={n} value={n} />)}</datalist>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Cities">
          <input name="cities" defaultValue={join(f.cities)} list="city-list" className={inputCls} />
          <datalist id="city-list">{vocab.cities.map((n) => <option key={n} value={n} />)}</datalist>
        </Field>
        <Field label="States">
          <input name="states" defaultValue={join(f.states)} className={inputCls} />
        </Field>
      </div>
      <fieldset>
        <legend className="text-xs font-medium text-zinc-600">Languages</legend>
        <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-2">
          {vocab.languages.map((l) => (
            <label key={l} className="flex min-w-0 items-center gap-2 text-sm">
              <input className="shrink-0" type="checkbox" name="languages" value={l} defaultChecked={f.languages?.includes(l)} /> {cap(l)}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="text-xs font-medium text-zinc-600">Formats offered</legend>
        <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-2">
          {vocab.formats.map((l) => (
            <label key={l} className="flex min-w-0 items-center gap-2 text-sm">
              <input className="shrink-0" type="checkbox" name="formats" value={l} defaultChecked={f.formats?.includes(l)} /> {cap(l)}
            </label>
          ))}
        </div>
      </fieldset>
      <Field label="Creator gender">
        <select name="gender" defaultValue={f.gender ?? ""} className={inputCls}>
          <option value="">Any</option>
          <option value="female">Female</option>
          <option value="male">Male</option>
          <option value="other">Other</option>
          <option value="mixed">Mixed (couple / group)</option>
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Followers min"><input name="followers_min" type="number" min={0} defaultValue={f.followers_min ?? ""} className={inputCls} /></Field>
        <Field label="Followers max"><input name="followers_max" type="number" min={0} defaultValue={f.followers_max ?? ""} className={inputCls} /></Field>
        <Field label="ER min %"><input name="er_min" type="number" step="0.1" min={0} defaultValue={f.er_min ?? ""} className={inputCls} /></Field>
        <Field label="ER max %"><input name="er_max" type="number" step="0.1" min={0} defaultValue={f.er_max ?? ""} className={inputCls} /></Field>
      </div>
      <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2">
        <Field label="Rate for">
          <select name="rate_format" defaultValue={f.rate_format ?? "reel"} className={inputCls}>
            <option value="reel">Reel</option><option value="story">Story</option>
            <option value="carousel">Carousel</option><option value="collab">Collab</option>
          </select>
        </Field>
        <Field label="Min ₹"><input name="rate_min" type="number" min={0} defaultValue={f.rate_min ?? ""} className={inputCls} /></Field>
        <Field label="Max ₹"><input name="rate_max" type="number" min={0} defaultValue={f.rate_max ?? ""} className={inputCls} /></Field>
      </div>
      <Field label="Worked with us before">
        <select name="worked_before" defaultValue={f.worked_before === undefined ? "" : String(f.worked_before)} className={inputCls}>
          <option value="">Any</option><option value="true">Yes</option><option value="false">No, new to us</option>
        </select>
      </Field>
      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-2">
          <Field label="No competitor promotion for">
            <select name="competitor_brand_id" defaultValue={f.competitor_brand_id ?? ""} className={inputCls}>
              <option value="">No rule</option>
              {vocab.brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </Field>
        </div>
        <Field label="In last days"><input name="competitor_days" type="number" min={1} defaultValue={f.competitor_days ?? 90} className={inputCls} /></Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="include_blacklisted" value="true" defaultChecked={f.include_blacklisted} /> Include blacklisted
      </label>
      <div className="flex items-center gap-2">
        <button className={`${btnPrimary} h-11 min-w-0 flex-1`}>Apply filters</button>
        <Link href="/influencers" className={`${btnSecondary} h-11 min-w-0 flex-1`}>Clear</Link>
      </div>
    </form>
  );
}
