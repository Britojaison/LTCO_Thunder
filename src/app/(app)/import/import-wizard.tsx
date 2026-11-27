"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import type { CountryCode } from "libphonenumber-js";
import { Badge, btnDanger, btnPrimary, btnSecondary, Card, Field, inputCls } from "@/components/ui";
import { THUNDER_FIELDS, type ThunderFieldGroup } from "@/lib/import/fields";
import { buildCsvDocument } from "@/lib/import/parser";
import { parseBulkSocialUrls } from "@/lib/import/url-importer";
import { cap, compact } from "@/lib/format";
import { ImportHistory } from "./import-history";
import type {
  AnalyzedImportRow,
  ColumnMappingRecord,
  ColumnMappingSuggestion,
  DuplicateStrategy,
  ExecuteApiResponse,
  ImportAnalysisSummary,
  ImportJobItem,
  ImportSourceType,
  MappingTemplateItem,
  ParseApiResponse,
  ThunderFieldKey,
} from "./types";

const STEPS = [
  { num: 1, label: "Upload" },
  { num: 2, label: "Map Columns" },
  { num: 3, label: "Validate Data" },
  { num: 4, label: "Resolve Duplicates" },
  { num: 5, label: "Confirm Import" },
  { num: 6, label: "Results" },
] as const;

const FIELD_GROUPS: ThunderFieldGroup[] = [
  "Identity & Social",
  "Contact",
  "Metrics",
  "Profile & Location",
  "Pricing",
  "Management & Meta",
];

const CLASSIFICATION_BADGE: Record<AnalyzedImportRow["classification"], { label: string; tone: "green" | "amber" | "red" | "zinc" }> = {
  new: { label: "New", tone: "green" },
  existing: { label: "Existing", tone: "amber" },
  duplicate_in_file: { label: "Duplicate in file", tone: "zinc" },
  potential_duplicate: { label: "Potential duplicate", tone: "amber" },
  invalid: { label: "Invalid", tone: "red" },
  requires_review: { label: "Needs review", tone: "amber" },
};

const PAGE_SIZE = 25;

