import type { CountryCode } from "libphonenumber-js";
import { categorizeInfluencer } from "./categorizer";
import {
  cleanMultilineText,
  cleanText,
  normalizeBoolean,
  normalizeEmail,
  normalizeFacebookUrl,
  normalizeGender,
  normalizeInstagramInput,
  normalizeList,
  normalizePercentage,
  normalizePhone,
  normalizePrice,
  normalizeYouTubeUrl,
  parseAbbreviatedCount,
  parseAnySocialInput,
  standardizeCategories,
} from "./cleaner";
import type { ThunderFieldKey } from "./fields";
import type { ColumnMappingRecord } from "./mapper";
import { classifyPlatformTiers, type PlatformTiers } from "./tiers";

/**
 * Normalisation, validation, categorisation, tiering & 2-level duplicate detection pipeline.
 * Pure TypeScript — runs identically on server and in unit tests.
 */

export type RowClassification =
  | "new"
  | "existing"
  | "duplicate_in_file"
  | "potential_duplicate"
  | "invalid"
  | "requires_review";

export type DuplicateStrategy = "skip" | "update" | "merge";

export interface ExistingInfluencerSnapshot {
  id: string;
  name: string;
  handle: string | null;
  profile_url: string | null;
  youtube_channel_name: string | null;
  youtube_handle: string | null;
  youtube_channel_url: string | null;
  youtube_subscribers: number | null;
  facebook_profile_url: string | null;
  other_profiles: { platform: string; url: string; handle?: string | null }[];
  platform_account_ids: Record<string, string>;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  followers: number | null;
  avg_reel_views: number | null;
  avg_likes: number | null;
  avg_comments: number | null;
  engagement_rate: number | null;
  niche_tags: string[];
  subcategory: string | null;
  bio: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  languages: string[];
  gender: string | null;
  age_group: string | null;
  content_styles: string[];
  formats: string[];
  rate_reel: number | null;
  rate_story: number | null;
  rate_carousel: number | null;
  rate_youtube_video: number | null;
  rate_collab: number | null;
  rate_currency: string | null;
  open_to_barter: boolean;
  gst_registered: boolean | null;
  manager_name: string | null;
  manager_contact: string | null;
  negotiation_notes: string | null;
  tags: string[];
  enrichment_required: boolean;
  platform_tiers: Record<string, string>;
  updated_at?: string;
}

export interface NormalizedInfluencerRecord {
  name: string | null;
  handle: string | null;
  profile_url: string | null;
  youtube_channel_name: string | null;
  youtube_handle: string | null;
  youtube_channel_url: string | null;
  youtube_subscribers: number | null;
  facebook_profile_url: string | null;
  other_profiles: { platform: string; url: string; handle: string | null }[];
  platform_account_ids: Record<string, string>;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  followers: number | null;
  avg_reel_views: number | null;
  avg_likes: number | null;
  avg_comments: number | null;
  engagement_rate: number | null;
  niche_tags: string[];
  subcategory: string | null;
  bio: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  languages: string[];
  gender: "female" | "male" | "other" | "mixed" | null;
  age_group: string | null;
  content_styles: string[];
  formats: string[];
  rate_reel: number | null;
  rate_story: number | null;
  rate_carousel: number | null;
  rate_youtube_video: number | null;
  rate_collab: number | null;
  rate_currency: string | null;
  open_to_barter: boolean | null;
  gst_registered: boolean | null;
  manager_name: string | null;
  manager_contact: string | null;
  negotiation_notes: string | null;
  tags: string[];
  source: "import";
  enrichment_required: boolean;
  platform_tiers: PlatformTiers;
  auto_categorized: boolean;
}

export interface FieldComparison {
  field: string;
  label: string;
  existingValue: string;
  incomingValue: string;
  conflicting: boolean;
}

export interface AnalyzedImportRow {
  rowNumber: number;
  raw: Record<string, string>;
  normalized: NormalizedInfluencerRecord;
  classification: RowClassification;
  errors: string[];
  warnings: string[];
  matchedInfluencerId: string | null;
  matchedInfluencerName: string | null;
  matchReason: string | null;
  duplicateOfRow: number | null;
  comparisons: FieldComparison[];
  excluded: boolean;
}

