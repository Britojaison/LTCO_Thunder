import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";
import { z } from "zod";

/**
 * Deterministic, rule-based data cleaning & normalisation utilities.
 * Zero AI APIs. Never fabricates missing data.
 */

const NULL_SENTINELS = new Set(["", "n/a", "na", "null", "none", "nil", "-", "--", "—", "undefined"]);

export function cleanText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).replace(/\u00A0/g, " ").replace(/\s+/g, " ").trim();
  if (!trimmed || NULL_SENTINELS.has(trimmed.toLowerCase())) return null;
  return trimmed;
}

export function cleanMultilineText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = String(value)
    .replace(/\u00A0/g, " ")
    .split(/\r?\n/)
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .trim();
  if (!trimmed || NULL_SENTINELS.has(trimmed.toLowerCase())) return null;
  return trimmed;
}

// ── Instagram normalisation ──────────────────────────────────
const IG_NON_PROFILE_PATH = /^\/(?:p|reel|reels|tv|stories|explore|accounts|direct|oauth|developer|about|legal)\b/i;

export interface NormalizedInstagram {
  handle: string | null;
  profileUrl: string | null;
  error?: string;
}

/**
 * Converts "@creatorname", "creatorname", "instagram.com/creatorname",
 * or "https://www.instagram.com/creatorname/?igsh=..." into a bare lowercase handle.
 * Rejects post/reel/story URLs when a profile is expected.
 */
export function normalizeInstagramInput(raw: unknown): NormalizedInstagram {
  const txt = cleanText(raw);
  if (!txt) return { handle: null, profileUrl: null };

  // Check URL-like strings
  if (/instagram\.com|instagr\.am/i.test(txt) || /^https?:\/\//i.test(txt)) {
    let url: URL;
    try {
      url = new URL(/^https?:\/\//i.test(txt) ? txt : `https://${txt}`);
    } catch {
      return { handle: null, profileUrl: null, error: "Invalid Instagram URL format" };
    }
    const host = url.hostname.toLowerCase().replace(/^www\.|^m\./, "");
    if (host !== "instagram.com" && host !== "instagr.am") {
      return { handle: null, profileUrl: null, error: "URL is not an Instagram profile link" };
    }
    if (IG_NON_PROFILE_PATH.test(url.pathname)) {
      return { handle: null, profileUrl: null, error: "Post, reel, or story URLs cannot be used as a profile URL" };
    }
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length === 0) {
      return { handle: null, profileUrl: null, error: "Instagram URL is missing a username" };
    }
    const candidate = segments[0].replace(/^@/, "").toLowerCase();
    if (!/^[a-z0-9._]{1,30}$/.test(candidate)) {
      return { handle: null, profileUrl: null, error: `Invalid Instagram username "${candidate}"` };
    }
    return {
      handle: candidate,
      profileUrl: `https://www.instagram.com/${candidate}/`,
    };
  }

  // Plain handle / @handle
  const stripped = txt.replace(/^@+/, "").replace(/\/+$/, "").trim().toLowerCase();
  if (!/^[a-z0-9._]{1,30}$/.test(stripped)) {
    return { handle: null, profileUrl: null, error: `Invalid Instagram username "${txt}"` };
  }
  return {
    handle: stripped,
    profileUrl: `https://www.instagram.com/${stripped}/`,
  };
}

// ── Social platform URL normalisation ────────────────────────
export type SocialPlatform = "instagram" | "youtube" | "facebook" | "tiktok" | "x" | "linkedin" | "threads" | "other";

export interface ParsedSocialProfile {
  platform: SocialPlatform;
  handle: string | null;
  canonicalUrl: string | null;
  accountId: string | null;
  error?: string;
}

