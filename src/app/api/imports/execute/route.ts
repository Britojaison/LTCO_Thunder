import { NextResponse, type NextRequest } from "next/server";
import type { CountryCode } from "libphonenumber-js";
import { requireWorkspace } from "@/lib/auth";
import { apiErrorResponse } from "@/lib/import/api-response";
import type { ColumnMappingRecord } from "@/lib/import/mapper";
import type { DuplicateStrategy } from "@/lib/import/pipeline";
import { executeImportJob } from "@/lib/services/imports";

export async function POST(request: NextRequest) {
  try {
    const { db, workspace, user } = await requireWorkspace();
    const body = (await request.json().catch(() => ({}))) as {
      idempotencyKey?: string;
      sourceType?: "csv" | "excel" | "google_sheets" | "urls";
      fileName?: string | null;
      sheetName?: string | null;
      sourceUrl?: string | null;
      duplicateStrategy?: DuplicateStrategy;
      defaultCurrency?: string | null;
      defaultCountry?: CountryCode;
      autoCategorize?: boolean;
      allowCategoryOverwrite?: boolean;
      enrichmentRequired?: boolean;
      rows?: Record<string, string>[];
      mapping?: ColumnMappingRecord;
      excludedRowNumbers?: number[];
      rowOverrides?: Record<number, Record<string, string>>;
    };

    const result = await executeImportJob(db, workspace.id, user.id, user.email, {
      idempotencyKey: body.idempotencyKey,
      sourceType: body.sourceType ?? "csv",
      fileName: body.fileName,
      sheetName: body.sheetName,
      sourceUrl: body.sourceUrl,
      duplicateStrategy: body.duplicateStrategy ?? "merge",
      defaultCurrency: body.defaultCurrency ?? null,
      defaultCountry: body.defaultCountry ?? "IN",
      autoCategorize: body.autoCategorize ?? true,
      allowCategoryOverwrite: body.allowCategoryOverwrite ?? false,
      enrichmentRequired: body.enrichmentRequired ?? false,
      rows: body.rows ?? [],
      mapping: body.mapping ?? {},
      excludedRowNumbers: body.excludedRowNumbers ?? [],
      rowOverrides: body.rowOverrides,
    });

    return NextResponse.json(result);
  } catch (err) {
    return apiErrorResponse(err);
  }
}
