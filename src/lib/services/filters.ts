import { z } from "zod";

/**
 * Influencer search filters. One schema is used for URL params, saved searches,
 * the AI brief parser and the search RPC, so they can never drift apart.
 */

const list = z.array(z.string().trim().toLowerCase().min(1)).max(30).optional();
const num = z.coerce.number().nonnegative().optional();

export const RATE_FORMATS = ["reel", "story", "carousel", "collab"] as const;
export const GENDERS = ["female", "male", "other", "mixed"] as const;
export const SORTS = ["fit", "followers", "er", "rate", "recent"] as const;

export const filtersSchema = z.object({
  q: z.string().trim().max(100).optional(),
  niches: list,
  cities: list,
  states: list,
  languages: list,
  formats: list,
  gender: z.enum(GENDERS).optional(),
  followers_min: num,
  followers_max: num,
  er_min: num,
  er_max: num,
  rate_format: z.enum(RATE_FORMATS).optional(),
  rate_min: num,
  rate_max: num,
  worked_before: z.boolean().optional(),
  include_blacklisted: z.boolean().optional(),
  competitor_brand_id: z.uuid().optional(),
  competitor_days: z.coerce.number().int().min(1).max(730).optional(),
});
export type Filters = z.infer<typeof filtersSchema>;

const LIST_KEYS = ["niches", "cities", "states", "languages", "formats"] as const;
const BOOL_KEYS = ["worked_before", "include_blacklisted"] as const;

type Params = Record<string, string | string[] | undefined>;

/** URL search params → validated filters. Lists are comma-separated. Invalid values are dropped. */
export function filtersFromParams(params: Params): Filters {
  const raw: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    const v = Array.isArray(value) ? value.join(",") : value;
    if (v === undefined || v === "") continue;
    if ((LIST_KEYS as readonly string[]).includes(key)) raw[key] = v.split(",").map((s) => s.trim()).filter(Boolean);
    else if ((BOOL_KEYS as readonly string[]).includes(key)) raw[key] = v === "true" ? true : v === "false" ? false : undefined;
    else raw[key] = v;
  }
  const out: Record<string, unknown> = {};
  const shape = filtersSchema.shape;
  for (const [key, value] of Object.entries(raw)) {
    if (!(key in shape)) continue;
    const parsed = shape[key as keyof typeof shape].safeParse(value);
    if (parsed.success && parsed.data !== undefined) out[key] = parsed.data;
  }
  return out as Filters;
}

/** Filters → URL query string (stable key order, so saved links look the same). */
export function filtersToQuery(filters: Filters, extra: Record<string, string | undefined> = {}): string {
  const sp = new URLSearchParams();
  for (const key of Object.keys(filtersSchema.shape)) {
    const v = filters[key as keyof Filters];
    if (v === undefined || v === null || (Array.isArray(v) && v.length === 0) || v === "") continue;
    sp.set(key, Array.isArray(v) ? v.join(",") : String(v));
  }
  for (const [k, v] of Object.entries(extra)) if (v) sp.set(k, v);
  const s = sp.toString();
  return s ? `?${s}` : "";
}

const inr = (n: number) => `₹${n >= 1000 ? `${+(n / 1000).toFixed(1)}k` : n}`;
const compact = (n: number) => (n >= 1_000_000 ? `${+(n / 1e6).toFixed(1)}M` : n >= 1000 ? `${+(n / 1000).toFixed(1)}k` : `${n}`);

export type Chip = { key: keyof Filters | "followers" | "er" | "rate" | "competitor"; label: string; remove: (keyof Filters)[] };

/** Human-readable chips for active filters. Each chip knows which keys to clear when removed. */
export function filterChips(f: Filters, brandName?: string): Chip[] {
  const chips: Chip[] = [];
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  if (f.q) chips.push({ key: "q", label: `“${f.q}”`, remove: ["q"] });
  if (f.niches?.length) chips.push({ key: "niches", label: `Niche: ${f.niches.map(cap).join(", ")}`, remove: ["niches"] });
  if (f.cities?.length) chips.push({ key: "cities", label: `City: ${f.cities.map(cap).join(", ")}`, remove: ["cities"] });
  if (f.states?.length) chips.push({ key: "states", label: `State: ${f.states.map(cap).join(", ")}`, remove: ["states"] });
  if (f.languages?.length) chips.push({ key: "languages", label: `Language: ${f.languages.map(cap).join(", ")}`, remove: ["languages"] });
  if (f.formats?.length) chips.push({ key: "formats", label: `Format: ${f.formats.map(cap).join(", ")}`, remove: ["formats"] });
  if (f.gender) chips.push({ key: "gender", label: cap(f.gender), remove: ["gender"] });
  if (f.followers_min !== undefined || f.followers_max !== undefined)
    chips.push({
      key: "followers",
      label: `Followers ${f.followers_min !== undefined ? compact(f.followers_min) : "0"}–${f.followers_max !== undefined ? compact(f.followers_max) : "any"}`,
      remove: ["followers_min", "followers_max"],
    });
  if (f.er_min !== undefined || f.er_max !== undefined)
    chips.push({ key: "er", label: `ER ${f.er_min ?? 0}%–${f.er_max !== undefined ? `${f.er_max}%` : "any"}`, remove: ["er_min", "er_max"] });
  if (f.rate_min !== undefined || f.rate_max !== undefined)
    chips.push({
      key: "rate",
      label: `${cap(f.rate_format ?? "reel")} rate ${f.rate_min !== undefined ? inr(f.rate_min) : "₹0"}–${f.rate_max !== undefined ? inr(f.rate_max) : "any"}`,
      remove: ["rate_min", "rate_max", "rate_format"],
    });
  if (f.worked_before !== undefined)
    chips.push({ key: "worked_before", label: f.worked_before ? "Worked with us" : "New to us", remove: ["worked_before"] });
  if (f.include_blacklisted) chips.push({ key: "include_blacklisted", label: "Including blacklisted", remove: ["include_blacklisted"] });
  if (f.competitor_brand_id)
    chips.push({
      key: "competitor",
      label: `No ${brandName ?? "brand"} competitors in ${f.competitor_days ?? 90} days`,
      remove: ["competitor_brand_id", "competitor_days"],
    });
  return chips;
}

export function withoutKeys(f: Filters, keys: (keyof Filters)[]): Filters {
  const copy = { ...f };
  for (const k of keys) delete copy[k];
  return copy;
}