export interface ImportAnalysisSummary {
  total: number;
  newCount: number;
  existingCount: number;
  duplicateInFileCount: number;
  potentialDuplicateCount: number;
  invalidCount: number;
  requiresReviewCount: number;
  readyToImportCount: number;
}

export interface PipelineOptions {
  defaultCountry?: CountryCode;
  defaultCurrency?: string | null;
  autoCategorize?: boolean;
  allowCategoryOverwrite?: boolean;
  enrichmentRequired?: boolean;
}

function diceCoefficient(a: string, b: string): number {
  const s1 = a.toLowerCase().replace(/[^a-z0-9]/g, "");
  const s2 = b.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!s1 || !s2) return 0;
  if (s1 === s2) return 1;
  if (s1.length < 2 || s2.length < 2) return 0;

  const bigrams = new Map<string, number>();
  for (let i = 0; i < s1.length - 1; i++) {
    const bg = s1.slice(i, i + 2);
    bigrams.set(bg, (bigrams.get(bg) ?? 0) + 1);
  }
  let hits = 0;
  for (let i = 0; i < s2.length - 1; i++) {
    const bg = s2.slice(i, i + 2);
    const count = bigrams.get(bg) ?? 0;
    if (count > 0) {
      bigrams.set(bg, count - 1);
      hits++;
    }
  }
  return (2 * hits) / (s1.length - 1 + (s2.length - 1));
}

function collectMappedValues(raw: Record<string, string>, mapping: ColumnMappingRecord): Partial<Record<ThunderFieldKey, string>> {
  const out: Partial<Record<ThunderFieldKey, string>> = {};
  for (const [col, target] of Object.entries(mapping)) {
    if (!target) continue;
    const val = raw[col];
    if (val !== undefined && val !== "") {
      out[target] = val;
    }
  }
  return out;
}