export function ImportWizard({
  initialTemplates,
  initialJobs,
  currentUserId,
  userRole,
  googleApiConfigured,
  maxFileBytes,
  maxRows,
}: {
  initialTemplates: MappingTemplateItem[];
  initialJobs: ImportJobItem[];
  currentUserId: string;
  userRole: string;
  googleApiConfigured: boolean;
  maxFileBytes: number;
  maxRows: number;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5 | 6>(1);
  const [method, setMethod] = useState<ImportSourceType>("csv");

  // Step 1 state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [googleUrl, setGoogleUrl] = useState("");
  const [bulkUrlsText, setBulkUrlsText] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Parsed & mapping state (Step 2)
  const [parseData, setParseData] = useState<ParseApiResponse | null>(null);
  const [mapping, setMapping] = useState<ColumnMappingRecord>({});
  const [suggestions, setSuggestions] = useState<ColumnMappingSuggestion[]>([]);
  const [templates, setTemplates] = useState<MappingTemplateItem[]>(initialTemplates);
  const [templateName, setTemplateName] = useState("");
  const [defaultCountry, setDefaultCountry] = useState<CountryCode>("IN");
  const [defaultCurrency, setDefaultCurrency] = useState<string>("INR");
  const [autoCategorize, setAutoCategorize] = useState(true);
  const [enrichmentRequired, setEnrichmentRequired] = useState(false);

  // Step 3 & 4 state (Preview, Filters, Editing, Exclusions, Duplicates)
  const [analyzedRows, setAnalyzedRows] = useState<AnalyzedImportRow[]>([]);
  const [summary, setSummary] = useState<ImportAnalysisSummary | null>(null);
  const [excludedRows, setExcludedRows] = useState<Set<number>>(new Set());
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [rowOverrides, setRowOverrides] = useState<Record<number, Record<string, string>>>({});
  const [editingRow, setEditingRow] = useState<AnalyzedImportRow | null>(null);
  const [editDraft, setEditDraft] = useState<Record<string, string>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [previewPage, setPreviewPage] = useState(1);
  const [duplicateStrategy, setDuplicateStrategy] = useState<DuplicateStrategy>("merge");

  // Step 5 & 6 state (Execution & History)
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() => crypto.randomUUID());
  const [execResult, setExecResult] = useState<ExecuteApiResponse | null>(null);
  const [jobs, setJobs] = useState<ImportJobItem[]>(initialJobs);

  const isViewer = userRole === "viewer";
  const maxMbLabel = (maxFileBytes / (1024 * 1024)).toFixed(0);

  const bulkUrlPreview = useMemo(() => {
    if (method !== "urls" || !bulkUrlsText.trim()) return [];
    return parseBulkSocialUrls(bulkUrlsText, maxRows);
  }, [method, bulkUrlsText, maxRows]);

  const mappedTargetsUsed = useMemo(() => {
    const used = new Map<ThunderFieldKey, string>();
    for (const [col, target] of Object.entries(mapping)) {
      if (target) used.set(target, col);
    }
    return used;
  }, [mapping]);

  async function refreshJobs() {
    try {
      const res = await fetch("/api/imports/jobs");
      if (res.ok) {
        const data = await res.json();
        setJobs(data.jobs ?? []);
      }
    } catch {
      // ignore transient refresh failure
    }
  }

  function resetWizard() {
    setStep(1);
    setSelectedFile(null);
    setGoogleUrl("");
    setBulkUrlsText("");
    setParseData(null);
    setMapping({});
    setSuggestions([]);
    setAnalyzedRows([]);
    setSummary(null);
    setExcludedRows(new Set());
    setSelectedRows(new Set());
    setRowOverrides({});
    setEditingRow(null);
    setExecResult(null);
    setError(null);
    setUploadProgress(0);
    setEnrichmentRequired(false);
    setIdempotencyKey(crypto.randomUUID());
  }

  async function handleFileParse(file: File, options?: { sheetName?: string; headerRow?: number }) {
    setError(null);
    setBusy(true);
    setUploadProgress(25);
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (options?.sheetName) fd.append("sheetName", options.sheetName);
      if (options?.headerRow !== undefined) fd.append("headerRow", String(options.headerRow));

      setUploadProgress(60);
      const res = await fetch("/api/imports/parse", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to parse file");
      setUploadProgress(100);

      const parsedResp = data as ParseApiResponse;
      setSelectedFile(file);
      setParseData(parsedResp);
      setSuggestions(parsedResp.suggestions);
      setTemplates(parsedResp.templates);
      const initialMap: ColumnMappingRecord = {};
      for (const s of parsedResp.suggestions) initialMap[s.sourceColumn] = s.targetField;
      setMapping(initialMap);
      setEnrichmentRequired(false);
      setRowOverrides({});
      setExcludedRows(new Set());
      setIdempotencyKey(crypto.randomUUID());
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not parse uploaded file.");
      setUploadProgress(0);
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogleSheetParse(headerRow?: number) {
    setError(null);
    setBusy(true);
    setUploadProgress(40);
    try {
      const res = await fetch("/api/imports/parse", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ googleSheetUrl: googleUrl, headerRow }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load Google Sheet");
      setUploadProgress(100);

      const parsedResp = data as ParseApiResponse;
      setParseData(parsedResp);
      setSuggestions(parsedResp.suggestions);
      setTemplates(parsedResp.templates);
      const initialMap: ColumnMappingRecord = {};
      for (const s of parsedResp.suggestions) initialMap[s.sourceColumn] = s.targetField;
      setMapping(initialMap);
      setEnrichmentRequired(false);
      setRowOverrides({});
      setExcludedRows(new Set());
      setIdempotencyKey(crypto.randomUUID());
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to import Google Sheet.");
      setUploadProgress(0);
    } finally {
      setBusy(false);
    }
  }

  async function handleBulkUrlsContinue() {
    setError(null);
    const parsedItems = parseBulkSocialUrls(bulkUrlsText, maxRows);
    const validUnique = parsedItems.filter((item) => !item.duplicateInPaste);
    if (validUnique.length === 0) {
      setError("Paste at least one social media profile URL or username.");
      return;
    }

    // Build synthetic rows + mapping and jump straight to server validation (Step 3)
    const rows: Record<string, string>[] = validUnique.map((item) => {
      const base: Record<string, string> = {
        Name: item.handle ?? "",
        Instagram: "",
        YouTube: "",
        Facebook: "",
        Other: "",
      };
      if (item.platform === "instagram") base.Instagram = item.canonicalUrl ?? item.rawInput;
      else if (item.platform === "youtube") base.YouTube = item.canonicalUrl ?? item.rawInput;
      else if (item.platform === "facebook") base.Facebook = item.canonicalUrl ?? item.rawInput;
      else base.Other = item.canonicalUrl ?? item.rawInput;
      return base;
    });

    const urlMapping: ColumnMappingRecord = {
      Name: "name",
      Instagram: "instagram_profile_url",
      YouTube: "youtube_channel_url",
      Facebook: "facebook_profile_url",
      Other: "other_profiles",
    };

    const syntheticParse: ParseApiResponse = {
      sourceType: "urls",
      fileName: `quick-url-import-${validUnique.length}.txt`,
      parsed: {
        fileType: "csv",
        sheetNames: ["URLs"],
        selectedSheet: "URLs",
        detectedHeaderRow: 0,
        headerRow: 0,
        headers: ["Name", "Instagram", "YouTube", "Facebook", "Other"],
        rows,
        rawPreviewRows: [],
        totalRowsBeforeLimit: rows.length,
        truncated: false,
      },
      suggestions: [],
      templates,
      limits: { maxBytes: maxFileBytes, maxRows },
    };

    setParseData(syntheticParse);
    setMapping(urlMapping);
    setEnrichmentRequired(true);
    setRowOverrides({});
    setExcludedRows(new Set());
    setIdempotencyKey(crypto.randomUUID());
    await runServerValidation(rows, urlMapping, {}, true);
  }

  async function runServerValidation(
    rowsInput?: Record<string, string>[],
    mappingInput?: ColumnMappingRecord,
    overridesInput?: Record<number, Record<string, string>>,
    forceEnrichment?: boolean,
  ) {
    const baseRows = rowsInput ?? parseData?.parsed.rows ?? [];
    const activeMap = mappingInput ?? mapping;
    const activeOverrides = overridesInput ?? rowOverrides;

    const effectiveRows = baseRows.map((row, idx) => {
      const ov = activeOverrides[idx + 1];
      return ov ? { ...row, ...ov } : row;
    });

    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/imports/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          rows: effectiveRows,
          mapping: activeMap,
          options: {
            defaultCountry,
            defaultCurrency: defaultCurrency || null,
            autoCategorize,
            enrichmentRequired: forceEnrichment ?? enrichmentRequired,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Validation failed");
      const rowsWithExclusions = (data.rows as AnalyzedImportRow[]).map((r) => ({
        ...r,
        excluded: excludedRows.has(r.rowNumber),
      }));
      setAnalyzedRows(rowsWithExclusions);
      setSummary(computeSummary(rowsWithExclusions));
      setPreviewPage(1);
      setStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not validate records.");
    } finally {
      setBusy(false);
    }
  }

  function computeSummary(rows: AnalyzedImportRow[]): ImportAnalysisSummary {
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

  function updateColumnMapping(sourceColumn: string, nextField: ThunderFieldKey | null) {
    setMapping((prev) => {
      const copy = { ...prev };
      // Prevent another column from pointing to the same destination field
      if (nextField) {
        for (const [k, v] of Object.entries(copy)) {
          if (k !== sourceColumn && v === nextField) {
            copy[k] = null;
          }
        }
      }
      copy[sourceColumn] = nextField;
      return copy;
    });
    setIdempotencyKey(crypto.randomUUID());
  }

  async function handleSaveTemplate() {
    if (!templateName.trim()) {
      setError("Enter a name for this mapping template.");
      return;
    }
    setError(null);
    try {
      const res = await fetch("/api/imports/templates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: templateName.trim(),
          mapping,
          options: { defaultCountry, defaultCurrency, autoCategorize },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save template");
      setTemplates((prev) => {
        const filtered = prev.filter((t) => t.id !== data.template.id);
        return [...filtered, data.template].sort((a, b) => a.name.localeCompare(b.name));
      });
      setTemplateName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save template");
    }
  }

  function applyTemplate(templateId: string) {
    const tpl = templates.find((t) => t.id === templateId);
    if (!tpl || !parseData) return;
    const next: ColumnMappingRecord = {};
    const used = new Set<ThunderFieldKey>();
    for (const h of parseData.parsed.headers) {
      const candidate = tpl.mapping[h] ?? null;
      if (candidate && !used.has(candidate)) {
        next[h] = candidate;
        used.add(candidate);
      } else {
        next[h] = null;
      }
    }
    setMapping(next);
  }

  function toggleRowExclusion(rowNumbers: number[], exclude: boolean) {
    const nextExcluded = new Set(excludedRows);
    for (const rn of rowNumbers) {
      if (exclude) nextExcluded.add(rn);
      else nextExcluded.delete(rn);
    }
    setExcludedRows(nextExcluded);
    const updated = analyzedRows.map((r) => ({ ...r, excluded: nextExcluded.has(r.rowNumber) }));
    setAnalyzedRows(updated);
    setSummary(computeSummary(updated));
    setSelectedRows(new Set());
  }

  function openEditRow(row: AnalyzedImportRow) {
    setEditingRow(row);
    setEditDraft({ ...row.raw });
  }

  async function saveEditedRow() {
    if (!editingRow) return;
    const nextOverrides = { ...rowOverrides, [editingRow.rowNumber]: editDraft };
    setRowOverrides(nextOverrides);
    setEditingRow(null);
    await runServerValidation(undefined, undefined, nextOverrides);
  }

  function downloadInvalidCsv() {
    const invalid = analyzedRows.filter((r) => r.classification === "invalid");
    if (invalid.length === 0 || !parseData) return;
    const headers = ["Row Number", "Errors", ...parseData.parsed.headers];
    const rows = invalid.map((r) => [
      r.rowNumber,
      r.errors.join("; "),
      ...parseData.parsed.headers.map((h) => r.raw[h] ?? ""),
    ]);
    const csv = buildCsvDocument(headers, rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "thunder-invalid-rows.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleConfirmImport() {
    if (!parseData) return;
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/imports/execute", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          idempotencyKey,
          sourceType: parseData.sourceType,
          fileName: parseData.fileName,
          sheetName: parseData.parsed.selectedSheet,
          sourceUrl: parseData.sourceUrl ?? null,
          duplicateStrategy,
          defaultCurrency: defaultCurrency || null,
          defaultCountry,
          autoCategorize,
          enrichmentRequired,
          rows: parseData.parsed.rows,
          mapping,
          excludedRowNumbers: [...excludedRows],
          rowOverrides,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import execution failed");
      setExecResult(data);
      setStep(6);
      await refreshJobs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import execution failed.");
    } finally {
      setBusy(false);
    }
  }

  const allCategories = useMemo(() => {
    const set = new Set<string>();
    for (const r of analyzedRows) {
      for (const c of r.normalized.niche_tags) set.add(c);
    }
    return [...set].sort();
  }, [analyzedRows]);

  const filteredPreviewRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return analyzedRows.filter((r) => {
      if (statusFilter !== "all" && r.classification !== statusFilter) return false;
      if (categoryFilter === "__unclassified" && r.normalized.niche_tags.length > 0) return false;
      if (categoryFilter !== "all" && categoryFilter !== "__unclassified" && !r.normalized.niche_tags.includes(categoryFilter)) {
        return false;
      }
      if (q) {
        const hay = `${r.normalized.name ?? ""} ${r.normalized.handle ?? ""} ${r.normalized.email ?? ""} ${r.normalized.city ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [analyzedRows, statusFilter, categoryFilter, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredPreviewRows.length / PAGE_SIZE));
  const pagedPreviewRows = filteredPreviewRows.slice((previewPage - 1) * PAGE_SIZE, previewPage * PAGE_SIZE);

  const duplicateConflictRows = useMemo(
    () => analyzedRows.filter((r) => !r.excluded && (r.classification === "existing" || r.classification === "potential_duplicate")),
    [analyzedRows],
  );

  const activeMappingCount = Object.values(mapping).filter(Boolean).length;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-[#18191c]">Import Influencers</h1>
          <p className="mt-1 text-sm text-[#6b7280]">Upload, validate and organise your influencer database in minutes.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a href="/api/imports/template?format=csv" className={btnSecondary}>
            Download Sample CSV
          </a>
          <a href="/api/imports/template?format=xlsx" className={btnSecondary}>
            Download Sample Excel
          </a>
        </div>
      </div>

      {isViewer && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Your workspace role is <strong>Viewer</strong>. You can review import history, but importing or modifying influencer records is restricted.
        </div>
      )}

      {/* Multi-step Progress Stepper */}
      <div className="rounded-2xl border border-[#eceef2] bg-white p-3 shadow-[0_2px_12px_rgba(24,25,28,0.035)]">
        <ol className="grid grid-cols-2 gap-2 sm:grid-cols-6">
          {STEPS.map((s) => {
            const active = step === s.num;
            const completed = step > s.num;
            return (
              <li
                key={s.num}
                className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium transition ${
                  active
                    ? "bg-[#f97316] text-white shadow-sm"
                    : completed
                      ? "bg-orange-50 text-[#c2410c]"
                      : "bg-zinc-50 text-zinc-500"
                }`}
              >
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                    active ? "bg-white/20 text-white" : completed ? "bg-[#f97316] text-white" : "bg-zinc-200 text-zinc-600"
                  }`}
                >
                  {completed ? "✓" : s.num}
                </span>
                <span className="truncate">{s.label}</span>
              </li>
            );
          })}
        </ol>
      </div>

      {error && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span>{error}</span>
          {method === "google_sheets" && (
            <button
              type="button"
              onClick={() => {
                setMethod("csv");
                setError(null);
              }}
              className="rounded-lg bg-white px-3 py-1 text-xs font-semibold text-red-700 border border-red-200 hover:bg-red-100"
            >
              Switch to CSV Upload
            </button>
          )}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────
          STEP 1: UPLOAD FILE / SOURCE SELECTION
         ───────────────────────────────────────────────────────── */}
      {step === 1 && (
        <Card title="Step 1 · Choose Import Source">
          <div className="mb-4 flex flex-wrap gap-2">
            {(
              [
                ["csv", "CSV Upload"],
                ["excel", "Excel (.xlsx / .xls)"],
                ["google_sheets", "Google Sheets"],
                ["urls", "Quick Import (Bulk URLs)"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setMethod(key);
                  setError(null);
                }}
                className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                  method === key
                    ? "bg-[#f97316] text-white shadow-sm"
                    : "border border-[#e5e7eb] bg-white text-zinc-700 hover:bg-zinc-50"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {(method === "csv" || method === "excel") && (
            <div className="space-y-3">
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragActive(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f && !isViewer) void handleFileParse(f);
                }}
                className={`flex flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-12 text-center transition ${
                  dragActive ? "border-[#f97316] bg-orange-50/60" : "border-zinc-200 bg-[#fafbfc]"
                }`}
              >
                <p className="text-sm font-semibold text-zinc-800">
                  Drag and drop your {method === "csv" ? "CSV" : "Excel (.xlsx / .xls)"} file here
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  Supported formats: .csv, .xlsx, .xls · Max {maxMbLabel} MB · Up to {maxRows.toLocaleString("en-IN")} rows
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={method === "csv" ? ".csv,.tsv,.txt" : ".xlsx,.xls"}
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f && !isViewer) void handleFileParse(f);
                  }}
                />
                <button
                  type="button"
                  disabled={busy || isViewer}
                  onClick={() => fileInputRef.current?.click()}
                  className={`${btnPrimary} mt-4`}
                >
                  {busy ? "Parsing file…" : "Browse Files"}
                </button>
                {selectedFile && (
                  <p className="mt-2 text-xs text-zinc-500">
                    Last selected: <span className="font-medium text-zinc-700">{selectedFile.name}</span>
                  </p>
                )}
              </div>

              {uploadProgress > 0 && (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-zinc-500">
                    <span>Uploading & parsing…</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100">
                    <div className="h-full bg-[#f97316] transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                  </div>
                </div>
              )}
            </div>
          )}

          {method === "google_sheets" && (
            <div className="space-y-4">
              <div className="rounded-xl border border-zinc-200 bg-[#fafbfc] p-3 text-xs text-zinc-600">
                {googleApiConfigured ? (
                  <span>Google Sheets credentials detected. You can import public/published sheets or authorized spreadsheets.</span>
                ) : (
                  <span>
                    <strong>Google OAuth is not configured</strong> (optional <code>GOOGLE_SHEETS_API_KEY</code>). You can still import any{" "}
                    <strong>published-to-web CSV</strong> or <strong>Anyone with the link</strong> Google Sheet URL below, or download your sheet as CSV and upload it.
                  </span>
                )}
              </div>
              <Field
                label="Google Sheets URL"
                hint="Paste a https://docs.google.com/spreadsheets/d/... link (shared as 'Anyone with the link' or 'Publish to web → CSV')."
              >
                <input
                  type="url"
                  value={googleUrl}
                  onChange={(e) => setGoogleUrl(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                  className={inputCls}
                />
              </Field>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy || isViewer || !googleUrl.trim()}
                  onClick={() => handleGoogleSheetParse()}
                  className={btnPrimary}
                >
                  {busy ? "Fetching sheet…" : "Load Google Sheet"}
                </button>
                <button type="button" onClick={() => setMethod("csv")} className={btnSecondary}>
                  Use CSV Upload Instead
                </button>
              </div>
            </div>
          )}

          {method === "urls" && (
            <div className="space-y-4">
              <Field
                label="Bulk Social Media Profile URLs or Usernames (Quick Import)"
                hint="Paste one Instagram, YouTube, Facebook, or other profile URL/username per line. Thunder will never scrape private pages or fabricate missing follower/contact metrics."
              >
                <textarea
                  rows={8}
                  value={bulkUrlsText}
                  onChange={(e) => setBulkUrlsText(e.target.value)}
                  placeholder={"https://www.instagram.com/creator_one/\n@creator_two\nhttps://www.youtube.com/@techchannel\nhttps://www.facebook.com/foodpage"}
                  className={inputCls}
                />
              </Field>

              {bulkUrlPreview.length > 0 && (
                <div className="rounded-xl border border-[#eceef2] bg-[#fafbfc] p-3">
                  <div className="mb-2 flex flex-wrap gap-3 text-xs text-zinc-600">
                    <span>Lines: <strong>{bulkUrlPreview.length}</strong></span>
                    <span>Valid: <strong className="text-emerald-700">{bulkUrlPreview.filter((x) => x.valid && !x.duplicateInPaste).length}</strong></span>
                    <span>Duplicates in paste: <strong className="text-amber-700">{bulkUrlPreview.filter((x) => x.duplicateInPaste).length}</strong></span>
                    <span>Invalid: <strong className="text-red-600">{bulkUrlPreview.filter((x) => !x.valid).length}</strong></span>
                  </div>
                  <div className="max-h-48 overflow-y-auto text-xs">
                    <table className="w-full">
                      <thead className="text-left text-zinc-500">
                        <tr><th className="py-1">Line</th><th>Platform</th><th>Normalized Handle / URL</th><th>Status</th></tr>
                      </thead>
                      <tbody>
                        {bulkUrlPreview.slice(0, 50).map((item) => (
                          <tr key={item.lineNumber} className="border-t border-zinc-100">
                            <td className="py-1 text-zinc-400">#{item.lineNumber}</td>
                            <td className="py-1 font-medium">{cap(item.platform)}</td>
                            <td className="py-1 truncate max-w-xs">{item.canonicalUrl ?? item.rawInput}</td>
                            <td className="py-1">
                              {!item.valid ? (
                                <Badge tone="red">{item.error || "Invalid"}</Badge>
                              ) : item.duplicateInPaste ? (
                                <Badge tone="zinc">Duplicate in paste</Badge>
                              ) : (
                                <Badge tone="green">Ready</Badge>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busy || isViewer || bulkUrlPreview.length === 0}
                  onClick={handleBulkUrlsContinue}
                  className={btnPrimary}
                >
                  {busy ? "Validating…" : "Continue to Validate"}
                </button>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* ─────────────────────────────────────────────────────────
          STEP 2: MAP COLUMNS
         ───────────────────────────────────────────────────────── */}
      {step === 2 && parseData && (
        <div className="space-y-4">
          <Card title="Step 2 · Worksheet, Header Row & Import Defaults">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {parseData.parsed.sheetNames.length > 1 && (
                <Field label="Excel Worksheet">
                  <select
                    value={parseData.parsed.selectedSheet}
                    onChange={(e) => selectedFile && handleFileParse(selectedFile, { sheetName: e.target.value })}
                    className={inputCls}
                  >
                    {parseData.parsed.sheetNames.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </Field>
              )}

              <Field
                label="Header Row"
                hint={`Auto-detected row ${parseData.parsed.detectedHeaderRow + 1}`}
              >
                <select
                  value={parseData.parsed.headerRow}
                  onChange={(e) => {
                    const nextRow = Number(e.target.value);
                    if (parseData.sourceType === "google_sheets") void handleGoogleSheetParse(nextRow);
                    else if (selectedFile) void handleFileParse(selectedFile, { sheetName: parseData.parsed.selectedSheet, headerRow: nextRow });
                  }}
                  className={inputCls}
                >
                  {Array.from({ length: Math.min(10, Math.max(1, parseData.parsed.rawPreviewRows.length)) }, (_, i) => (
                    <option key={i} value={i}>Row {i + 1}</option>
                  ))}
                </select>
              </Field>

              <Field label="Default Phone Country">
                <select
                  value={defaultCountry}
                  onChange={(e) => setDefaultCountry(e.target.value as CountryCode)}
                  className={inputCls}
                >
                  <option value="IN">India (+91)</option>
                  <option value="US">United States (+1)</option>
                  <option value="GB">United Kingdom (+44)</option>
                  <option value="AE">UAE (+971)</option>
                  <option value="SG">Singapore (+65)</option>
                </select>
              </Field>

              <Field label="Default Pricing Currency">
                <select
                  value={defaultCurrency}
                  onChange={(e) => setDefaultCurrency(e.target.value)}
                  className={inputCls}
                >
                  <option value="INR">INR (₹)</option>
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (€)</option>
                  <option value="GBP">GBP (£)</option>
                  <option value="">None (only when explicit in cell)</option>
                </select>
              </Field>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-100 pt-3">
              <label className="flex items-center gap-2 text-sm text-zinc-700">
                <input
                  type="checkbox"
                  checked={autoCategorize}
                  onChange={(e) => setAutoCategorize(e.target.checked)}
                />
                Auto-categorise unclassified influencers from bio/tags using rule-based keyword dictionary
              </label>

              <div className="flex flex-wrap items-center gap-2">
                {templates.length > 0 && (
                  <select
                    defaultValue=""
                    onChange={(e) => e.target.value && applyTemplate(e.target.value)}
                    className={`${inputCls} w-auto`}
                  >
                    <option value="">Load saved mapping template…</option>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                )}
                <input
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="New template name…"
                  className={`${inputCls} w-44`}
                />
                <button type="button" onClick={handleSaveTemplate} className={btnSecondary}>
                  Save Mapping
                </button>
              </div>
            </div>
          </Card>

          <Card
            title={`Column Mapping (${activeMappingCount} of ${parseData.parsed.headers.length} columns mapped · ${parseData.parsed.rows.length} rows)`}
          >
            {parseData.parsed.truncated && (
              <p className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
                File contains {parseData.parsed.totalRowsBeforeLimit.toLocaleString("en-IN")} rows; bounded to the first {maxRows.toLocaleString("en-IN")} rows.
              </p>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-[#e5e7eb] text-left text-xs font-medium text-slate-500">
                  <tr>
                    <th className="p-2">Spreadsheet Column</th>
                    <th className="p-2">Sample Values</th>
                    <th className="p-2">Suggested Thunder Field</th>
                    <th className="p-2">Confidence</th>
                    <th className="p-2">Destination Field</th>
                  </tr>
                </thead>
                <tbody>
                  {parseData.parsed.headers.map((header) => {
                    const sug = suggestions.find((s) => s.sourceColumn === header);
                    const currentTarget = mapping[header] ?? null;
                    const confidencePct = sug ? Math.round(sug.confidence * 100) : 0;
                    return (
                      <tr key={header} className="border-b border-zinc-100 last:border-0">
                        <td className="p-2 font-medium text-zinc-900">{header}</td>
                        <td className="p-2 text-xs text-zinc-500 max-w-xs truncate">
                          {sug?.sampleValues.length ? sug.sampleValues.join(" · ") : "–"}
                        </td>
                        <td className="p-2 text-xs">
                          {sug?.targetField ? (
                            <span className="text-zinc-700">{THUNDER_FIELDS.find((f) => f.key === sug.targetField)?.label}</span>
                          ) : (
                            <span className="text-zinc-400">Unmapped</span>
                          )}
                          {sug?.needsReview && (
                            <span className="ml-2"><Badge tone="amber">Review</Badge></span>
                          )}
                        </td>
                        <td className="p-2">
                          {sug && sug.confidence > 0 ? (
                            <Badge tone={sug.confidence >= 0.85 ? "green" : sug.confidence >= 0.7 ? "amber" : "zinc"}>
                              {confidencePct}%
                            </Badge>
                          ) : (
                            <span className="text-xs text-zinc-400">–</span>
                          )}
                        </td>
                        <td className="p-2">
                          <select
                            value={currentTarget ?? ""}
                            onChange={(e) => updateColumnMapping(header, (e.target.value || null) as ThunderFieldKey | null)}
                            className={inputCls}
                          >
                            <option value="">Ignore column</option>
                            {FIELD_GROUPS.map((group) => (
                              <optgroup key={group} label={group}>
                                {THUNDER_FIELDS.filter((f) => f.group === group).map((f) => {
                                  const claimedBy = mappedTargetsUsed.get(f.key);
                                  const isTakenElsewhere = Boolean(claimedBy && claimedBy !== header);
                                  return (
                                    <option key={f.key} value={f.key}>
                                      {f.label}{isTakenElsewhere ? ` (currently ${claimedBy})` : ""}
                                    </option>
                                  );
                                })}
                              </optgroup>
                            ))}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex flex-wrap justify-between gap-2">
              <div className="flex gap-2">
                <button type="button" onClick={() => setStep(1)} className={btnSecondary}>Back</button>
                <button type="button" onClick={resetWizard} className={btnSecondary}>Cancel</button>
              </div>
              <button
                type="button"
                disabled={busy || activeMappingCount === 0}
                onClick={() => runServerValidation()}
                className={btnPrimary}
              >
                {busy ? "Validating…" : "Continue to Validate"}
              </button>
            </div>
          </Card>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────
          STEP 3: VALIDATE DATA (PREVIEW DASHBOARD)
         ───────────────────────────────────────────────────────── */}
      {step === 3 && summary && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {[
              ["Total", summary.total, "text-zinc-900"],
              ["New", summary.newCount, "text-emerald-700"],
              ["Existing", summary.existingCount, "text-amber-700"],
              ["In-File Dupes", summary.duplicateInFileCount, "text-zinc-600"],
              ["Potential Dupes", summary.potentialDuplicateCount, "text-amber-700"],
              ["Invalid", summary.invalidCount, "text-red-600"],
              ["Ready", summary.readyToImportCount, "text-[#f97316]"],
            ].map(([label, val, cls]) => (
              <div key={String(label)} className="rounded-2xl border border-[#eceef2] bg-white p-3 shadow-[0_2px_12px_rgba(24,25,28,0.035)]">
                <div className="text-xs text-zinc-500">{label}</div>
                <div className={`mt-1 text-xl font-semibold tabular-nums ${cls}`}>{val}</div>
              </div>
            ))}
          </div>

          <Card
            title="Step 3 · Validation & Preview"
            actions={
              summary.invalidCount > 0 ? (
                <button type="button" onClick={downloadInvalidCsv} className={btnSecondary}>
                  Download Invalid Records ({summary.invalidCount})
                </button>
              ) : null
            }
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setPreviewPage(1);
                  }}
                  placeholder="Search name, @handle, email, city…"
                  className={`${inputCls} w-60`}
                />
                <select
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setPreviewPage(1);
                  }}
                  className={`${inputCls} w-auto`}
                >
                  <option value="all">All statuses</option>
                  <option value="new">New</option>
                  <option value="existing">Existing</option>
                  <option value="duplicate_in_file">Duplicate in file</option>
                  <option value="potential_duplicate">Potential duplicate</option>
                  <option value="requires_review">Needs review</option>
                  <option value="invalid">Invalid</option>
                </select>
                <select
                  value={categoryFilter}
                  onChange={(e) => {
                    setCategoryFilter(e.target.value);
                    setPreviewPage(1);
                  }}
                  className={`${inputCls} w-auto`}
                >
                  <option value="all">All categories</option>
                  <option value="__unclassified">Unclassified</option>
                  {allCategories.map((c) => (
                    <option key={c} value={c}>{cap(c)}</option>
                  ))}
                </select>
              </div>

              {selectedRows.size > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-600">{selectedRows.size} selected</span>
                  <button
                    type="button"
                    onClick={() => toggleRowExclusion([...selectedRows], true)}
                    className="rounded-lg border border-red-200 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                  >
                    Exclude selected
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleRowExclusion([...selectedRows], false)}
                    className="rounded-lg border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                  >
                    Include selected
                  </button>
                </div>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-[#e5e7eb] text-left text-xs font-medium text-slate-500">
                  <tr>
                    <th className="w-8 p-2">
                      <input
                        type="checkbox"
                        checked={pagedPreviewRows.length > 0 && pagedPreviewRows.every((r) => selectedRows.has(r.rowNumber))}
                        onChange={(e) => {
                          const next = new Set(selectedRows);
                          for (const r of pagedPreviewRows) {
                            if (e.target.checked) next.add(r.rowNumber);
                            else next.delete(r.rowNumber);
                          }
                          setSelectedRows(next);
                        }}
                      />
                    </th>
                    <th className="p-2">Row</th>
                    <th className="p-2">Influencer</th>
                    <th className="p-2">Socials</th>
                    <th className="p-2 text-right">Followers</th>
                    <th className="p-2">Category & Tier</th>
                    <th className="p-2">Status & Messages</th>
                    <th className="p-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedPreviewRows.map((row) => {
                    const b = CLASSIFICATION_BADGE[row.classification];
                    return (
                      <tr
                        key={row.rowNumber}
                        className={`border-b border-zinc-100 last:border-0 ${row.excluded ? "opacity-50 bg-zinc-50" : ""}`}
                      >
                        <td className="p-2">
                          <input
                            type="checkbox"
                            checked={selectedRows.has(row.rowNumber)}
                            onChange={(e) => {
                              const next = new Set(selectedRows);
                              if (e.target.checked) next.add(row.rowNumber);
                              else next.delete(row.rowNumber);
                              setSelectedRows(next);
                            }}
                          />
                        </td>
                        <td className="p-2 text-xs tabular-nums text-zinc-500">#{row.rowNumber}</td>
                        <td className="p-2">
                          <div className="font-medium text-zinc-900">{row.normalized.name || "–"}</div>
                          <div className="text-xs text-zinc-500">
                            {[row.normalized.email, row.normalized.phone, row.normalized.city].filter(Boolean).join(" · ") || "No contact/city"}
                          </div>
                        </td>
                        <td className="p-2 text-xs text-zinc-600">
                          {row.normalized.handle && <div>IG: @{row.normalized.handle}</div>}
                          {row.normalized.youtube_channel_url && <div className="truncate max-w-44">YT: {row.normalized.youtube_channel_url}</div>}
                          {row.normalized.facebook_profile_url && <div className="truncate max-w-44">FB: {row.normalized.facebook_profile_url}</div>}
                        </td>
                        <td className="p-2 text-right tabular-nums text-xs">
                          <div>{row.normalized.followers !== null ? compact(row.normalized.followers) : "–"}</div>
                          {row.normalized.youtube_subscribers !== null && (
                            <div className="text-zinc-500">YT: {compact(row.normalized.youtube_subscribers)}</div>
                          )}
                        </td>
                        <td className="p-2 text-xs">
                          <div className="flex flex-wrap gap-1">
                            {row.normalized.niche_tags.length > 0 ? (
                              row.normalized.niche_tags.map((c) => <Badge key={c}>{cap(c)}</Badge>)
                            ) : (
                              <span className="text-zinc-400">Unclassified</span>
                            )}
                          </div>
                          <div className="mt-1 text-[11px] text-zinc-500">
                            Tier: {cap(row.normalized.platform_tiers.overall)}
                            {row.normalized.auto_categorized ? " · auto-categorised" : ""}
                          </div>
                        </td>
                        <td className="p-2 text-xs">
                          <div className="flex flex-wrap items-center gap-1">
                            <Badge tone={b.tone}>{b.label}</Badge>
                            {row.excluded && <Badge tone="zinc">Excluded</Badge>}
                          </div>
                          {row.errors.length > 0 && <div className="mt-1 text-red-600">{row.errors.join("; ")}</div>}
                          {row.matchReason && <div className="mt-1 text-amber-800">{row.matchReason}</div>}
                          {row.warnings.length > 0 && <div className="mt-1 text-amber-700">{row.warnings.join("; ")}</div>}
                        </td>
                        <td className="p-2 text-right whitespace-nowrap">
                          <div className="inline-flex gap-1">
                            <button
                              type="button"
                              onClick={() => openEditRow(row)}
                              className="rounded-lg border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => toggleRowExclusion([row.rowNumber], !row.excluded)}
                              className="rounded-lg border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                            >
                              {row.excluded ? "Include" : "Exclude"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="mt-3 flex items-center justify-between text-xs text-zinc-600">
                <span>
                  Page {previewPage} of {totalPages} ({filteredPreviewRows.length} matching rows)
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={previewPage <= 1}
                    onClick={() => setPreviewPage((p) => p - 1)}
                    className={btnSecondary}
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    disabled={previewPage >= totalPages}
                    onClick={() => setPreviewPage((p) => p + 1)}
                    className={btnSecondary}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}

            <div className="mt-4 flex flex-wrap justify-between gap-2 border-t border-zinc-100 pt-4">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setStep(method === "urls" ? 1 : 2)}
                  className={btnSecondary}
                >
                  Back
                </button>
                <button type="button" onClick={resetWizard} className={btnSecondary}>Cancel</button>
              </div>
              <button
                type="button"
                disabled={summary.readyToImportCount === 0}
                onClick={() => setStep(4)}
                className={btnPrimary}
              >
                Continue to Duplicates ({summary.readyToImportCount} ready)
              </button>
            </div>
          </Card>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────
          STEP 4: REVIEW AND RESOLVE DUPLICATES
         ───────────────────────────────────────────────────────── */}
      {step === 4 && summary && (
        <div className="space-y-4">
          <Card title="Step 4 · Duplicate Handling Strategy">
            <div className="grid gap-3 md:grid-cols-3">
              {(
                [
                  [
                    "merge",
                    "Merge missing information (Recommended)",
                    "Populate blank or missing fields on existing influencers while preserving all existing data.",
                  ],
                  [
                    "update",
                    "Update existing",
                    "Overwrite existing mapped fields with valid non-empty incoming values.",
                  ],
                  [
                    "skip",
                    "Skip existing",
                    "Leave all existing influencers untouched and only insert new records.",
                  ],
                ] as const
              ).map(([value, title, desc]) => (
                <label
                  key={value}
                  className={`cursor-pointer rounded-2xl border p-4 transition ${
                    duplicateStrategy === value
                      ? "border-[#f97316] bg-orange-50/50"
                      : "border-[#eceef2] bg-white hover:bg-zinc-50"
                  }`}
                >
                  <div className="flex items-center gap-2 font-medium text-zinc-900">
                    <input
                      type="radio"
                      name="duplicateStrategy"
                      checked={duplicateStrategy === value}
                      onChange={() => setDuplicateStrategy(value)}
                    />
                    {title}
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">{desc}</p>
                </label>
              ))}
            </div>
          </Card>

          <Card title={`Side-by-Side Duplicate Comparison (${duplicateConflictRows.length} matched / potential conflicts)`}>
            {duplicateConflictRows.length === 0 ? (
              <p className="text-sm text-zinc-500">
                No existing database duplicates or conflicts detected for the active records.
              </p>
            ) : (
              <div className="space-y-4">
                {duplicateConflictRows.slice(0, 50).map((row) => (
                  <div key={row.rowNumber} className="rounded-xl border border-[#eceef2] p-3">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm font-medium text-zinc-900">
                        Row #{row.rowNumber}: {row.normalized.name || "Unnamed"}{" "}
                        {row.normalized.handle ? <span className="text-zinc-500">@{row.normalized.handle}</span> : null}
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge tone="amber">{row.classification === "existing" ? "Existing match" : "Potential duplicate"}</Badge>
                        <button
                          type="button"
                          onClick={() => toggleRowExclusion([row.rowNumber], true)}
                          className="rounded-lg border border-zinc-200 px-2.5 py-1 text-xs text-zinc-700 hover:bg-zinc-50"
                        >
                          Exclude Row
                        </button>
                      </div>
                    </div>
                    {row.matchReason && <p className="mb-2 text-xs text-amber-800">{row.matchReason}</p>}
                    {row.comparisons.length > 0 && (
                      <table className="w-full text-xs">
                        <thead className="border-b border-zinc-200 text-left text-zinc-500">
                          <tr>
                            <th className="py-1 pr-2">Field</th>
                            <th className="py-1 pr-2">Existing in Thunder</th>
                            <th className="py-1">Incoming</th>
                          </tr>
                        </thead>
                        <tbody>
                          {row.comparisons.map((c) => (
                            <tr key={c.field} className={`border-b border-zinc-100 last:border-0 ${c.conflicting ? "bg-amber-50/60" : ""}`}>
                              <td className="py-1 pr-2 font-medium text-zinc-700">{c.label}</td>
                              <td className="py-1 pr-2 text-zinc-600">{c.existingValue}</td>
                              <td className="py-1 text-zinc-900 font-medium">{c.incomingValue}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4 flex flex-wrap justify-between gap-2 border-t border-zinc-100 pt-4">
              <div className="flex gap-2">
                <button type="button" onClick={() => setStep(3)} className={btnSecondary}>Back</button>
                <button type="button" onClick={resetWizard} className={btnSecondary}>Cancel</button>
              </div>
              <button type="button" onClick={() => setStep(5)} className={btnPrimary}>
                Continue to Confirm
              </button>
            </div>
          </Card>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────
          STEP 5: CONFIRM IMPORT
         ───────────────────────────────────────────────────────── */}
      {step === 5 && summary && parseData && (
        <Card title="Step 5 · Confirm Import">
          <div className="rounded-xl border border-orange-200 bg-orange-50/70 px-4 py-3 text-sm text-zinc-800">
            No influencer records have been created or updated yet. Review the import plan below and click{" "}
            <strong>Confirm Import</strong> to commit changes to Thunder.
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-[#eceef2] p-3">
              <div className="text-xs text-zinc-500">Source</div>
              <div className="mt-1 text-sm font-semibold text-zinc-900">{parseData.fileName}</div>
            </div>
            <div className="rounded-xl border border-[#eceef2] p-3">
              <div className="text-xs text-zinc-500">Duplicate Handling</div>
              <div className="mt-1 text-sm font-semibold text-zinc-900">{cap(duplicateStrategy)} existing</div>
            </div>
            <div className="rounded-xl border border-[#eceef2] p-3">
              <div className="text-xs text-zinc-500">New + Potential to Create</div>
              <div className="mt-1 text-sm font-semibold text-emerald-700">
                {analyzedRows.filter((r) => !r.excluded && (r.classification === "new" || r.classification === "requires_review" || r.classification === "potential_duplicate")).length}
              </div>
            </div>
            <div className="rounded-xl border border-[#eceef2] p-3">
              <div className="text-xs text-zinc-500">Existing Matched ({duplicateStrategy})</div>
              <div className="mt-1 text-sm font-semibold text-amber-700">
                {analyzedRows.filter((r) => !r.excluded && r.classification === "existing").length}
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap justify-between gap-2 border-t border-zinc-100 pt-4">
            <div className="flex gap-2">
              <button type="button" disabled={busy} onClick={() => setStep(4)} className={btnSecondary}>Back</button>
              <button type="button" disabled={busy} onClick={resetWizard} className={btnDanger}>Cancel</button>
            </div>
            <button
              type="button"
              disabled={busy || isViewer}
              onClick={handleConfirmImport}
              className={btnPrimary}
            >
              {busy ? "Importing records…" : "Confirm Import"}
            </button>
          </div>
        </Card>
      )}

      {/* ─────────────────────────────────────────────────────────
          STEP 6: IMPORT RESULTS
         ───────────────────────────────────────────────────────── */}
      {step === 6 && execResult && (
        <Card title="Step 6 · Import Results">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {[
              ["Processed", execResult.totalProcessed, "text-zinc-900"],
              ["Created", execResult.created, "text-emerald-700"],
              ["Updated", execResult.updated, "text-blue-700"],
              ["Merged", execResult.merged, "text-blue-700"],
              ["Skipped", execResult.skipped, "text-zinc-600"],
              ["Failed", execResult.failed, "text-red-600"],
              ["Duration", `${(execResult.durationMs / 1000).toFixed(2)}s`, "text-zinc-700"],
            ].map(([label, val, cls]) => (
              <div key={String(label)} className="rounded-2xl border border-[#eceef2] bg-[#fafbfc] p-3">
                <div className="text-xs text-zinc-500">{label}</div>
                <div className={`mt-1 text-xl font-semibold tabular-nums ${cls}`}>{val}</div>
              </div>
            ))}
          </div>

          {execResult.failedRows.length > 0 && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50/50 p-3">
              <div className="mb-2 text-xs font-semibold text-red-800">Failed Records ({execResult.failedRows.length})</div>
              <ul className="max-h-48 space-y-1 overflow-y-auto text-xs text-red-700">
                {execResult.failedRows.map((fr) => (
                  <li key={fr.rowNumber}>
                    Row #{fr.rowNumber} ({fr.name || fr.handle || "Unnamed"}): {fr.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-5 flex flex-wrap gap-2">
            <Link href="/influencers" className={btnPrimary}>
              View Imported Influencers
            </Link>
            {execResult.failed > 0 && (
              <a href={`/api/imports/jobs/${execResult.jobId}?download=failed`} className={btnSecondary}>
                Download Failed Records
              </a>
            )}
            <a href={`/api/imports/jobs/${execResult.jobId}?download=all`} className={btnSecondary}>
              Download Import Report
            </a>
            <button type="button" onClick={resetWizard} className={btnSecondary}>
              Import Another File
            </button>
          </div>
        </Card>
      )}

      {/* Inline Row Editor Modal */}
      {editingRow && parseData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[85vh] w-full max-w-2xl overflow-hidden rounded-2xl border border-[#eceef2] bg-white shadow-xl flex flex-col">
            <div className="flex items-center justify-between border-b border-[#eceef2] px-5 py-4">
              <h3 className="text-base font-semibold text-zinc-900">Edit Row #{editingRow.rowNumber}</h3>
              <button type="button" onClick={() => setEditingRow(null)} className={btnSecondary}>Close</button>
            </div>
            <div className="grid gap-3 overflow-y-auto p-5 sm:grid-cols-2">
              {parseData.parsed.headers.map((h) => (
                <Field key={h} label={h}>
                  <input
                    value={editDraft[h] ?? ""}
                    onChange={(e) => setEditDraft((prev) => ({ ...prev, [h]: e.target.value }))}
                    className={inputCls}
                  />
                </Field>
              ))}
            </div>
            <div className="flex justify-end gap-2 border-t border-[#eceef2] px-5 py-3">
              <button type="button" onClick={() => setEditingRow(null)} className={btnSecondary}>Cancel</button>
              <button type="button" onClick={saveEditedRow} className={btnPrimary}>Save & Re-validate</button>
            </div>
          </div>
        </div>
      )}

      {/* Import History */}
      <ImportHistory
        jobs={jobs}
        currentUserId={currentUserId}
        userRole={userRole}
        onRefresh={refreshJobs}
      />
    </div>
  );
}
