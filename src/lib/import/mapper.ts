import Fuse from "fuse.js";
import { THUNDER_FIELDS, type ThunderFieldKey } from "./fields";

/**
 * Rule-based Smart Column Mapping Engine (Zero AI).
 * Steps:
 *  1. Lowercase headers
 *  2. Remove punctuation & extra whitespace
 *  3. Exact field key/label match
 *  4. Synonym dictionary match
 *  5. Fuzzy matching (Fuse.js)
 *  6. Compute confidence score (0..1)
 *  7. Flag low-confidence or conflicting matches for manual review; never assign two columns to one field.
 */

export type MappingMatchKind = "exact" | "synonym" | "fuzzy" | "unmapped";

export interface ColumnMappingSuggestion {
  sourceColumn: string;
  normalizedHeader: string;
  sampleValues: string[];
  targetField: ThunderFieldKey | null;
  confidence: number; // 0..1
  matchKind: MappingMatchKind;
  needsReview: boolean;
  reason: string;
}

export type ColumnMappingRecord = Record<string, ThunderFieldKey | null>;

function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .replace(/[%₹$]/g, (m) => (m === "%" ? " percent " : " "))
    .replace(/[_\-./\\|()[\]{}:;'"!?]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

interface SearchEntry {
  fieldKey: ThunderFieldKey;
  term: string;
  isPrimaryLabel: boolean;
}

const SEARCH_ENTRIES: SearchEntry[] = THUNDER_FIELDS.flatMap((field) => [
  { fieldKey: field.key, term: normalizeHeader(field.label), isPrimaryLabel: true },
  { fieldKey: field.key, term: normalizeHeader(field.key), isPrimaryLabel: true },
  ...field.synonyms.map((syn) => ({ fieldKey: field.key, term: normalizeHeader(syn), isPrimaryLabel: false })),
]);

const EXACT_LOOKUP = new Map<string, { fieldKey: ThunderFieldKey; isPrimary: boolean }>();
for (const entry of SEARCH_ENTRIES) {
  if (!EXACT_LOOKUP.has(entry.term) || entry.isPrimaryLabel) {
    EXACT_LOOKUP.set(entry.term, { fieldKey: entry.fieldKey, isPrimary: entry.isPrimaryLabel });
  }
}

const FUSE = new Fuse(SEARCH_ENTRIES, {
  keys: ["term"],
  includeScore: true,
  threshold: 0.42,
  ignoreLocation: true,
  minMatchCharLength: 2,
});

export function suggestColumnMappings(
  headers: string[],
  rows: Record<string, string>[],
  customSynonyms?: Record<string, ThunderFieldKey>,
): ColumnMappingSuggestion[] {
  const customLookup = new Map<string, ThunderFieldKey>();
  if (customSynonyms) {
    for (const [k, v] of Object.entries(customSynonyms)) {
      customLookup.set(normalizeHeader(k), v);
    }
  }

  // First pass: score every header independently
  const candidates = headers.map((sourceColumn) => {
    const norm = normalizeHeader(sourceColumn);
    const sampleValues = rows
      .map((r) => (r[sourceColumn] ?? "").trim())
      .filter(Boolean)
      .slice(0, 3);

    if (!norm) {
      return {
        sourceColumn,
        normalizedHeader: norm,
        sampleValues,
        targetField: null as ThunderFieldKey | null,
        confidence: 0,
        matchKind: "unmapped" as MappingMatchKind,
        needsReview: false,
        reason: "Empty column heading",
      };
    }

    const customMatch = customLookup.get(norm);
    if (customMatch) {
      return {
        sourceColumn,
        normalizedHeader: norm,
        sampleValues,
        targetField: customMatch,
        confidence: 0.99,
        matchKind: "synonym" as MappingMatchKind,
        needsReview: false,
        reason: "Matched saved workspace mapping rule",
      };
    }

    const exact = EXACT_LOOKUP.get(norm);
    if (exact) {
      const confidence = exact.isPrimary ? 1.0 : 0.94;
      return {
        sourceColumn,
        normalizedHeader: norm,
        sampleValues,
        targetField: exact.fieldKey,
        confidence,
        matchKind: exact.isPrimary ? ("exact" as MappingMatchKind) : ("synonym" as MappingMatchKind),
        needsReview: false,
        reason: exact.isPrimary ? "Exact Thunder field match" : "Synonym dictionary match",
      };
    }

    // Fuzzy search
    const fuzzyHits = FUSE.search(norm);
    if (fuzzyHits.length > 0) {
      const top = fuzzyHits[0];
      const second = fuzzyHits.find((h) => h.item.fieldKey !== top.item.fieldKey);
      const fuseScore = top.score ?? 1; // 0 is best in Fuse
      const confidence = Math.max(0.4, Math.round((1 - fuseScore) * 100) / 100);
      const ambiguous =
        second !== undefined && Math.abs((second.score ?? 1) - fuseScore) < 0.08 && confidence < 0.85;

      // Never auto-assign very weak matches (< 0.55)
      if (confidence < 0.55) {
        return {
          sourceColumn,
          normalizedHeader: norm,
          sampleValues,
          targetField: null,
          confidence,
          matchKind: "unmapped" as MappingMatchKind,
          needsReview: true,
          reason: `Low confidence (${Math.round(confidence * 100)}%) — select manually or ignore`,
        };
      }

      return {
        sourceColumn,
        normalizedHeader: norm,
        sampleValues,
        targetField: top.item.fieldKey,
        confidence,
        matchKind: "fuzzy" as MappingMatchKind,
        needsReview: confidence < 0.78 || ambiguous,
        reason: ambiguous
          ? "Ambiguous fuzzy match — please verify"
          : `Fuzzy match (${Math.round(confidence * 100)}%)`,
      };
    }

    return {
      sourceColumn,
      normalizedHeader: norm,
      sampleValues,
      targetField: null,
      confidence: 0,
      matchKind: "unmapped" as MappingMatchKind,
      needsReview: false,
      reason: "No automatic match found",
    };
  });

  // Second pass: prevent multiple columns from auto-claiming the same destination field.
  const claimed = new Map<ThunderFieldKey, { idx: number; confidence: number }>();
  for (let i = 0; i < candidates.length; i++) {
    const target = candidates[i].targetField;
    if (!target) continue;
    const prev = claimed.get(target);
    if (!prev) {
      claimed.set(target, { idx: i, confidence: candidates[i].confidence });
    } else if (candidates[i].confidence > prev.confidence) {
      // Demote previous weaker claim
      candidates[prev.idx] = {
        ...candidates[prev.idx],
        targetField: null,
        needsReview: true,
        reason: `Conflict with "${candidates[i].sourceColumn}" — review manually`,
      };
      claimed.set(target, { idx: i, confidence: candidates[i].confidence });
    } else {
      candidates[i] = {
        ...candidates[i],
        targetField: null,
        needsReview: true,
        reason: `Duplicate mapping candidate with "${candidates[prev.idx].sourceColumn}"`,
      };
    }
  }

  return candidates;
}

export function mappingRecordFromSuggestions(suggestions: ColumnMappingSuggestion[]): ColumnMappingRecord {
  const out: ColumnMappingRecord = {};
  for (const s of suggestions) {
    out[s.sourceColumn] = s.targetField;
  }
  return out;
}