export function normalizeAndValidateRow(
  raw: Record<string, string>,
  mapping: ColumnMappingRecord,
  options: PipelineOptions = {},
): { normalized: NormalizedInfluencerRecord; errors: string[]; warnings: string[] } {
  const mapped = collectMappedValues(raw, mapping);
  const errors: string[] = [];
  const warnings: string[] = [];
  const defaultCountry = options.defaultCountry ?? "IN";
  const defaultCurrency = options.defaultCurrency ?? null;

  // 1. Social identifiers
  let handle: string | null = null;
  let profileUrl: string | null = null;
  if (mapped.handle) {
    const ig = normalizeInstagramInput(mapped.handle);
    if (ig.error) errors.push(ig.error);
    else {
      handle = ig.handle;
      profileUrl = ig.profileUrl;
    }
  }
  if (mapped.instagram_profile_url) {
    const igUrl = normalizeInstagramInput(mapped.instagram_profile_url);
    if (igUrl.error) errors.push(igUrl.error);
    else if (igUrl.handle) {
      if (handle && handle !== igUrl.handle) {
        warnings.push(`Instagram username (@${handle}) differs from profile URL (@${igUrl.handle}); using profile URL.`);
      }
      handle = igUrl.handle;
      profileUrl = igUrl.profileUrl;
    }
  }

  let youtubeHandle: string | null = null;
  let youtubeUrl: string | null = null;
  let youtubeAccountId: string | null = null;
  if (mapped.youtube_channel_url) {
    const yt = normalizeYouTubeUrl(mapped.youtube_channel_url);
    if (yt.error) errors.push(yt.error);
    else {
      youtubeHandle = yt.handle;
      youtubeUrl = yt.canonicalUrl;
      youtubeAccountId = yt.accountId;
    }
  }

  let facebookUrl: string | null = null;
  let facebookAccountId: string | null = null;
  if (mapped.facebook_profile_url) {
    const fb = normalizeFacebookUrl(mapped.facebook_profile_url);
    if (fb.error) errors.push(fb.error);
    else {
      facebookUrl = fb.canonicalUrl;
      facebookAccountId = fb.accountId;
    }
  }

  const otherProfiles: { platform: string; url: string; handle: string | null }[] = [];
  if (mapped.other_profiles) {
    for (const part of mapped.other_profiles.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean)) {
      const parsed = parseAnySocialInput(part);
      if (parsed.error || !parsed.canonicalUrl) {
        warnings.push(`Skipped unrecognized social profile "${part}": ${parsed.error ?? "invalid URL"}`);
      } else if (parsed.platform === "instagram" && !handle && parsed.handle) {
        handle = parsed.handle;
        profileUrl = parsed.canonicalUrl;
      } else if (parsed.platform === "youtube" && !youtubeUrl && parsed.canonicalUrl) {
        youtubeUrl = parsed.canonicalUrl;
        youtubeHandle = parsed.handle;
      } else if (parsed.platform === "facebook" && !facebookUrl && parsed.canonicalUrl) {
        facebookUrl = parsed.canonicalUrl;
      } else {
        otherProfiles.push({ platform: parsed.platform, url: parsed.canonicalUrl, handle: parsed.handle });
      }
    }
  }

  const platformAccountIds: Record<string, string> = {};
  const explicitPlatformId = cleanText(mapped.platform_account_id);
  if (explicitPlatformId) platformAccountIds.primary = explicitPlatformId;
  if (youtubeAccountId) platformAccountIds.youtube = youtubeAccountId;
  if (facebookAccountId) platformAccountIds.facebook = facebookAccountId;

  // Must have at least one unique social identity
  if (!handle && !youtubeUrl && !youtubeHandle && !facebookUrl && otherProfiles.length === 0) {
    errors.push("Missing social identifier: provide an Instagram handle/URL, YouTube URL, Facebook URL, or other social profile.");
  }

  // 2. Name (fallback to channel name or handle if missing; flag warning if fallback used)
  const youtubeChannelName = cleanText(mapped.youtube_channel_name);
  let name = cleanText(mapped.name) ?? youtubeChannelName;
  if (!name) {
    if (handle) {
      name = handle;
      warnings.push("Name was blank — defaulted to Instagram handle.");
    } else if (youtubeHandle) {
      name = youtubeHandle;
      warnings.push("Name was blank — defaulted to YouTube handle.");
    } else {
      errors.push("Influencer name is required when no username is available.");
    }
  }

  // 3. Contact
  const emailRes = normalizeEmail(mapped.email);
  if (emailRes.error) errors.push(emailRes.error);

  const phoneRes = normalizePhone(mapped.phone, defaultCountry);
  if (phoneRes.error) errors.push(phoneRes.error);

  const waRes = normalizePhone(mapped.whatsapp, defaultCountry);
  if (waRes.error) errors.push(waRes.error);

  // 4. Metrics (never treat missing as 0)
  const followersRes = parseAbbreviatedCount(mapped.followers);
  if (followersRes.error) errors.push(followersRes.error);

  const ytSubsRes = parseAbbreviatedCount(mapped.youtube_subscribers);
  if (ytSubsRes.error) errors.push(ytSubsRes.error);

  const avgViewsRes = parseAbbreviatedCount(mapped.avg_reel_views);
  if (avgViewsRes.error) errors.push(avgViewsRes.error);

  const avgLikesRes = parseAbbreviatedCount(mapped.avg_likes);
  if (avgLikesRes.error) errors.push(avgLikesRes.error);

  const avgCommentsRes = parseAbbreviatedCount(mapped.avg_comments);
  if (avgCommentsRes.error) errors.push(avgCommentsRes.error);

  const erRes = normalizePercentage(mapped.engagement_rate);
  if (erRes.error) errors.push(erRes.error);

  // 5. Pricing
  const reelPrice = normalizePrice(mapped.rate_reel, defaultCurrency);
  if (reelPrice.error) errors.push(reelPrice.error);

  const storyPrice = normalizePrice(mapped.rate_story, defaultCurrency);
  if (storyPrice.error) errors.push(storyPrice.error);

  const postPrice = normalizePrice(mapped.rate_carousel, defaultCurrency);
  if (postPrice.error) errors.push(postPrice.error);

  const ytPrice = normalizePrice(mapped.rate_youtube_video, defaultCurrency);
  if (ytPrice.error) errors.push(ytPrice.error);

  const collabPrice = normalizePrice(mapped.rate_collab, defaultCurrency);
  if (collabPrice.error) errors.push(collabPrice.error);

  const rateCurrency =
    reelPrice.currency ??
    storyPrice.currency ??
    postPrice.currency ??
    ytPrice.currency ??
    collabPrice.currency ??
    defaultCurrency ??
    null;

  // 6. Profile, location, tags & booleans
  const genderRes = normalizeGender(mapped.gender);
  if (genderRes.error) warnings.push(genderRes.error);

  const barterRes = normalizeBoolean(mapped.open_to_barter);
  if (barterRes.error) warnings.push(barterRes.error);

  const gstRes = normalizeBoolean(mapped.gst_registered);
  if (gstRes.error) warnings.push(gstRes.error);

  const bio = cleanMultilineText(mapped.bio);
  const subcategory = cleanText(mapped.subcategory);
  const notes = cleanMultilineText(mapped.negotiation_notes);
  const tagsList = normalizeList(mapped.tags);
  const explicitCategories = standardizeCategories(mapped.niche_tags);

  const autoCat = options.autoCategorize === false
    ? { categories: explicitCategories, autoAssigned: false }
    : categorizeInfluencer(
        {
          explicitCategories,
          bio,
          subcategory,
          tags: tagsList,
          notes,
        },
        { allowOverwrite: options.allowCategoryOverwrite },
      );

  const platformTiers = classifyPlatformTiers({
    followers: followersRes.value,
    youtubeSubscribers: ytSubsRes.value,
  });

  const normalized: NormalizedInfluencerRecord = {
    name,
    handle,
    profile_url: profileUrl,
    youtube_channel_name: youtubeChannelName,
    youtube_handle: youtubeHandle,
    youtube_channel_url: youtubeUrl,
    youtube_subscribers: ytSubsRes.value,
    facebook_profile_url: facebookUrl,
    other_profiles: otherProfiles,
    platform_account_ids: platformAccountIds,
    email: emailRes.value,
    phone: phoneRes.value,
    whatsapp: waRes.value,
    followers: followersRes.value,
    avg_reel_views: avgViewsRes.value,
    avg_likes: avgLikesRes.value,
    avg_comments: avgCommentsRes.value,
    engagement_rate: erRes.value,
    niche_tags: autoCat.categories,
    subcategory,
    bio,
    city: cleanText(mapped.city),
    state: cleanText(mapped.state),
    country: cleanText(mapped.country),
    languages: normalizeList(mapped.languages),
    gender: genderRes.value,
    age_group: cleanText(mapped.age_group),
    content_styles: normalizeList(mapped.content_styles),
    formats: normalizeList(mapped.formats),
    rate_reel: reelPrice.amount,
    rate_story: storyPrice.amount,
    rate_carousel: postPrice.amount,
    rate_youtube_video: ytPrice.amount,
    rate_collab: collabPrice.amount,
    rate_currency: rateCurrency,
    open_to_barter: barterRes.value,
    gst_registered: gstRes.value,
    manager_name: cleanText(mapped.manager_name),
    manager_contact: cleanText(mapped.manager_contact),
    negotiation_notes: notes,
    tags: tagsList,
    source: "import",
    enrichment_required:
      options.enrichmentRequired === true ||
      (followersRes.value === null && ytSubsRes.value === null && !emailRes.value && !phoneRes.value),
    platform_tiers: platformTiers,
    auto_categorized: autoCat.autoAssigned,
  };

  return { normalized, errors, warnings };
}

