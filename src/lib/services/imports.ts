import type { CountryCode } from "libphonenumber-js";
import * as XLSX from "xlsx";
import { z } from "zod";
import type { Db } from "@/lib/supabase/server";
import { ServiceError, fromDb } from "./errors";
import {
  EXPORT_TEMPLATE_COLUMNS,
  THUNDER_FIELDS,
} from "@/lib/import/fields";
import { buildCsvDocument, DEFAULT_MAX_ROWS } from "@/lib/import/parser";
import type { ColumnMappingRecord } from "@/lib/import/mapper";
import {
  analyzeImportDataset,
  buildDbInsertPayload,
  buildDbPatchForExisting,
  summarizeAnalyzedRows,
  type AnalyzedImportRow,
  type DuplicateStrategy,
  type ExistingInfluencerSnapshot,
  type PipelineOptions,
} from "@/lib/import/pipeline";

/**
 * Backend Import Services (plain functions, no Next.js imports).
 * Handles permissions, rate limiting, template persistence, batch execution,
 * idempotency, concurrency-safe duplicate resolution, reporting & safe rollback.
 */

export type MemberRole = "owner" | "admin" | "member" | "viewer";

const MAX_IMPORTS_PER_HOUR = Number(process.env.IMPORT_RATE_LIMIT_PER_HOUR) || 30;
const BATCH_SIZE = 50;

const EXISTING_SELECT_FIELDS = [
  "id",
  "name",
  "handle",
  "profile_url",
  "youtube_channel_name",
  "youtube_handle",
  "youtube_channel_url",
  "youtube_subscribers",
  "facebook_profile_url",
  "other_profiles",
  "platform_account_ids",
  "email",
  "phone",
  "whatsapp",
  "followers",
  "avg_reel_views",
  "avg_likes",
  "avg_comments",
  "engagement_rate",
  "niche_tags",
  "subcategory",
  "bio",
  "city",
  "state",
  "country",
  "languages",
  "gender",
  "age_group",
  "content_styles",
  "formats",
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
  "tags",
  "enrichment_required",
  "platform_tiers",
  "updated_at",
].join(",");

// ── Permissions & Rate Limiting ──────────────────────────────
export async function getMemberRole(db: Db, workspaceId: string, userId: string): Promise<MemberRole> {
  const { data, error } = await db
    .from("workspace_members_thunder")
    // Select the membership row rather than only `role`. Older Thunder schemas
    // predate workspace roles; in those databases the missing field should use
    // the backwards-compatible admin default instead of making imports fail.
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();
  fromDb(error, "Checking member permissions");
  if (!data) throw new ServiceError("You are not a member of this workspace.", "forbidden");
  return (data.role as MemberRole) ?? "admin";
}

export async function requireImportPermission(db: Db, workspaceId: string, userId: string): Promise<MemberRole> {
  const role = await getMemberRole(db, workspaceId, userId);
  if (role === "viewer") {
    throw new ServiceError("Viewers do not have permission to import or modify influencers.", "forbidden");
  }
  return role;
}

export async function checkImportRateLimit(db: Db, workspaceId: string) {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error } = await db
    .from("import_jobs_thunder")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .gte("created_at", since);
  fromDb(error, "Checking import rate limit");
  if ((count ?? 0) >= MAX_IMPORTS_PER_HOUR) {
    throw new ServiceError(
      `Import rate limit reached (${MAX_IMPORTS_PER_HOUR} imports per hour). Please wait before starting another import.`,
      "validation",
    );
  }
}

// ── Existing Influencers Loader ──────────────────────────────
export async function loadExistingInfluencersForDedupe(
  db: Db,
  workspaceId: string,
): Promise<ExistingInfluencerSnapshot[]> {
  const all: ExistingInfluencerSnapshot[] = [];
  const pageSize = 1000;
  for (let offset = 0; offset < 25_000; offset += pageSize) {
    const { data, error } = await db
      .from("influencers_thunder")
      .select(EXISTING_SELECT_FIELDS)
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .range(offset, offset + pageSize - 1);
    fromDb(error, "Loading existing influencers");
    const batch = (data ?? []) as unknown as ExistingInfluencerSnapshot[];
    all.push(...batch);
    if (batch.length < pageSize) break;
  }
  return all;
}

