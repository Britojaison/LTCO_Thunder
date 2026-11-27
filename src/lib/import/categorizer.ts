/**
 * Rule-based automatic influencer categorisation (Zero AI).
 * Uses a weighted keyword dictionary across bio, existing category, tags, and notes.
 * Never overwrites manually/explicitly assigned categories unless empty or user-approved.
 */

export interface CategoryRule {
  category: string;
  keywords: { term: string; weight: number }[];
}

export const DEFAULT_CATEGORY_RULES: CategoryRule[] = [
  {
    category: "food",
    keywords: [
      { term: "foodie", weight: 3 },
      { term: "chef", weight: 3 },
      { term: "cooking", weight: 2.5 },
      { term: "recipe", weight: 2.5 },
      { term: "recipes", weight: 2.5 },
      { term: "restaurant", weight: 2 },
      { term: "food blogger", weight: 3.5 },
      { term: "baking", weight: 2 },
      { term: "culinary", weight: 2.5 },
      { term: "kitchen", weight: 1.5 },
    ],
  },
  {
    category: "fashion",
    keywords: [
      { term: "fashion", weight: 3 },
      { term: "outfit", weight: 2.5 },
      { term: "styling", weight: 2.5 },
      { term: "clothing", weight: 2 },
      { term: "wardrobe", weight: 2.5 },
      { term: "streetwear", weight: 2.5 },
      { term: "ootd", weight: 2.5 },
      { term: "menswear", weight: 2.5 },
      { term: "womenswear", weight: 2.5 },
    ],
  },
  {
    category: "beauty",
    keywords: [
      { term: "makeup", weight: 3 },
      { term: "skincare", weight: 3 },
      { term: "cosmetics", weight: 3 },
      { term: "beauty blogger", weight: 3.5 },
      { term: "beauty", weight: 2.5 },
      { term: "mua", weight: 2.5 },
      { term: "haircare", weight: 2 },
      { term: "glam", weight: 1.5 },
    ],
  },
  {
    category: "fitness",
    keywords: [
      { term: "gym", weight: 2.5 },
      { term: "workout", weight: 2.5 },
      { term: "fitness", weight: 3 },
      { term: "yoga", weight: 2.5 },
      { term: "bodybuilding", weight: 3 },
      { term: "nutrition", weight: 2 },
      { term: "pilates", weight: 2.5 },
      { term: "runner", weight: 2 },
      { term: "calisthenics", weight: 2.5 },
    ],
  },
  {
    category: "travel",
    keywords: [
      { term: "travel", weight: 3 },
      { term: "explorer", weight: 2.5 },
      { term: "adventure", weight: 2 },
      { term: "tourism", weight: 2.5 },
      { term: "wanderlust", weight: 2.5 },
      { term: "backpacking", weight: 2.5 },
      { term: "solo traveler", weight: 3 },
    ],
  },
  {
    category: "technology",
    keywords: [
      { term: "tech", weight: 2.5 },
      { term: "technology", weight: 3 },
      { term: "gadgets", weight: 3 },
      { term: "smartphone", weight: 2.5 },
      { term: "electronics", weight: 2.5 },
      { term: "unboxing", weight: 2 },
      { term: "software", weight: 2 },
      { term: "ai tools", weight: 2 },
    ],
  },
  {
    category: "parenting",
    keywords: [
      { term: "mom", weight: 2.5 },
      { term: "mother", weight: 2.5 },
      { term: "parenting", weight: 3.5 },
      { term: "baby", weight: 2 },
      { term: "maternity", weight: 3 },
      { term: "toddler", weight: 2.5 },
      { term: "mommy", weight: 2.5 },
      { term: "dad", weight: 2 },
    ],
  },
  {
    category: "lifestyle",
    keywords: [
      { term: "lifestyle", weight: 3 },
      { term: "daily life", weight: 2.5 },
      { term: "lifestyle blogger", weight: 3.5 },
      { term: "vlog", weight: 1.5 },
      { term: "aesthetic", weight: 1.5 },
      { term: "home decor", weight: 2 },
    ],
  },
  {
    category: "entertainment",
    keywords: [
      { term: "comedy", weight: 3 },
      { term: "actor", weight: 2.5 },
      { term: "actress", weight: 2.5 },
      { term: "entertainer", weight: 3 },
      { term: "comedian", weight: 3 },
      { term: "skit", weight: 2 },
      { term: "standup", weight: 2.5 },
      { term: "meme", weight: 2 },
    ],
  },
  {
    category: "education",
    keywords: [
      { term: "teacher", weight: 3 },
      { term: "education", weight: 3 },
      { term: "learning", weight: 2.5 },
      { term: "tutor", weight: 3 },
      { term: "edtech", weight: 3 },
      { term: "study", weight: 2 },
      { term: "career coach", weight: 2.5 },
    ],
  },
  {
    category: "finance",
    keywords: [
      { term: "finance", weight: 3 },
      { term: "investment", weight: 3 },
      { term: "investing", weight: 3 },
      { term: "money", weight: 2 },
      { term: "trading", weight: 3 },
      { term: "stock market", weight: 3 },
      { term: "personal finance", weight: 3.5 },
      { term: "mutual funds", weight: 3 },
    ],
  },
];