export function normalizeYouTubeUrl(raw: unknown): ParsedSocialProfile {
  const txt = cleanText(raw);
  if (!txt) return { platform: "youtube", handle: null, canonicalUrl: null, accountId: null };

  // Bare @handle
  if (/^@[a-zA-Z0-9._-]{2,60}$/.test(txt)) {
    const handle = txt.slice(1).toLowerCase();
    return {
      platform: "youtube",
      handle,
      canonicalUrl: `https://www.youtube.com/@${handle}`,
      accountId: null,
    };
  }

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(txt) ? txt : `https://${txt}`);
  } catch {
    return { platform: "youtube", handle: null, canonicalUrl: null, accountId: null, error: "Invalid YouTube URL" };
  }

  const host = url.hostname.toLowerCase().replace(/^www\.|^m\./, "");
  if (host !== "youtube.com" && host !== "youtu.be") {
    return { platform: "youtube", handle: null, canonicalUrl: null, accountId: null, error: "Not a YouTube URL" };
  }
  if (host === "youtu.be" || /^\/(watch|shorts|playlist|live|embed)\b/i.test(url.pathname)) {
    return { platform: "youtube", handle: null, canonicalUrl: null, accountId: null, error: "Video or Shorts links cannot be used as a YouTube channel URL" };
  }

  const segs = url.pathname.split("/").filter(Boolean);
  if (segs.length === 0) {
    return { platform: "youtube", handle: null, canonicalUrl: null, accountId: null, error: "YouTube URL is missing channel identifier" };
  }

  if (segs[0].startsWith("@")) {
    const handle = segs[0].slice(1).toLowerCase();
    return { platform: "youtube", handle, canonicalUrl: `https://www.youtube.com/@${handle}`, accountId: null };
  }
  if (segs[0] === "channel" && segs[1]) {
    return { platform: "youtube", handle: null, canonicalUrl: `https://www.youtube.com/channel/${segs[1]}`, accountId: segs[1] };
  }
  if ((segs[0] === "c" || segs[0] === "user") && segs[1]) {
    const handle = segs[1].toLowerCase();
    return { platform: "youtube", handle, canonicalUrl: `https://www.youtube.com/${segs[0]}/${segs[1]}`, accountId: null };
  }
  const handle = segs[0].toLowerCase();
  return { platform: "youtube", handle, canonicalUrl: `https://www.youtube.com/${segs[0]}`, accountId: null };
}

export function normalizeFacebookUrl(raw: unknown): ParsedSocialProfile {
  const txt = cleanText(raw);
  if (!txt) return { platform: "facebook", handle: null, canonicalUrl: null, accountId: null };

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(txt) ? txt : `https://${txt}`);
  } catch {
    return { platform: "facebook", handle: null, canonicalUrl: null, accountId: null, error: "Invalid Facebook URL" };
  }

  const host = url.hostname.toLowerCase().replace(/^www\.|^m\.|^mbasic\./, "");
  if (host !== "facebook.com" && host !== "fb.com") {
    return { platform: "facebook", handle: null, canonicalUrl: null, accountId: null, error: "Not a Facebook URL" };
  }
  if (/^\/(watch|reel|share|photo|story\.php|groups|events)\b/i.test(url.pathname)) {
    return { platform: "facebook", handle: null, canonicalUrl: null, accountId: null, error: "Post/reel links cannot be used as a Facebook profile URL" };
  }
  if (url.pathname === "/profile.php" && url.searchParams.get("id")) {
    const id = url.searchParams.get("id")!;
    return { platform: "facebook", handle: id, canonicalUrl: `https://www.facebook.com/profile.php?id=${id}`, accountId: id };
  }
  const segs = url.pathname.split("/").filter(Boolean);
  if (segs.length === 0) {
    return { platform: "facebook", handle: null, canonicalUrl: null, accountId: null, error: "Facebook URL is missing profile identifier" };
  }
  const handle = segs[0].toLowerCase();
  return { platform: "facebook", handle, canonicalUrl: `https://www.facebook.com/${segs[0]}`, accountId: null };
}

export function parseAnySocialInput(raw: unknown): ParsedSocialProfile {
  const txt = cleanText(raw);
  if (!txt) return { platform: "other", handle: null, canonicalUrl: null, accountId: null, error: "Empty input" };

  if (/youtube\.com|youtu\.be/i.test(txt)) return normalizeYouTubeUrl(txt);
  if (/facebook\.com|fb\.com/i.test(txt)) return normalizeFacebookUrl(txt);
  if (/instagram\.com|instagr\.am/i.test(txt) || (!/^https?:\/\//i.test(txt) && !txt.includes("."))) {
    const ig = normalizeInstagramInput(txt);
    return { platform: "instagram", handle: ig.handle, canonicalUrl: ig.profileUrl, accountId: null, error: ig.error };
  }

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(txt) ? txt : `https://${txt}`);
  } catch {
    return { platform: "other", handle: null, canonicalUrl: null, accountId: null, error: "Invalid social media URL" };
  }
  const host = url.hostname.toLowerCase().replace(/^www\.|^m\./, "");
  const segs = url.pathname.split("/").filter(Boolean);
  const firstSeg = segs[0]?.replace(/^@/, "").toLowerCase() ?? null;

  if (host === "tiktok.com") {
    return { platform: "tiktok", handle: firstSeg, canonicalUrl: firstSeg ? `https://www.tiktok.com/@${firstSeg}` : null, accountId: null, error: firstSeg ? undefined : "Missing TikTok handle" };
  }
  if (host === "twitter.com" || host === "x.com") {
    return { platform: "x", handle: firstSeg, canonicalUrl: firstSeg ? `https://x.com/${firstSeg}` : null, accountId: null, error: firstSeg ? undefined : "Missing X handle" };
  }
  if (host === "linkedin.com") {
    const slug = segs[1] ?? firstSeg;
    return { platform: "linkedin", handle: slug?.toLowerCase() ?? null, canonicalUrl: `https://www.linkedin.com/${segs.slice(0, 2).join("/")}`, accountId: null, error: slug ? undefined : "Missing LinkedIn profile" };
  }
  if (host === "threads.net" || host === "threads.com") {
    return { platform: "threads", handle: firstSeg, canonicalUrl: firstSeg ? `https://www.threads.net/@${firstSeg}` : null, accountId: null, error: firstSeg ? undefined : "Missing Threads handle" };
  }

  return {
    platform: "other",
    handle: firstSeg,
    canonicalUrl: `${url.protocol}//${url.hostname}${url.pathname.replace(/\/+$/, "")}`,
    accountId: null,
  };
}