// ── Preview / Validation ─────────────────────────────────────
export async function prepareImportPreview(
  db: Db,
  workspaceId: string,
  userId: string,
  input: {
    rows: Record<string, string>[];
    mapping: ColumnMappingRecord;
    options?: PipelineOptions;
  },
) {
  await requireImportPermission(db, workspaceId, userId);
  if (!Array.isArray(input.rows) || input.rows.length === 0) {
    throw new ServiceError("No rows provided to validate.", "validation");
  }
  if (input.rows.length > DEFAULT_MAX_ROWS) {
    throw new ServiceError(`Maximum ${DEFAULT_MAX_ROWS} rows per import.`, "validation");
  }

  const existing = await loadExistingInfluencersForDedupe(db, workspaceId);
  return analyzeImportDataset(input.rows, input.mapping, existing, input.options);
}

// ── Mapping Templates ────────────────────────────────────────
export interface MappingTemplate {
  id: string;
  name: string;
  mapping: ColumnMappingRecord;
  options: Record<string, unknown>;
  created_at: string;
}

export async function listMappingTemplates(db: Db, workspaceId: string): Promise<MappingTemplate[]> {
  const { data, error } = await db
    .from("import_mapping_templates_thunder")
    .select("id, name, mapping, options, created_at")
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .order("name");
  if (error?.code === "PGRST205" || error?.code === "42P01") {
    throw new ServiceError(
      "Influencer import is unavailable because its database tables are missing from the API. Ask your administrator to verify that migration 20261126000018_smart_import.sql has been applied to Thunder’s Supabase project.",
    );
  }
  fromDb(error, "Loading mapping templates");
  return (data ?? []) as MappingTemplate[];
}

export async function saveMappingTemplate(
  db: Db,
  workspaceId: string,
  userId: string,
  input: { name: string; mapping: ColumnMappingRecord; options?: Record<string, unknown> },
) {
  await requireImportPermission(db, workspaceId, userId);
  const parsedName = z.string().trim().min(1, "Template name is required").max(120).safeParse(input.name);
  if (!parsedName.success) throw new ServiceError(parsedName.error.issues[0].message, "validation");

  const validKeys = new Set(THUNDER_FIELDS.map((f) => f.key));
  const sanitizedMapping: ColumnMappingRecord = {};
  for (const [col, target] of Object.entries(input.mapping ?? {})) {
    if (target === null) sanitizedMapping[col] = null;
    else if (validKeys.has(target)) sanitizedMapping[col] = target;
  }

  const { data: existing } = await db
    .from("import_mapping_templates_thunder")
    .select("id")
    .eq("workspace_id", workspaceId)
    .ilike("name", parsedName.data)
    .is("deleted_at", null)
    .maybeSingle();

  if (existing) {
    const { data, error } = await db
      .from("import_mapping_templates_thunder")
      .update({ mapping: sanitizedMapping, options: input.options ?? {} })
      .eq("workspace_id", workspaceId)
      .eq("id", existing.id)
      .select("id, name, mapping, options, created_at")
      .single();
    fromDb(error, "Updating mapping template");
    return data as MappingTemplate;
  }

  const { data, error } = await db
    .from("import_mapping_templates_thunder")
    .insert({
      workspace_id: workspaceId,
      name: parsedName.data,
      mapping: sanitizedMapping,
      options: input.options ?? {},
      created_by: userId,
    })
    .select("id, name, mapping, options, created_at")
    .single();
  fromDb(error, "Saving mapping template");
  return data as MappingTemplate;
}

export async function deleteMappingTemplate(db: Db, workspaceId: string, userId: string, templateId: string) {
  await requireImportPermission(db, workspaceId, userId);
  if (!z.uuid().safeParse(templateId).success) throw new ServiceError("Template not found", "not_found");
  const { error } = await db
    .from("import_mapping_templates_thunder")
    .update({ deleted_at: new Date().toISOString() })
    .eq("workspace_id", workspaceId)
    .eq("id", templateId);
  fromDb(error, "Deleting mapping template");
}

