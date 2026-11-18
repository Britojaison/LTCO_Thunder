import "server-only";
import { z } from "zod";
import { ServiceError } from "./errors";
import { filtersSchema, type Filters } from "./filters";

/**
 * Plain-English brief → search filters. The model only ever returns filters (validated
 * against filtersSchema); it never sees or queries the database.
 * Needs ANTHROPIC_API_KEY. BRIEF_SEARCH_MODEL overrides the model.
 */

export function briefSearchEnabled() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

type Vocab = { niches: string[]; cities: string[]; languages: string[]; formats: string[]; brands: { id: string; name: string }[] };

function systemPrompt(v: Vocab) {
  return `You convert an influencer-marketing brief into JSON search filters for an Indian agency's Instagram influencer database.

Return ONLY a JSON object (no prose, no code fences) using any of these optional keys:
- q: string (only for a specific creator name or handle)
- niches: string[] (lowercase; prefer these existing tags: ${v.niches.join(", ") || "none yet"})
- cities: string[] (lowercase; known: ${v.cities.join(", ") || "none yet"})
- states: string[] (lowercase, full state names)
- languages: string[] (lowercase; known: ${v.languages.join(", ")})
- formats: string[] (any of: reel, story, carousel, collab)
- gender: "female" | "male" | "other" | "mixed"  (the creator's gender, only if stated)
- followers_min, followers_max: integers (20k = 20000, 1.2L/lakh = 120000, 1M = 1000000)
- er_min, er_max: engagement rate in percent (e.g. 3 for 3%)
- rate_format: "reel" | "story" | "carousel" | "collab" (which rate the budget refers to; default reel)
- rate_min, rate_max: rupees per post (₹10k = 10000)
- worked_before: true/false (only if the brief says "worked with us" / "new faces")
- competitor_brand_id: one of these brand ids, only if the brief names the brand AND asks to avoid its competitors: ${v.brands.map((b) => `${b.name}=${b.id}`).join(", ") || "none"}
- competitor_days: integer days for that rule (default 90)

Rules: omit anything the brief doesn't say. "mom creators" → niches ["mom"]. Map audience words to niches, not gender, unless the brief explicitly describes the creator's gender.
Example: "Tamil mom creators in Coimbatore, 20k–100k, under ₹10k a reel" →
{"niches":["mom"],"languages":["tamil"],"cities":["coimbatore"],"followers_min":20000,"followers_max":100000,"rate_format":"reel","rate_max":10000}`;
}

const responseSchema = z.object({
  content: z.array(z.object({ type: z.string(), text: z.string().optional() })),
});

export async function briefToFilters(brief: string, vocab: Vocab): Promise<Filters> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new ServiceError("Brief search isn't configured (ANTHROPIC_API_KEY missing).", "validation");
  const text = brief.trim().slice(0, 1000);
  if (!text) throw new ServiceError("Type a brief first.", "validation");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: process.env.BRIEF_SEARCH_MODEL || "claude-haiku-5-5",
      max_tokens: 600,
      system: systemPrompt(vocab),
      messages: [{ role: "user", content: text }],
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new ServiceError(`Brief search failed (${res.status}). Try the filters instead.`);

  const body = responseSchema.parse(await res.json());
  const out = body.content.find((c) => c.type === "text")?.text ?? "";
  const json = out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1);
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new ServiceError("Couldn't understand that brief. Try rephrasing or use the filters.");
  }

  // Keep every valid key, drop invalid ones, so one bad value doesn't lose the rest.
  const result: Record<string, unknown> = {};
  if (raw && typeof raw === "object") {
    for (const [k, v] of Object.entries(raw)) {
      const field = filtersSchema.shape[k as keyof typeof filtersSchema.shape];
      if (!field) continue;
      const parsed = field.safeParse(v);
      if (parsed.success && parsed.data !== undefined) result[k] = parsed.data;
    }
  }
  if (result.competitor_brand_id && !vocab.brands.some((b) => b.id === result.competitor_brand_id)) {
    delete result.competitor_brand_id;
    delete result.competitor_days;
  }
  return result as Filters;
}