// ── Follower / abbreviated number parsing ────────────────────
/**
 * Parses international and Indian abbreviated numbers:
 * "10K" -> 10000, "25.5K" -> 25500, "1.2M" -> 1200000,
 * "2L" -> 200000, "1.5Cr" -> 15000000, "1,50,000" -> 150000.
 */
export function parseAbbreviatedCount(raw: unknown): { value: number | null; error?: string } {
  const txt = cleanText(raw);
  if (!txt) return { value: null };

  const cleaned = txt.replace(/[,\s_]/g, "").toLowerCase();
  const match = cleaned.match(/^([+-]?\d+(?:\.\d+)?)(k|m|b|l|lac|lakh|lakhs|cr|crore|crores)?$/i);
  if (!match) {
    return { value: null, error: `Invalid numeric count "${txt}"` };
  }

  const num = Number(match[1]);
  if (!Number.isFinite(num) || num < 0) {
    return { value: null, error: `Count must be a non-negative number ("${txt}")` };
  }

  const suffix = (match[2] ?? "").toLowerCase();
  let multiplier = 1;
  if (suffix === "k") multiplier = 1_000;
  else if (suffix === "m") multiplier = 1_000_000;
  else if (suffix === "b") multiplier = 1_000_000_000;
  else if (suffix === "l" || suffix === "lac" || suffix === "lakh" || suffix === "lakhs") multiplier = 100_000;
  else if (suffix === "cr" || suffix === "crore" || suffix === "crores") multiplier = 10_000_000;

  return { value: Math.round(num * multiplier) };
}

// ── Pricing / currency normalisation ─────────────────────────
export interface NormalizedPrice {
  amount: number | null;
  currency: string | null;
  error?: string;
}

const CURRENCY_PATTERNS: [RegExp, string][] = [
  [/₹|\binr\b|\brs\.?(?=\s|\d|$)/gi, "INR"],
  [/\$|\busd\b/gi, "USD"],
  [/€|\beur\b/gi, "EUR"],
  [/£|\bgbp\b/gi, "GBP"],
  [/\baed\b/gi, "AED"],
  [/\bsgd\b/gi, "SGD"],
];

/**
 * Normalises pricing like "₹5,000" -> { amount: 5000, currency: "INR" },
 * "Rs. 10000" -> { amount: 10000, currency: "INR" },
 * "15K" -> { amount: 15000, currency: defaultCurrency ?? null }.
 * Never fabricates currency if undetermined and no defaultCurrency is provided.
 */
export function normalizePrice(raw: unknown, defaultCurrency: string | null = null): NormalizedPrice {
  const txt = cleanText(raw);
  if (!txt) return { amount: null, currency: null };

  let detectedCurrency: string | null = null;
  let working = txt;

  for (const [pattern, code] of CURRENCY_PATTERNS) {
    if (pattern.test(working)) {
      detectedCurrency = code;
      working = working.replace(pattern, " ").trim();
      break;
    }
  }

  const parsed = parseAbbreviatedCount(working);
  if (parsed.error || parsed.value === null) {
    return { amount: null, currency: null, error: `Invalid price "${txt}"` };
  }

  return {
    amount: parsed.value,
    currency: detectedCurrency ?? (defaultCurrency || null),
  };
}

// ── Engagement rate / percentage normalisation ───────────────
export function normalizePercentage(raw: unknown): { value: number | null; error?: string } {
  const txt = cleanText(raw);
  if (!txt) return { value: null };
  const stripped = txt.replace(/[%\s,]/g, "");
  const num = Number(stripped);
  if (!Number.isFinite(num) || num < 0 || num > 100) {
    return { value: null, error: `Engagement rate must be between 0% and 100% ("${txt}")` };
  }
  return { value: Math.round(num * 1000) / 1000 };
}

