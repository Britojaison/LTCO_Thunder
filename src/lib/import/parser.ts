import Papa from "papaparse";
import * as XLSX from "xlsx";

/**
 * Rule-based CSV & Excel parsing engine with security limits:
 * - File extension & magic-byte checks
 * - Configurable max file size (default 10 MB) and row count (default 10,000)
 * - Decompression-bomb / oversized sheet guard
 * - Automatic header row detection with manual override
 * - Empty row removal, UTF-8 & regional text preservation
 * - Duplicate column heading disambiguation
 */

export const DEFAULT_MAX_FILE_BYTES = Number(process.env.IMPORT_MAX_FILE_BYTES) || 10 * 1024 * 1024;
export const DEFAULT_MAX_ROWS = Number(process.env.IMPORT_MAX_ROWS) || 10_000;
export const MAX_COLUMNS = 120;
export const MAX_CELL_CHARS = 10_000;

const HEADER_KEYWORDS = new Set([
  "name", "influencer", "creator", "handle", "username", "instagram", "ig", "youtube", "yt",
  "facebook", "email", "mail", "phone", "mobile", "whatsapp", "followers", "subscribers",
  "engagement", "er", "views", "likes", "comments", "category", "niche", "city", "state",
  "country", "language", "rate", "cost", "pricing", "price", "reel", "story", "bio", "tags", "notes",
]);

export interface ParsedTableResult {
  fileType: "csv" | "excel";
  sheetNames: string[];
  selectedSheet: string;
  detectedHeaderRow: number;
  headerRow: number;
  headers: string[];
  rows: Record<string, string>[];
  rawPreviewRows: string[][];
  totalRowsBeforeLimit: number;
  truncated: boolean;
  delimiter?: string;
}

export class ImportParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportParseError";
  }
}

function sanitizeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value).replace(/\r\n/g, "\n").trim();
  return str.length > MAX_CELL_CHARS ? str.slice(0, MAX_CELL_CHARS) : str;
}

function isEmptyRow(row: string[]): boolean {
  return row.every((cell) => sanitizeCell(cell) === "");
}

/** Validates file extension and magic bytes to prevent spoofed/malicious uploads. */
export function validateUploadedFileMeta(fileName: string, bytes: Uint8Array, maxBytes = DEFAULT_MAX_FILE_BYTES): "csv" | "xlsx" | "xls" {
  const lower = fileName.trim().toLowerCase();
  if (bytes.byteLength === 0) throw new ImportParseError("The uploaded file is empty.");
  if (bytes.byteLength > maxBytes) {
    const mb = (maxBytes / (1024 * 1024)).toFixed(1);
    throw new ImportParseError(`File exceeds the ${mb} MB limit.`);
  }

  if (lower.endsWith(".csv") || lower.endsWith(".tsv") || lower.endsWith(".txt")) {
    // Reject binary files pretending to be CSV (null bytes in first 8 KB)
    const sample = bytes.subarray(0, Math.min(8192, bytes.length));
    for (let i = 0; i < sample.length; i++) {
      if (sample[i] === 0) throw new ImportParseError("Invalid CSV file: binary content detected.");
    }
    return "csv";
  }

  if (lower.endsWith(".xlsx")) {
    // ZIP magic bytes: PK\x03\x04 or empty zip PK\x05\x06
    if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
      throw new ImportParseError("Invalid .xlsx file: signature does not match an Excel workbook.");
    }
    return "xlsx";
  }

  if (lower.endsWith(".xls")) {
    // OLE2 Compound Document D0 CF 11 E0 or XML-based 2003 Excel ("<?xml" / "<Workbook")
    const isOle = bytes.length >= 4 && bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0;
    const head = new TextDecoder("utf-8", { fatal: false }).decode(bytes.subarray(0, 64)).trimStart();
    const isXmlSpreadsheet = head.startsWith("<?xml") || head.startsWith("<Workbook") || head.startsWith("<html");
    if (!isOle && !isXmlSpreadsheet) {
      throw new ImportParseError("Invalid .xls file: signature does not match an Excel 97–2003 workbook.");
    }
    return "xls";
  }

  throw new ImportParseError("Unsupported file format. Upload a CSV or Excel file. If your data is in a PDF, export it to CSV or Excel first.");
}