function stringifyCompareVal(val: unknown): string {
  if (val === null || val === undefined || val === "") return "";
  if (Array.isArray(val)) return val.join(", ");
  return String(val);
}

const COMPARE_FIELDS: { key: keyof ExistingInfluencerSnapshot & keyof NormalizedInfluencerRecord; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "handle", label: "Instagram Handle" },
  { key: "youtube_channel_url", label: "YouTube URL" },
  { key: "facebook_profile_url", label: "Facebook URL" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "followers", label: "Followers" },
  { key: "youtube_subscribers", label: "Subscribers" },
  { key: "engagement_rate", label: "Engagement Rate" },
  { key: "avg_reel_views", label: "Avg Views" },
  { key: "city", label: "City" },
  { key: "state", label: "State" },
  { key: "niche_tags", label: "Category" },
  { key: "rate_reel", label: "Reel Rate" },
  { key: "rate_story", label: "Story Rate" },
  { key: "rate_carousel", label: "Post Rate" },
  { key: "rate_collab", label: "Collab Rate" },
];

export function buildComparisons(existing: ExistingInfluencerSnapshot, incoming: NormalizedInfluencerRecord): FieldComparison[] {
  const out: FieldComparison[] = [];
  for (const f of COMPARE_FIELDS) {
    const ex = stringifyCompareVal(existing[f.key]);
    const inc = stringifyCompareVal(incoming[f.key]);
    if (!ex && !inc) continue;
    const conflicting = Boolean(ex && inc && ex.toLowerCase() !== inc.toLowerCase());
    out.push({ field: f.key, label: f.label, existingValue: ex || "—", incomingValue: inc || "—", conflicting });
  }
  return out;
}