// ── Execute Import Job ───────────────────────────────────────
export interface ExecuteImportInput {
  idempotencyKey?: string;
  sourceType: "csv" | "excel" | "google_sheets" | "urls";
  fileName?: string | null;
  sheetName?: string | null;
  sourceUrl?: string | null;
  duplicateStrategy: DuplicateStrategy;
  defaultCurrency?: string | null;
  defaultCountry?: CountryCode;
  autoCategorize?: boolean;
  allowCategoryOverwrite?: boolean;
  enrichmentRequired?: boolean;
  rows: Record<string, string>[];
  mapping: ColumnMappingRecord;
  excludedRowNumbers?: number[];
  /** Optional user-approved manual overrides per rowNumber (from editable preview table) */
  rowOverrides?: Record<number, Record<string, string>>;
}

export interface ImportExecutionResult {
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

export async function executeImportJob(
  db: Db,
  workspaceId: string,
  userId: string,
  userEmail: string,
  input: ExecuteImportInput,
): Promise<ImportExecutionResult> {
  await requireImportPermission(db, workspaceId, userId);

  if (!Array.isArray(input.rows) || input.rows.length === 0) {
    throw new ServiceError("No rows provided to import.", "validation");
  }
  if (input.rows.length > DEFAULT_MAX_ROWS) {
    throw new ServiceError(`Maximum ${DEFAULT_MAX_ROWS} rows per import.`, "validation");
  }

  // Idempotency protection against repeated submissions
  const idemKey = input.idempotencyKey?.trim() || null;
  if (idemKey) {
    const { data: existingJob, error: idemErr } = await db
      .from("import_jobs_thunder")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("idempotency_key", idemKey)
      .maybeSingle();
    fromDb(idemErr, "Checking import idempotency");
    if (existingJob) {
      return {
        jobId: existingJob.id,
        idempotentHit: true,
        status: existingJob.status,
        totalProcessed: existingJob.processed_rows,
        created: existingJob.created_count,
        updated: existingJob.updated_count,
        merged: existingJob.merged_count,
        skipped: existingJob.skipped_count,
        failed: existingJob.failed_count,
        durationMs: existingJob.duration_ms ?? 0,
        failedRows: [],
      };
    }
  }

  await checkImportRateLimit(db, workspaceId);

  const startedAt = Date.now();
  const excludedSet = new Set(input.excludedRowNumbers ?? []);
  const effectiveRows = input.rows.map((row, idx) => {
    const rowNumber = idx + 1;
    const override = input.rowOverrides?.[rowNumber];
    return override ? { ...row, ...override } : row;
  });

  // Load current DB state & re-run full validation/deduplication server-side
  const existingList = await loadExistingInfluencersForDedupe(db, workspaceId);
  const existingById = new Map(existingList.map((e) => [e.id, e]));
  const existingByHandle = new Map(
    existingList.filter((e) => e.handle).map((e) => [e.handle!.toLowerCase(), e]),
  );

  const analysis = analyzeImportDataset(effectiveRows, input.mapping, existingList, {
    defaultCountry: input.defaultCountry ?? "IN",
    defaultCurrency: input.defaultCurrency ?? null,
    autoCategorize: input.autoCategorize ?? true,
    allowCategoryOverwrite: input.allowCategoryOverwrite ?? false,
    enrichmentRequired: input.enrichmentRequired ?? false,
  });

  for (const r of analysis.rows) {
    if (excludedSet.has(r.rowNumber)) r.excluded = true;
  }

  // Create import job record
  const { data: jobRow, error: jobErr } = await db
    .from("import_jobs_thunder")
    .insert({
      workspace_id: workspaceId,
      idempotency_key: idemKey,
      source_type: input.sourceType,
      file_name: input.fileName ?? null,
      sheet_name: input.sheetName ?? null,
      source_url: input.sourceUrl ?? null,
      duplicate_strategy: input.duplicateStrategy,
      default_currency: input.defaultCurrency ?? null,
      default_country: input.defaultCountry ?? "IN",
      status: "processing",
      total_rows: analysis.rows.length,
      mapping_snapshot: input.mapping,
      summary_snapshot: summarizeAnalyzedRows(analysis.rows),
      created_by: userId,
      created_by_email: userEmail,
      started_at: new Date(startedAt).toISOString(),
    })
    .select("id")
    .single();
  if (jobErr?.code === "23505" && idemKey) {
    // Concurrent duplicate submission race: return existing job
    const { data: raceJob } = await db
      .from("import_jobs_thunder")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("idempotency_key", idemKey)
      .single();
    if (raceJob) {
      return {
        jobId: raceJob.id,
        idempotentHit: true,
        status: raceJob.status,
        totalProcessed: raceJob.processed_rows,
        created: raceJob.created_count,
        updated: raceJob.updated_count,
        merged: raceJob.merged_count,
        skipped: raceJob.skipped_count,
        failed: raceJob.failed_count,
        durationMs: raceJob.duration_ms ?? 0,
        failedRows: [],
      };
    }
  }
  fromDb(jobErr, "Creating import job");
  const jobId = jobRow!.id as string;

  let created = 0;
  let updated = 0;
  let merged = 0;
  let skipped = 0;
  let failed = 0;
  let processed = 0;
  let cancelled = false;

  const rowResultsBuffer: Record<string, unknown>[] = [];
  const auditRecordsBuffer: Record<string, unknown>[] = [];
  const failedRows: { rowNumber: number; handle: string | null; name: string | null; reason: string }[] = [];

  const flushBuffers = async () => {
    if (rowResultsBuffer.length > 0) {
      const { error } = await db.from("import_row_results_thunder").insert(rowResultsBuffer.splice(0));
      fromDb(error, "Saving import row results");
    }
    if (auditRecordsBuffer.length > 0) {
      const { error } = await db.from("import_audit_records_thunder").insert(auditRecordsBuffer.splice(0));
      fromDb(error, "Saving import audit records");
    }
  };

  for (let i = 0; i < analysis.rows.length; i++) {
    // Periodically check for cancellation & flush progress
    if (i > 0 && i % BATCH_SIZE === 0) {
      await flushBuffers();
      const { data: statusCheck } = await db
        .from("import_jobs_thunder")
        .select("status")
        .eq("workspace_id", workspaceId)
        .eq("id", jobId)
        .maybeSingle();

      if (statusCheck?.status === "cancelled") {
        cancelled = true;
        break;
      }

      await db
        .from("import_jobs_thunder")
        .update({
          processed_rows: processed,
          created_count: created,
          updated_count: updated,
          merged_count: merged,
          skipped_count: skipped,
          failed_count: failed,
        })
        .eq("workspace_id", workspaceId)
        .eq("id", jobId);
    }

    const row: AnalyzedImportRow = analysis.rows[i];
    processed++;

    if (row.excluded) {
      skipped++;
      rowResultsBuffer.push({
        workspace_id: workspaceId,
        import_job_id: jobId,
        row_number: row.rowNumber,
        action: "excluded",
        status: "excluded",
        handle: row.normalized.handle,
        influencer_name: row.normalized.name,
        reason: "Excluded by user before import",
        warnings: row.warnings,
        raw_data: row.raw,
        normalized_data: row.normalized,
      });
      continue;
    }

    if (row.classification === "invalid") {
      failed++;
      const reason = row.errors.join("; ");
      failedRows.push({ rowNumber: row.rowNumber, handle: row.normalized.handle, name: row.normalized.name, reason });
      rowResultsBuffer.push({
        workspace_id: workspaceId,
        import_job_id: jobId,
        row_number: row.rowNumber,
        action: "failed",
        status: "invalid",
        handle: row.normalized.handle,
        influencer_name: row.normalized.name,
        reason,
        warnings: row.warnings,
        raw_data: row.raw,
        normalized_data: row.normalized,
      });
      continue;
    }

    if (row.classification === "duplicate_in_file") {
      skipped++;
      rowResultsBuffer.push({
        workspace_id: workspaceId,
        import_job_id: jobId,
        row_number: row.rowNumber,
        action: "skipped",
        status: "duplicate_in_file",
        handle: row.normalized.handle,
        influencer_name: row.normalized.name,
        reason: row.matchReason ?? "Duplicate inside uploaded file",
        warnings: row.warnings,
        raw_data: row.raw,
        normalized_data: row.normalized,
      });
      continue;
    }

    // Existing match (or potential duplicate that only gets created as new unless explicitly matched)
    const isMatchedExisting = row.classification === "existing" && row.matchedInfluencerId;

    if (isMatchedExisting) {
      const existingSnap = existingById.get(row.matchedInfluencerId!);
      if (!existingSnap || input.duplicateStrategy === "skip") {
        skipped++;
        rowResultsBuffer.push({
          workspace_id: workspaceId,
          import_job_id: jobId,
          row_number: row.rowNumber,
          influencer_id: row.matchedInfluencerId,
          action: "skipped",
          status: "existing_skipped",
          handle: row.normalized.handle,
          influencer_name: row.normalized.name,
          reason: row.matchReason ?? "Skipped existing influencer",
          warnings: row.warnings,
          raw_data: row.raw,
          normalized_data: row.normalized,
        });
        continue;
      }

      const patch = buildDbPatchForExisting(existingSnap, row.normalized, input.duplicateStrategy);
      if (Object.keys(patch).length === 0) {
        skipped++;
        rowResultsBuffer.push({
          workspace_id: workspaceId,
          import_job_id: jobId,
          row_number: row.rowNumber,
          influencer_id: existingSnap.id,
          action: "skipped",
          status: "no_new_fields",
          handle: row.normalized.handle,
          influencer_name: row.normalized.name,
          reason: "No new non-empty fields to update/merge",
          warnings: row.warnings,
          raw_data: row.raw,
          normalized_data: row.normalized,
        });
        continue;
      }

      const { data: updatedRow, error: upErr } = await db
        .from("influencers_thunder")
        .update(patch)
        .eq("workspace_id", workspaceId)
        .eq("id", existingSnap.id)
        .select(EXISTING_SELECT_FIELDS)
        .single();

      if (upErr) {
        failed++;
        const reason = `Database update error: ${upErr.message}`;
        failedRows.push({ rowNumber: row.rowNumber, handle: row.normalized.handle, name: row.normalized.name, reason });
        rowResultsBuffer.push({
          workspace_id: workspaceId,
          import_job_id: jobId,
          row_number: row.rowNumber,
          influencer_id: existingSnap.id,
          action: "failed",
          status: "db_error",
          handle: row.normalized.handle,
          influencer_name: row.normalized.name,
          reason,
          warnings: row.warnings,
          raw_data: row.raw,
          normalized_data: row.normalized,
        });
        continue;
      }

      const action = input.duplicateStrategy === "update" ? "updated" : "merged";
      if (action === "updated") updated++;
      else merged++;

      auditRecordsBuffer.push({
        workspace_id: workspaceId,
        import_job_id: jobId,
        influencer_id: existingSnap.id,
        operation: input.duplicateStrategy,
        before_snapshot: existingSnap,
        after_snapshot: updatedRow,
      });

      rowResultsBuffer.push({
        workspace_id: workspaceId,
        import_job_id: jobId,
        row_number: row.rowNumber,
        influencer_id: existingSnap.id,
        action,
        status: action,
        handle: row.normalized.handle,
        influencer_name: row.normalized.name,
        reason: `${action === "updated" ? "Updated" : "Merged missing fields into"} existing influencer`,
        warnings: row.warnings,
        raw_data: row.raw,
        normalized_data: row.normalized,
      });
      continue;
    }

    // New influencer insert (with concurrency-safe unique conflict recovery)
    const insertPayload = buildDbInsertPayload(row.normalized, workspaceId, userId);
    const { data: insertedRow, error: insErr } = await db
      .from("influencers_thunder")
      .insert(insertPayload)
      .select(EXISTING_SELECT_FIELDS)
      .single();

    if (insErr?.code === "23505") {
      // Concurrency conflict: another request inserted the same handle/URL in parallel
      const concurrentExisting = row.normalized.handle
        ? existingByHandle.get(row.normalized.handle) ??
          ((await db
            .from("influencers_thunder")
            .select(EXISTING_SELECT_FIELDS)
            .eq("workspace_id", workspaceId)
            .eq("handle", row.normalized.handle)
            .is("deleted_at", null)
            .maybeSingle()).data as unknown as ExistingInfluencerSnapshot | null)
        : null;

      if (concurrentExisting && input.duplicateStrategy !== "skip") {
        const patch = buildDbPatchForExisting(concurrentExisting, row.normalized, input.duplicateStrategy);
        if (Object.keys(patch).length > 0) {
          const { data: afterUp, error: cUpErr } = await db
            .from("influencers_thunder")
            .update(patch)
            .eq("workspace_id", workspaceId)
            .eq("id", concurrentExisting.id)
            .select(EXISTING_SELECT_FIELDS)
            .single();
          if (!cUpErr && afterUp) {
            const action = input.duplicateStrategy === "update" ? "updated" : "merged";
            if (action === "updated") updated++;
            else merged++;
            auditRecordsBuffer.push({
              workspace_id: workspaceId,
              import_job_id: jobId,
              influencer_id: concurrentExisting.id,
              operation: input.duplicateStrategy,
              before_snapshot: concurrentExisting,
              after_snapshot: afterUp,
            });
            rowResultsBuffer.push({
              workspace_id: workspaceId,
              import_job_id: jobId,
              row_number: row.rowNumber,
              influencer_id: concurrentExisting.id,
              action,
              status: "concurrent_resolved",
              handle: row.normalized.handle,
              influencer_name: row.normalized.name,
              reason: "Concurrent insert resolved with duplicate strategy",
              warnings: row.warnings,
              raw_data: row.raw,
              normalized_data: row.normalized,
            });
            continue;
          }
        }
      }

      skipped++;
      rowResultsBuffer.push({
        workspace_id: workspaceId,
        import_job_id: jobId,
        row_number: row.rowNumber,
        action: "skipped",
        status: "concurrent_duplicate",
        handle: row.normalized.handle,
        influencer_name: row.normalized.name,
        reason: "Already exists (concurrent duplicate skipped)",
        warnings: row.warnings,
        raw_data: row.raw,
        normalized_data: row.normalized,
      });
      continue;
    }

    if (insErr || !insertedRow) {
      failed++;
      const reason = `Database insert error: ${insErr?.message ?? "unknown error"}`;
      failedRows.push({ rowNumber: row.rowNumber, handle: row.normalized.handle, name: row.normalized.name, reason });
      rowResultsBuffer.push({
        workspace_id: workspaceId,
        import_job_id: jobId,
        row_number: row.rowNumber,
        action: "failed",
        status: "db_error",
        handle: row.normalized.handle,
        influencer_name: row.normalized.name,
        reason,
        warnings: row.warnings,
        raw_data: row.raw,
        normalized_data: row.normalized,
      });
      continue;
    }

    const createdSnap = insertedRow as unknown as ExistingInfluencerSnapshot;
    created++;
    if (createdSnap.handle) existingByHandle.set(createdSnap.handle.toLowerCase(), createdSnap);
    existingById.set(createdSnap.id, createdSnap);

    auditRecordsBuffer.push({
      workspace_id: workspaceId,
      import_job_id: jobId,
      influencer_id: createdSnap.id,
      operation: "create",
      before_snapshot: null,
      after_snapshot: createdSnap,
    });

    rowResultsBuffer.push({
      workspace_id: workspaceId,
      import_job_id: jobId,
      row_number: row.rowNumber,
      influencer_id: createdSnap.id,
      action: "created",
      status: "created",
      handle: row.normalized.handle,
      influencer_name: row.normalized.name,
      reason: "Created new influencer",
      warnings: row.warnings,
      raw_data: row.raw,
      normalized_data: row.normalized,
    });
  }

  await flushBuffers();

  const durationMs = Date.now() - startedAt;
  const finalStatus = cancelled
    ? "cancelled"
    : failed > 0 && created + updated + merged === 0
      ? "failed"
      : failed > 0
        ? "partially_completed"
        : "completed";

  const { error: finErr } = await db
    .from("import_jobs_thunder")
    .update({
      status: finalStatus,
      processed_rows: processed,
      created_count: created,
      updated_count: updated,
      merged_count: merged,
      skipped_count: skipped,
      failed_count: failed,
      duration_ms: durationMs,
      finished_at: new Date().toISOString(),
    })
    .eq("workspace_id", workspaceId)
    .eq("id", jobId);
  fromDb(finErr, "Finalizing import job");

  return {
    jobId,
    idempotentHit: false,
    status: finalStatus,
    totalProcessed: processed,
    created,
    updated,
    merged,
    skipped,
    failed,
    durationMs,
    failedRows,
  };
}

// ── History, Details & Cancellation ──────────────────────────
export async function listImportJobs(db: Db, workspaceId: string, limit = 30) {
  const { data, error } = await db
    .from("import_jobs_thunder")
    .select(
      "id, source_type, file_name, sheet_name, duplicate_strategy, status, total_rows, processed_rows, created_count, updated_count, merged_count, skipped_count, failed_count, duration_ms, created_by, created_by_email, started_at, finished_at, rolled_back_at, created_at",
    )
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(limit);
  fromDb(error, "Loading import history");
  return data ?? [];
}

export async function getImportJobDetails(db: Db, workspaceId: string, jobId: string) {
  if (!z.uuid().safeParse(jobId).success) throw new ServiceError("Import job not found", "not_found");
  const [{ data: job, error: jErr }, { data: rows, error: rErr }] = await Promise.all([
    db.from("import_jobs_thunder").select("*").eq("workspace_id", workspaceId).eq("id", jobId).maybeSingle(),
    db
      .from("import_row_results_thunder")
      .select("id, row_number, influencer_id, action, status, handle, influencer_name, reason, warnings, created_at")
      .eq("workspace_id", workspaceId)
      .eq("import_job_id", jobId)
      .order("row_number"),
  ]);
  fromDb(jErr ?? rErr, "Loading import job details");
  if (!job) throw new ServiceError("Import job not found", "not_found");
  return { job, rows: rows ?? [] };
}

export async function cancelImportJob(db: Db, workspaceId: string, userId: string, jobId: string) {
  await requireImportPermission(db, workspaceId, userId);
  if (!z.uuid().safeParse(jobId).success) throw new ServiceError("Import job not found", "not_found");
  const { data, error } = await db
    .from("import_jobs_thunder")
    .update({ status: "cancelled", finished_at: new Date().toISOString() })
    .eq("workspace_id", workspaceId)
    .eq("id", jobId)
    .in("status", ["pending", "processing"])
    .select("id, status")
    .maybeSingle();
  fromDb(error, "Cancelling import job");
  if (!data) throw new ServiceError("Only pending or processing imports can be cancelled.", "validation");
  return data;
}

// ── Safe Permission-Controlled Rollback ──────────────────────
export interface RollbackSummary {
  jobId: string;
  revertedCreates: number;
  revertedUpdates: number;
  skippedModified: number;
}

/**
 * Rolls back an import job using `import_audit_records_thunder`.
 * Safety guarantee:
 * - Only workspace owners/admins or the original importer (non-viewer) can roll back.
 * - For created influencers: only soft-deletes if `updated_at` matches `after_snapshot.updated_at`
 *   (no subsequent edits made by other users).
 * - For updated/merged influencers: only restores individual columns whose current DB value still
 *   matches `after_snapshot`, preserving any subsequent edits by other users.
 */
export async function rollbackImportJob(
  db: Db,
  workspaceId: string,
  userId: string,
  jobId: string,
): Promise<RollbackSummary> {
  const role = await requireImportPermission(db, workspaceId, userId);
  if (!z.uuid().safeParse(jobId).success) throw new ServiceError("Import job not found", "not_found");

  const { data: job, error: jErr } = await db
    .from("import_jobs_thunder")
    .select("id, status, created_by, rolled_back_at")
    .eq("workspace_id", workspaceId)
    .eq("id", jobId)
    .maybeSingle();
  fromDb(jErr, "Loading import job");
  if (!job) throw new ServiceError("Import job not found", "not_found");

  if (role !== "owner" && role !== "admin" && job.created_by !== userId) {
    throw new ServiceError("Only workspace admins or the user who ran this import can roll it back.", "forbidden");
  }
  if (job.rolled_back_at || job.status === "rolled_back") {
    throw new ServiceError("This import has already been rolled back.", "validation");
  }

  const { data: audits, error: aErr } = await db
    .from("import_audit_records_thunder")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("import_job_id", jobId)
    .is("rolled_back_at", null);
  fromDb(aErr, "Loading import audit records");

  let revertedCreates = 0;
  let revertedUpdates = 0;
  let skippedModified = 0;
  const now = new Date().toISOString();

  for (const audit of audits ?? []) {
    const afterSnap = (audit.after_snapshot ?? {}) as Record<string, unknown>;
    const beforeSnap = (audit.before_snapshot ?? null) as Record<string, unknown> | null;

    const { data: currentRow } = await db
      .from("influencers_thunder")
      .select(EXISTING_SELECT_FIELDS)
      .eq("workspace_id", workspaceId)
      .eq("id", audit.influencer_id)
      .is("deleted_at", null)
      .maybeSingle();

    if (!currentRow) {
      await db
        .from("import_audit_records_thunder")
        .update({ rolled_back_at: now, rolled_back_by: userId, rollback_status: "skipped_modified" })
        .eq("id", audit.id);
      skippedModified++;
      continue;
    }

    const current = currentRow as unknown as Record<string, unknown>;

    if (audit.operation === "create") {
      // Only soft-delete if untouched since import
      if (current.updated_at !== afterSnap.updated_at) {
        await db
          .from("import_audit_records_thunder")
          .update({ rolled_back_at: now, rolled_back_by: userId, rollback_status: "skipped_modified" })
          .eq("id", audit.id);
        skippedModified++;
        continue;
      }
      await db
        .from("influencers_thunder")
        .update({ deleted_at: now })
        .eq("workspace_id", workspaceId)
        .eq("id", audit.influencer_id);
      await db
        .from("import_audit_records_thunder")
        .update({ rolled_back_at: now, rolled_back_by: userId, rollback_status: "rolled_back" })
        .eq("id", audit.id);
      revertedCreates++;
      continue;
    }

    if ((audit.operation === "update" || audit.operation === "merge") && beforeSnap) {
      const revertPatch: Record<string, unknown> = {};
      for (const [k, afterVal] of Object.entries(afterSnap)) {
        if (k === "id" || k === "workspace_id" || k === "created_at" || k === "updated_at" || k === "profile_url") continue;
        const beforeVal = beforeSnap[k];
        if (JSON.stringify(beforeVal) === JSON.stringify(afterVal)) continue;
        // Only revert fields that were NOT modified afterwards by another user
        if (JSON.stringify(current[k]) === JSON.stringify(afterVal)) {
          revertPatch[k] = beforeVal ?? null;
        }
      }

      if (Object.keys(revertPatch).length === 0) {
        await db
          .from("import_audit_records_thunder")
          .update({ rolled_back_at: now, rolled_back_by: userId, rollback_status: "skipped_modified" })
          .eq("id", audit.id);
        skippedModified++;
        continue;
      }

      await db
        .from("influencers_thunder")
        .update(revertPatch)
        .eq("workspace_id", workspaceId)
        .eq("id", audit.influencer_id);
      await db
        .from("import_audit_records_thunder")
        .update({ rolled_back_at: now, rolled_back_by: userId, rollback_status: "rolled_back" })
        .eq("id", audit.id);
      revertedUpdates++;
    }
  }

  await db
    .from("import_jobs_thunder")
    .update({ status: "rolled_back", rolled_back_at: now, rolled_back_by: userId })
    .eq("workspace_id", workspaceId)
    .eq("id", jobId);

  return { jobId, revertedCreates, revertedUpdates, skippedModified };
}

// ── Reports & Sample Templates ───────────────────────────────
export function buildSampleTemplateCsv(): string {
  const headers = EXPORT_TEMPLATE_COLUMNS.map((c) => c.header);
  const row1 = EXPORT_TEMPLATE_COLUMNS.map((c) => c.example1);
  const row2 = EXPORT_TEMPLATE_COLUMNS.map((c) => c.example2);
  return buildCsvDocument(headers, [row1, row2]);
}

export function buildSampleTemplateXlsx(): Uint8Array {
  const headers = EXPORT_TEMPLATE_COLUMNS.map((c) => c.header);
  const row1 = EXPORT_TEMPLATE_COLUMNS.map((c) => c.example1);
  const row2 = EXPORT_TEMPLATE_COLUMNS.map((c) => c.example2);
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([headers, row1, row2]);
  XLSX.utils.book_append_sheet(wb, ws, "Influencers Template");
  return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }));
}

export async function buildJobReportCsv(
  db: Db,
  workspaceId: string,
  jobId: string,
  mode: "all" | "failed",
): Promise<string> {
  const { rows } = await getImportJobDetails(db, workspaceId, jobId);
  const filtered = mode === "failed" ? rows.filter((r) => r.action === "failed") : rows;
  const headers = ["Row Number", "Action", "Status", "Influencer Name", "Instagram Handle", "Reason", "Warnings"];
  const body = filtered.map((r) => [
    r.row_number,
    r.action,
    r.status,
    r.influencer_name ?? "",
    r.handle ? `@${r.handle}` : "",
    r.reason ?? "",
    Array.isArray(r.warnings) ? r.warnings.join("; ") : "",
  ]);
  return buildCsvDocument(headers, body);
}