/** Scores candidate rows in the top 10 rows to detect the most likely header row index. */
export function detectHeaderRowIndex(matrix: string[][]): number {
  const limit = Math.min(10, matrix.length);
  let bestIdx = 0;
  let bestScore = -1;

  for (let i = 0; i < limit; i++) {
    const row = matrix[i].map(sanitizeCell);
    const nonEmpty = row.filter(Boolean);
    if (nonEmpty.length === 0) continue;

    // Headers shouldn't look mostly numeric or like URLs
    const textCells = nonEmpty.filter((c) => !/^\d[\d,.\s%kKmMlL]*$/.test(c) && !/^https?:\/\//i.test(c));
    const uniqueRatio = new Set(nonEmpty.map((c) => c.toLowerCase())).size / nonEmpty.length;

    let keywordHits = 0;
    for (const cell of nonEmpty) {
      const tokens = cell.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/);
      if (tokens.some((t) => HEADER_KEYWORDS.has(t))) keywordHits += 1;
    }

    const score = nonEmpty.length * 1.5 + textCells.length * 1.5 + uniqueRatio * 3 + keywordHits * 4 - i * 0.2;
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }

  return bestIdx;
}

/** Disambiguates blank or duplicate header names cleanly: "Phone", "Phone (2)". */
export function makeUniqueHeaders(rawHeaders: string[]): string[] {
  const counts = new Map<string, number>();
  return rawHeaders.slice(0, MAX_COLUMNS).map((h, idx) => {
    const base = sanitizeCell(h) || `Column ${idx + 1}`;
    const key = base.toLowerCase();
    const seen = (counts.get(key) ?? 0) + 1;
    counts.set(key, seen);
    return seen === 1 ? base : `${base} (${seen})`;
  });
}

function matrixToTable(
  matrix: string[][],
  fileType: "csv" | "excel",
  sheetNames: string[],
  selectedSheet: string,
  headerRowOverride?: number,
  maxRows = DEFAULT_MAX_ROWS,
  delimiter?: string,
): ParsedTableResult {
  const cleanedMatrix = matrix
    .map((r) => r.slice(0, MAX_COLUMNS).map(sanitizeCell))
    .filter((r) => !isEmptyRow(r));

  if (cleanedMatrix.length === 0) {
    throw new ImportParseError("No non-empty rows were found in this file.");
  }

  const detectedHeaderRow = detectHeaderRowIndex(cleanedMatrix);
  const headerRow =
    headerRowOverride !== undefined && headerRowOverride >= 0 && headerRowOverride < cleanedMatrix.length
      ? headerRowOverride
      : detectedHeaderRow;

  const rawHeaderCells = cleanedMatrix[headerRow] ?? [];
  const colCount = Math.min(
    MAX_COLUMNS,
    Math.max(rawHeaderCells.length, ...cleanedMatrix.slice(headerRow + 1, headerRow + 20).map((r) => r.length)),
  );
  const paddedHeaders = Array.from({ length: colCount }, (_, idx) => rawHeaderCells[idx] ?? "");
  const headers = makeUniqueHeaders(paddedHeaders);

  const dataRowsMatrix = cleanedMatrix.slice(headerRow + 1);
  const totalRowsBeforeLimit = dataRowsMatrix.length;
  const truncated = totalRowsBeforeLimit > maxRows;
  const boundedMatrix = truncated ? dataRowsMatrix.slice(0, maxRows) : dataRowsMatrix;

  const rows: Record<string, string>[] = [];
  for (const rawRow of boundedMatrix) {
    const obj: Record<string, string> = {};
    let hasValue = false;
    for (let c = 0; c < headers.length; c++) {
      const header = headers[c];
      // Prevent prototype pollution keys
      if (header === "__proto__" || header === "constructor" || header === "prototype") continue;
      const val = sanitizeCell(rawRow[c] ?? "");
      if (val) hasValue = true;
      obj[header] = val;
    }
    if (hasValue) rows.push(obj);
  }

  return {
    fileType,
    sheetNames,
    selectedSheet,
    detectedHeaderRow,
    headerRow,
    headers,
    rows,
    rawPreviewRows: cleanedMatrix.slice(0, 12),
    totalRowsBeforeLimit,
    truncated,
    delimiter,
  };
}