/**
 * Runs 2-level duplicate detection (within-file + against existing DB records)
 * and computes final classifications and summary counts.
 */
export function analyzeImportDataset(
  rows: Record<string, string>[],
  mapping: ColumnMappingRecord,
  existingRecords: ExistingInfluencerSnapshot[],
  options: PipelineOptions = {},
): { rows: AnalyzedImportRow[]; summary: ImportAnalysisSummary } {
  // Build fast lookup indexes for existing DB influencers
  const byIgHandle = new Map<string, ExistingInfluencerSnapshot>();
  const byYtUrl = new Map<string, ExistingInfluencerSnapshot>();
  const byFbUrl = new Map<string, ExistingInfluencerSnapshot>();
  const byPlatformId = new Map<string, ExistingInfluencerSnapshot>();
  const byEmail = new Map<string, ExistingInfluencerSnapshot[]>();
  const byPhone = new Map<string, ExistingInfluencerSnapshot[]>();

  for (const ex of existingRecords) {
    if (ex.handle) byIgHandle.set(ex.handle.toLowerCase(), ex);
    if (ex.youtube_channel_url) byYtUrl.set(ex.youtube_channel_url.toLowerCase(), ex);
    if (ex.facebook_profile_url) byFbUrl.set(ex.facebook_profile_url.toLowerCase(), ex);
    for (const [k, pid] of Object.entries(ex.platform_account_ids ?? {})) {
      if (pid) byPlatformId.set(`${k}:${pid.toLowerCase()}`, ex);
    }
    if (ex.email) {
      const k = ex.email.toLowerCase();
      byEmail.set(k, [...(byEmail.get(k) ?? []), ex]);
    }
    if (ex.phone) {
      byPhone.set(ex.phone, [...(byPhone.get(ex.phone) ?? []), ex]);
    }
  }

  // Track primary identifiers seen earlier in the uploaded file
  const fileSeenIg = new Map<string, number>();
  const fileSeenYt = new Map<string, number>();
  const fileSeenFb = new Map<string, number>();
  const fileSeenPid = new Map<string, number>();
  const fileSeenEmail = new Map<string, number>();
  const fileSeenPhone = new Map<string, number>();

  const analyzed: AnalyzedImportRow[] = [];

  for (let i = 0; i < rows.length; i++) {
    const rowNumber = i + 1;
    const raw = rows[i];
    const { normalized, errors, warnings } = normalizeAndValidateRow(raw, mapping, options);

    if (errors.length > 0) {
      analyzed.push({
        rowNumber,
        raw,
        normalized,
        classification: "invalid",
        errors,
        warnings,
        matchedInfluencerId: null,
        matchedInfluencerName: null,
        matchReason: null,
        duplicateOfRow: null,
        comparisons: [],
        excluded: false,
      });
      continue;
    }

    // Level 1: Within-file duplicate check (primary identifiers first)
    let duplicateOfRow: number | null = null;
    let inFileReason: string | null = null;

    if (normalized.handle && fileSeenIg.has(normalized.handle)) {
      duplicateOfRow = fileSeenIg.get(normalized.handle)!;
      inFileReason = `Duplicate Instagram handle @${normalized.handle} (row ${duplicateOfRow})`;
    } else if (normalized.youtube_channel_url && fileSeenYt.has(normalized.youtube_channel_url.toLowerCase())) {
      duplicateOfRow = fileSeenYt.get(normalized.youtube_channel_url.toLowerCase())!;
      inFileReason = `Duplicate YouTube URL (row ${duplicateOfRow})`;
    } else if (normalized.facebook_profile_url && fileSeenFb.has(normalized.facebook_profile_url.toLowerCase())) {
      duplicateOfRow = fileSeenFb.get(normalized.facebook_profile_url.toLowerCase())!;
      inFileReason = `Duplicate Facebook URL (row ${duplicateOfRow})`;
    } else {
      for (const [k, pid] of Object.entries(normalized.platform_account_ids)) {
        const key = `${k}:${pid.toLowerCase()}`;
        if (fileSeenPid.has(key)) {
          duplicateOfRow = fileSeenPid.get(key)!;
          inFileReason = `Duplicate platform account ID (row ${duplicateOfRow})`;
          break;
        }
      }
    }

    if (duplicateOfRow !== null) {
      analyzed.push({
        rowNumber,
        raw,
        normalized,
        classification: "duplicate_in_file",
        errors: [],
        warnings,
        matchedInfluencerId: null,
        matchedInfluencerName: null,
        matchReason: inFileReason,
        duplicateOfRow,
        comparisons: [],
        excluded: false,
      });
      continue;
    }

    // Register primary keys in file map
    if (normalized.handle) fileSeenIg.set(normalized.handle, rowNumber);
    if (normalized.youtube_channel_url) fileSeenYt.set(normalized.youtube_channel_url.toLowerCase(), rowNumber);
    if (normalized.facebook_profile_url) fileSeenFb.set(normalized.facebook_profile_url.toLowerCase(), rowNumber);
    for (const [k, pid] of Object.entries(normalized.platform_account_ids)) {
      fileSeenPid.set(`${k}:${pid.toLowerCase()}`, rowNumber);
    }

    // Level 2: Existing DB match (Primary identifiers)
    let matched: ExistingInfluencerSnapshot | undefined;
    let matchReason: string | null = null;

    for (const [k, pid] of Object.entries(normalized.platform_account_ids)) {
      const hit = byPlatformId.get(`${k}:${pid.toLowerCase()}`);
      if (hit) {
        matched = hit;
        matchReason = `Matched existing platform account ID (${pid})`;
        break;
      }
    }
    if (!matched && normalized.handle) {
      const hit = byIgHandle.get(normalized.handle);
      if (hit) {
        matched = hit;
        matchReason = `Matched existing Instagram @${normalized.handle}`;
      }
    }
    if (!matched && normalized.youtube_channel_url) {
      const hit = byYtUrl.get(normalized.youtube_channel_url.toLowerCase());
      if (hit) {
        matched = hit;
        matchReason = "Matched existing YouTube channel URL";
      }
    }
    if (!matched && normalized.facebook_profile_url) {
      const hit = byFbUrl.get(normalized.facebook_profile_url.toLowerCase());
      if (hit) {
        matched = hit;
        matchReason = "Matched existing Facebook profile URL";
      }
    }

    if (matched) {
      analyzed.push({
        rowNumber,
        raw,
        normalized,
        classification: "existing",
        errors: [],
        warnings,
        matchedInfluencerId: matched.id,
        matchedInfluencerName: matched.name,
        matchReason,
        duplicateOfRow: null,
        comparisons: buildComparisons(matched, normalized),
        excluded: false,
      });
      continue;
    }

    // Secondary signals only (never auto-merge solely on email/phone/similar name!)
    let potentialMatch: ExistingInfluencerSnapshot | undefined;
    let potentialReason: string | null = null;

    if (normalized.email && byEmail.has(normalized.email.toLowerCase())) {
      potentialMatch = byEmail.get(normalized.email.toLowerCase())![0];
      potentialReason = `Shares email (${normalized.email}) with "${potentialMatch.name}" — review before merging`;
    } else if (normalized.phone && byPhone.has(normalized.phone)) {
      potentialMatch = byPhone.get(normalized.phone)![0];
      potentialReason = `Shares phone (${normalized.phone}) with "${potentialMatch.name}" — review before merging`;
    } else if (normalized.email && fileSeenEmail.has(normalized.email.toLowerCase())) {
      const prevRow = fileSeenEmail.get(normalized.email.toLowerCase())!;
      potentialReason = `Shares email (${normalized.email}) with row ${prevRow} in file`;
      duplicateOfRow = prevRow;
    } else if (normalized.phone && fileSeenPhone.has(normalized.phone)) {
      const prevRow = fileSeenPhone.get(normalized.phone)!;
      potentialReason = `Shares phone (${normalized.phone}) with row ${prevRow} in file`;
      duplicateOfRow = prevRow;
    } else if (normalized.name) {
      for (const ex of existingRecords) {
        if (diceCoefficient(normalized.name, ex.name) >= 0.88) {
          potentialMatch = ex;
          potentialReason = `Similar name to existing influencer "${ex.name}" (@${ex.handle ?? "no-ig"})`;
          break;
        }
      }
    }

    if (normalized.email) fileSeenEmail.set(normalized.email.toLowerCase(), rowNumber);
    if (normalized.phone) fileSeenPhone.set(normalized.phone, rowNumber);

    if (potentialMatch || potentialReason) {
      analyzed.push({
        rowNumber,
        raw,
        normalized,
        classification: "potential_duplicate",
        errors: [],
        warnings,
        matchedInfluencerId: potentialMatch?.id ?? null,
        matchedInfluencerName: potentialMatch?.name ?? null,
        matchReason: potentialReason,
        duplicateOfRow,
        comparisons: potentialMatch ? buildComparisons(potentialMatch, normalized) : [],
        excluded: false,
      });
      continue;
    }

    const classification: RowClassification = warnings.length > 0 ? "requires_review" : "new";
    analyzed.push({
      rowNumber,
      raw,
      normalized,
      classification,
      errors: [],
      warnings,
      matchedInfluencerId: null,
      matchedInfluencerName: null,
      matchReason: null,
      duplicateOfRow: null,
      comparisons: [],
      excluded: false,
    });
  }

  return {
    rows: analyzed,
    summary: summarizeAnalyzedRows(analyzed),
  };
}