export interface CategorisationResult {
  categories: string[];
  autoAssigned: boolean;
  scores: { category: string; score: number }[];
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Classifies an influencer based on bio, tags, existing category, and notes.
 * If explicitCategories are already provided and allowOverwrite is false,
 * preserves them and does not overwrite.
 */
export function categorizeInfluencer(
  input: {
    explicitCategories?: string[];
    bio?: string | null;
    subcategory?: string | null;
    tags?: string[];
    notes?: string | null;
  },
  options?: {
    rules?: CategoryRule[];
    threshold?: number;
    maxCategories?: number;
    allowOverwrite?: boolean;
  },
): CategorisationResult {
  const explicit = [...new Set((input.explicitCategories ?? []).map((c) => c.trim().toLowerCase()).filter(Boolean))];
  if (explicit.length > 0 && !options?.allowOverwrite) {
    return { categories: explicit, autoAssigned: false, scores: [] };
  }

  const rules = options?.rules ?? DEFAULT_CATEGORY_RULES;
  const threshold = options?.threshold ?? 2.5;
  const maxCategories = options?.maxCategories ?? 3;

  const sources: { text: string; fieldWeight: number }[] = [
    { text: (input.subcategory ?? "").toLowerCase(), fieldWeight: 1.4 },
    { text: (input.tags ?? []).join(" ").toLowerCase(), fieldWeight: 1.3 },
    { text: (input.bio ?? "").toLowerCase(), fieldWeight: 1.0 },
    { text: (input.notes ?? "").toLowerCase(), fieldWeight: 0.7 },
  ].filter((s) => s.text.trim().length > 0);

  if (sources.length === 0) {
    return { categories: explicit, autoAssigned: false, scores: [] };
  }

  const scores: { category: string; score: number }[] = [];
  for (const rule of rules) {
    let total = 0;
    for (const kw of rule.keywords) {
      const rx = new RegExp(`\\b${escapeRegExp(kw.term.toLowerCase())}\\b`, "i");
      for (const src of sources) {
        if (rx.test(src.text)) {
          total += kw.weight * src.fieldWeight;
          break; // Count each keyword once per rule using highest-priority field match
        }
      }
    }
    if (total >= threshold) {
      scores.push({ category: rule.category, score: Math.round(total * 100) / 100 });
    }
  }

  scores.sort((a, b) => b.score - a.score);
  const auto = scores.slice(0, maxCategories).map((s) => s.category);

  if (auto.length === 0) {
    return { categories: explicit, autoAssigned: false, scores: [] };
  }

  return {
    categories: options?.allowOverwrite ? auto : [...new Set([...explicit, ...auto])],
    autoAssigned: true,
    scores,
  };
}