// ── Email normalisation & validation ─────────────────────────
export function normalizeEmail(raw: unknown): { value: string | null; error?: string } {
  const txt = cleanText(raw);
  if (!txt) return { value: null };

  // Remove accidental internal whitespace around @ or dots
  const compact = txt.replace(/\s+/g, "");
  const atIndex = compact.lastIndexOf("@");
  if (atIndex <= 0) {
    return { value: null, error: `Invalid email format "${txt}"` };
  }
  const local = compact.slice(0, atIndex);
  const domain = compact.slice(atIndex + 1).toLowerCase();
  const normalized = `${local}@${domain}`;

  if (!z.email().safeParse(normalized).success) {
    return { value: null, error: `Invalid email format "${txt}"` };
  }
  return { value: normalized };
}

// ── Phone / WhatsApp normalisation ───────────────────────────
export function normalizePhone(raw: unknown, defaultCountry: CountryCode = "IN"): { value: string | null; error?: string } {
  const txt = cleanText(raw);
  if (!txt) return { value: null };

  // Strip labels like "ph:", spaces, parentheses, dashes, dots; keep leading +
  let cleaned = txt.replace(/^(?:ph|phone|mob|mobile|wa|whatsapp)[:.\s-]*/i, "").trim();
  // Reject scientific notation from broken Excel cells (e.g. "9.87654E+09")
  if (/^\d+(?:\.\d+)?e[+-]?\d+$/i.test(cleaned)) {
    return { value: null, error: `Phone number "${txt}" appears corrupted by spreadsheet scientific notation` };
  }

  cleaned = cleaned.replace(/[^\d+]/g, "");
  if (!cleaned) return { value: null, error: `Invalid phone number "${txt}"` };

  // Handle "00" international prefix
  if (cleaned.startsWith("00")) cleaned = `+${cleaned.slice(2)}`;

  const parsed = parsePhoneNumberFromString(cleaned, defaultCountry);
  if (!parsed || !parsed.isValid()) {
    return { value: null, error: `Invalid phone number "${txt}" (default region ${defaultCountry})` };
  }

  return { value: parsed.number }; // E.164 string e.g. "+919876543210"
}

// ── Lists, booleans & category standardisation ───────────────
export function normalizeList(raw: unknown): string[] {
  const txt = cleanText(raw);
  if (!txt) return [];
  const items = txt
    .split(/[,;|/\n]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s && !NULL_SENTINELS.has(s));
  return [...new Set(items)];
}

export function normalizeBoolean(raw: unknown): { value: boolean | null; error?: string } {
  if (typeof raw === "boolean") return { value: raw };
  const txt = cleanText(raw)?.toLowerCase();
  if (!txt) return { value: null };
  if (["true", "yes", "y", "1", "on", "available"].includes(txt)) return { value: true };
  if (["false", "no", "n", "0", "off", "unavailable"].includes(txt)) return { value: false };
  return { value: null, error: `Invalid yes/no value "${txt}"` };
}

export function normalizeGender(raw: unknown): { value: "female" | "male" | "other" | "mixed" | null; error?: string } {
  const txt = cleanText(raw)?.toLowerCase();
  if (!txt) return { value: null };
  if (["f", "female", "woman", "girl"].includes(txt)) return { value: "female" };
  if (["m", "male", "man", "boy"].includes(txt)) return { value: "male" };
  if (["mixed", "couple", "group", "duo"].includes(txt)) return { value: "mixed" };
  if (["other", "non-binary", "nonbinary", "nb"].includes(txt)) return { value: "other" };
  return { value: null, error: `Unsupported gender value "${txt}"` };
}

const CATEGORY_ALIASES: Record<string, string> = {
  "food & beverage": "food",
  "food and beverage": "food",
  "f&b": "food",
  "cooking": "food",
  "foodie": "food",
  "culinary": "food",
  "apparel": "fashion",
  "style": "fashion",
  "clothing": "fashion",
  "makeup": "beauty",
  "skincare": "beauty",
  "cosmetics": "beauty",
  "health & fitness": "fitness",
  "health": "fitness",
  "wellness": "fitness",
  "yoga": "fitness",
  "tech": "technology",
  "gadgets": "technology",
  "electronics": "technology",
  "mom": "parenting",
  "family": "parenting",
  "motherhood": "parenting",
  "comedy": "entertainment",
  "acting": "entertainment",
  "movies": "entertainment",
  "edtech": "education",
  "learning": "education",
  "fintech": "finance",
  "investing": "finance",
  "personal finance": "finance",
};

export function standardizeCategories(raw: unknown): string[] {
  const items = normalizeList(raw);
  return [...new Set(items.map((item) => CATEGORY_ALIASES[item] ?? item))];
}