export function summarizeAnalyzedRows(rows: AnalyzedImportRow[]): ImportAnalysisSummary {
  let newCount = 0;
  let existingCount = 0;
  let duplicateInFileCount = 0;
  let potentialDuplicateCount = 0;
  let invalidCount = 0;
  let requiresReviewCount = 0;
  let readyToImportCount = 0;

  for (const r of rows) {
    if (r.classification === "new") newCount++;
    else if (r.classification === "existing") existingCount++;
    else if (r.classification === "duplicate_in_file") duplicateInFileCount++;
    else if (r.classification === "potential_duplicate") potentialDuplicateCount++;
    else if (r.classification === "invalid") invalidCount++;
    else if (r.classification === "requires_review") requiresReviewCount++;

    if (!r.excluded && r.classification !== "invalid" && r.classification !== "duplicate_in_file") {
      readyToImportCount++;
    }
  }

  return {
    total: rows.length,
    newCount,
    existingCount,
    duplicateInFileCount,
    potentialDuplicateCount,
    invalidCount,
    requiresReviewCount,
    readyToImportCount,
  };
}

const SCALAR_DB_KEYS = [
  "name",
  "handle",
  "youtube_channel_name",
  "youtube_handle",
  "youtube_channel_url",
  "youtube_subscribers",
  "facebook_profile_url",
  "email",
  "phone",
  "whatsapp",
  "followers",
  "avg_reel_views",
  "avg_likes",
  "avg_comments",
  "engagement_rate",
  "subcategory",
  "bio",
  "city",
  "state",
  "country",
  "gender",
  "age_group",
  "rate_reel",
  "rate_story",
  "rate_carousel",
  "rate_youtube_video",
  "rate_collab",
  "rate_currency",
  "open_to_barter",
  "gst_registered",
  "manager_name",
  "manager_contact",
  "negotiation_notes",
] as const;

