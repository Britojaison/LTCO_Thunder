import { NextResponse, type NextRequest } from "next/server";
import { requireWorkspace } from "@/lib/auth";
import { apiErrorResponse } from "@/lib/import/api-response";
import { fetchGoogleSheetCsv, isGoogleSheetsApiConfigured } from "@/lib/import/google-sheets";
import { suggestColumnMappings } from "@/lib/import/mapper";
import {
  DEFAULT_MAX_FILE_BYTES,
  DEFAULT_MAX_ROWS,
  parseCsvText,
  parseUploadedBytes,
} from "@/lib/import/parser";
import { listMappingTemplates, requireImportPermission } from "@/lib/services/imports";

export async function POST(request: NextRequest) {
  try {
    const { db, workspace, user } = await requireWorkspace();
    await requireImportPermission(db, workspace.id, user.id);

    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return NextResponse.json({ error: "Please attach a CSV or Excel file." }, { status: 400 });
      }
      const sheetNameRaw = form.get("sheetName");
      const headerRowRaw = form.get("headerRow");
      const sheetName = typeof sheetNameRaw === "string" && sheetNameRaw ? sheetNameRaw : undefined;
      const headerRow =
        typeof headerRowRaw === "string" && headerRowRaw !== "" && !Number.isNaN(Number(headerRowRaw))
          ? Number(headerRowRaw)
          : undefined;

      const bytes = new Uint8Array(await file.arrayBuffer());
      const parsed = parseUploadedBytes(file.name, bytes, {
        sheetName,
        headerRow,
        maxBytes: DEFAULT_MAX_FILE_BYTES,
        maxRows: DEFAULT_MAX_ROWS,
      });

      const suggestions = suggestColumnMappings(parsed.headers, parsed.rows);
      const templates = await listMappingTemplates(db, workspace.id);
      return NextResponse.json({
        sourceType: parsed.fileType,
        fileName: file.name,
        fileSize: bytes.byteLength,
        parsed,
        suggestions,
        templates,
        limits: { maxBytes: DEFAULT_MAX_FILE_BYTES, maxRows: DEFAULT_MAX_ROWS },
      });
    }

    // JSON body: Google Sheets URL
    const body = (await request.json().catch(() => ({}))) as {
      googleSheetUrl?: string;
      headerRow?: number;
    };

    if (!body.googleSheetUrl) {
      return NextResponse.json({ error: "Provide a file upload or a Google Sheets URL." }, { status: 400 });
    }

    const templates = await listMappingTemplates(db, workspace.id);
    const { csvText, ref } = await fetchGoogleSheetCsv(body.googleSheetUrl, DEFAULT_MAX_FILE_BYTES);
    const parsed = parseCsvText(csvText, {
      headerRow: typeof body.headerRow === "number" ? body.headerRow : undefined,
      maxRows: DEFAULT_MAX_ROWS,
    });
    const suggestions = suggestColumnMappings(parsed.headers, parsed.rows);

    return NextResponse.json({
      sourceType: "google_sheets",
      fileName: `google-sheet-${ref.spreadsheetId.slice(0, 8)}.csv`,
      sourceUrl: body.googleSheetUrl,
      googleApiConfigured: isGoogleSheetsApiConfigured(),
      parsed,
      suggestions,
      templates,
      limits: { maxBytes: DEFAULT_MAX_FILE_BYTES, maxRows: DEFAULT_MAX_ROWS },
    });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
