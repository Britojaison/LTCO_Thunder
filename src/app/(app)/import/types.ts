import type { ThunderFieldKey } from "@/lib/import/fields";
import type { ColumnMappingRecord, ColumnMappingSuggestion } from "@/lib/import/mapper";
import type { ParsedTableResult } from "@/lib/import/parser";
import type { AnalyzedImportRow, DuplicateStrategy, ImportAnalysisSummary } from "@/lib/import/pipeline";

export type ImportSourceType = "csv" | "excel" | "google_sheets" | "urls";

export interface MappingTemplateItem {
  id: string;
  name: string;
  mapping: ColumnMappingRecord;
  options: Record<string, unknown>;
  created_at: string;
}

export interface ParseApiResponse {
  sourceType: ImportSourceType;
  fileName: string;
  fileSize?: number;
  sourceUrl?: string;
  googleApiConfigured?: boolean;
  parsed: ParsedTableResult;
  suggestions: ColumnMappingSuggestion[];
  templates: MappingTemplateItem[];
  limits: { maxBytes: number; maxRows: number };
}

export interface PreviewApiResponse {
  rows: AnalyzedImportRow[];
  summary: ImportAnalysisSummary;
}

export interface ExecuteApiResponse {
  jobId: string;
  idempotentHit: boolean;
  status: string;
  totalProcessed: number;
  created: number;
  updated: number;
  merged: number;
  skipped: number;
  failed: number;
  durationMs: number;
  failedRows: { rowNumber: number; handle: string | null; name: string | null; reason: string }[];
}

export interface ImportJobItem {
  id: string;
  source_type: ImportSourceType;
  file_name: string | null;
  sheet_name: string | null;
  duplicate_strategy: DuplicateStrategy;
  status: string;
  total_rows: number;
  processed_rows: number;
  created_count: number;
  updated_count: number;
  merged_count: number;
  skipped_count: number;
  failed_count: number;
  duration_ms: number | null;
  created_by: string | null;
  created_by_email: string | null;
  started_at: string | null;
  finished_at: string | null;
  rolled_back_at: string | null;
  created_at: string;
}

export interface ImportRowResultItem {
  id: string;
  row_number: number;
  influencer_id: string | null;
  action: string;
  status: string;
  handle: string | null;
  influencer_name: string | null;
  reason: string | null;
  warnings: string[];
  created_at: string;
}

export type { AnalyzedImportRow, ColumnMappingRecord, ColumnMappingSuggestion, DuplicateStrategy, ImportAnalysisSummary, ThunderFieldKey };