const ARRAY_DB_KEYS = ["niche_tags", "languages", "content_styles", "formats", "tags"] as const;

/**
 * Builds the database patch object for an existing influencer according to the
 * chosen DuplicateStrategy ("merge" or "update").
 * Never overwrites existing information with blank/null/empty imported values.
 */
export function buildDbPatchForExisting(
  existing: ExistingInfluencerSnapshot,
  incoming: NormalizedInfluencerRecord,
  strategy: Exclude<DuplicateStrategy, "skip">,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};

  for (const key of SCALAR_DB_KEYS) {
    const incVal = incoming[key];
    if (incVal === null || incVal === undefined || incVal === "") continue;
    const exVal = existing[key];
    const isEmptyExisting = exVal === null || exVal === undefined || exVal === "";

    if (strategy === "update") {
      if (exVal !== incVal) patch[key] = incVal;
    } else if (strategy === "merge" && isEmptyExisting) {
      patch[key] = incVal;
    }
  }

  for (const key of ARRAY_DB_KEYS) {
    const incArr = incoming[key] ?? [];
    if (incArr.length === 0) continue;
    const exArr = existing[key] ?? [];
    if (strategy === "update") {
      patch[key] = incArr;
    } else if (strategy === "merge") {
      const merged = [...new Set([...exArr, ...incArr])];
      if (merged.length > exArr.length) patch[key] = merged;
    }
  }

  // Merge platform_account_ids and platform_tiers without erasing existing keys
  const mergedIds = { ...(existing.platform_account_ids ?? {}), ...(incoming.platform_account_ids ?? {}) };
  if (Object.keys(mergedIds).length > Object.keys(existing.platform_account_ids ?? {}).length) {
    patch.platform_account_ids = mergedIds;
  }

  const mergedTiers = { ...(existing.platform_tiers ?? {}), ...(incoming.platform_tiers ?? {}) };
  if (JSON.stringify(mergedTiers) !== JSON.stringify(existing.platform_tiers ?? {})) {
    patch.platform_tiers = mergedTiers;
  }

  if (incoming.other_profiles.length > 0) {
    const seen = new Set((existing.other_profiles ?? []).map((p) => p.url.toLowerCase()));
    const combined = [...(existing.other_profiles ?? [])];
    for (const p of incoming.other_profiles) {
      if (!seen.has(p.url.toLowerCase())) {
        combined.push(p);
        seen.add(p.url.toLowerCase());
      }
    }
    if (combined.length > (existing.other_profiles ?? []).length) {
      patch.other_profiles = combined;
    }
  }

  return patch;
}