export function parseCsvText(
  csvText: string,
  options?: { headerRow?: number; maxRows?: number },
): ParsedTableResult {
  // Strip UTF-8 BOM if present
  const cleanText = csvText.replace(/^\uFEFF/, "");
  const parsed = Papa.parse<string[]>(cleanText, {
    header: false,
    skipEmptyLines: "greedy",
    delimitersToGuess: [",", ";", "\t", "|"],
  });

  if (parsed.errors.length > 0 && parsed.data.length === 0) {
    throw new ImportParseError(`Could not parse CSV: ${parsed.errors[0].message}`);
  }

  return matrixToTable(
    parsed.data,
    "csv",
    ["CSV"],
    "CSV",
    options?.headerRow,
    options?.maxRows ?? DEFAULT_MAX_ROWS,
    parsed.meta.delimiter,
  );
}

export function parseExcelBuffer(
  bytes: Uint8Array,
  options?: { sheetName?: string; headerRow?: number; maxRows?: number },
): ParsedTableResult {
  const maxRows = options?.maxRows ?? DEFAULT_MAX_ROWS;
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(bytes, {
      type: "array",
      cellText: true,
      cellDates: false,
      raw: false,
      sheetRows: maxRows + 25, // Decompression bomb guard: stop reading cells far past maxRows
    });
  } catch (err) {
    throw new ImportParseError(`Failed to read Excel workbook: ${err instanceof Error ? err.message : "corrupt file"}`);
  }

  const sheetNames = workbook.SheetNames ?? [];
  if (sheetNames.length === 0) {
    throw new ImportParseError("The Excel workbook contains no worksheets.");
  }

  const selectedSheet =
    options?.sheetName && sheetNames.includes(options.sheetName) ? options.sheetName : sheetNames[0];
  const sheet = workbook.Sheets[selectedSheet];
  if (!sheet) {
    throw new ImportParseError(`Worksheet "${selectedSheet}" could not be loaded.`);
  }

  // Additional decompression-bomb guard on declared sheet range
  if (sheet["!ref"]) {
    const range = XLSX.utils.decode_range(sheet["!ref"]);
    const cellSpan = (range.e.r - range.s.r + 1) * (range.e.c - range.s.c + 1);
    if (cellSpan > 2_000_000) {
      throw new ImportParseError("Worksheet exceeds safe cell count limits.");
    }
  }

  const matrix = XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    defval: "",
    blankrows: false,
    raw: false,
  }) as string[][];

  return matrixToTable(matrix, "excel", sheetNames, selectedSheet, options?.headerRow, maxRows);
}

export function parseUploadedBytes(
  fileName: string,
  bytes: Uint8Array,
  options?: { sheetName?: string; headerRow?: number; maxRows?: number; maxBytes?: number },
): ParsedTableResult {
  const kind = validateUploadedFileMeta(fileName, bytes, options?.maxBytes ?? DEFAULT_MAX_FILE_BYTES);
  if (kind === "csv") {
    const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    return parseCsvText(text, options);
  }
  return parseExcelBuffer(bytes, options);
}

/** Escapes a cell for CSV export with formula-injection protection (=, +, -, @, tab, CR). */
export function escapeCsvCell(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function buildCsvDocument(headers: string[], rows: unknown[][]): string {
  const head = headers.map(escapeCsvCell).join(",");
  const body = rows.map((row) => row.map(escapeCsvCell).join(","));
  return "\uFEFF" + [head, ...body].join("\r\n");
}
