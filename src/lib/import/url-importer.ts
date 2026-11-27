import { parseAnySocialInput, type SocialPlatform } from "./cleaner";

/**
 * Bulk social media profile URL / username parser for Quick Import.
 * Does NOT scrape restricted pages or fabricate missing metrics.
 */

export interface ParsedBulkProfileItem {
  lineNumber: number;
  rawInput: string;
  platform: SocialPlatform;
  handle: string | null;
  canonicalUrl: string | null;
  accountId: string | null;
  valid: boolean;
  duplicateInPaste: boolean;
  error?: string;
}

export function parseBulkSocialUrls(rawText: string, maxItems = 1000): ParsedBulkProfileItem[] {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, maxItems);

  const seenKeys = new Set<string>();
  const results: ParsedBulkProfileItem[] = [];

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const parsed = parseAnySocialInput(raw);
    const valid = !parsed.error && Boolean(parsed.canonicalUrl || parsed.handle);

    const dedupeKey = valid
      ? `${parsed.platform}:${(parsed.handle ?? parsed.canonicalUrl ?? "").toLowerCase()}`
      : `invalid:${raw.toLowerCase()}`;

    const duplicateInPaste = valid && seenKeys.has(dedupeKey);
    if (valid) seenKeys.add(dedupeKey);

    results.push({
      lineNumber: i + 1,
      rawInput: raw,
      platform: parsed.platform,
      handle: parsed.handle,
      canonicalUrl: parsed.canonicalUrl,
      accountId: parsed.accountId,
      valid,
      duplicateInPaste,
      error: parsed.error,
    });
  }

  return results;
}