export function buildDbInsertPayload(
  incoming: NormalizedInfluencerRecord,
  workspaceId: string,
  userId: string,
): Record<string, unknown> {
  return {
    workspace_id: workspaceId,
    created_by: userId,
    source: "import",
    name: incoming.name,
    handle: incoming.handle,
    youtube_channel_name: incoming.youtube_channel_name,
    youtube_handle: incoming.youtube_handle,
    youtube_channel_url: incoming.youtube_channel_url,
    youtube_subscribers: incoming.youtube_subscribers,
    facebook_profile_url: incoming.facebook_profile_url,
    other_profiles: incoming.other_profiles,
    platform_account_ids: incoming.platform_account_ids,
    email: incoming.email,
    phone: incoming.phone,
    whatsapp: incoming.whatsapp,
    followers: incoming.followers,
    avg_reel_views: incoming.avg_reel_views,
    avg_likes: incoming.avg_likes,
    avg_comments: incoming.avg_comments,
    engagement_rate: incoming.engagement_rate,
    niche_tags: incoming.niche_tags,
    subcategory: incoming.subcategory,
    bio: incoming.bio,
    city: incoming.city,
    state: incoming.state,
    country: incoming.country,
    languages: incoming.languages,
    gender: incoming.gender,
    age_group: incoming.age_group,
    content_styles: incoming.content_styles,
    formats: incoming.formats,
    rate_reel: incoming.rate_reel,
    rate_story: incoming.rate_story,
    rate_carousel: incoming.rate_carousel,
    rate_youtube_video: incoming.rate_youtube_video,
    rate_collab: incoming.rate_collab,
    rate_currency: incoming.rate_currency ?? "INR",
    open_to_barter: incoming.open_to_barter ?? false,
    gst_registered: incoming.gst_registered,
    manager_name: incoming.manager_name,
    manager_contact: incoming.manager_contact,
    negotiation_notes: incoming.negotiation_notes,
    tags: incoming.tags,
    enrichment_required: incoming.enrichment_required,
    platform_tiers: incoming.platform_tiers,
  };
}
