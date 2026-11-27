import { NextResponse, type NextRequest } from "next/server";
import type { CountryCode } from "libphonenumber-js";
import { requireWorkspace } from "@/lib/auth";
import { apiErrorResponse } from "@/lib/import/api-response";
import type { ColumnMappingRecord } from "@/lib/import/mapper";
import { prepareImportPreview } from "@/lib/services/imports";

export async function POST(request: NextRequest) {
  try {
    const { db, workspace, user } = await requireWorkspace();
    const body = (await request.json().catch(() => ({}))) as {
      rows?: Record<string, string>[];
      mapping?: ColumnMappingRecord;
      options?: {
        defaultCountry?: CountryCode;
        defaultCurrency?: string | null;
        autoCategorize?: boolean;
        allowCategoryOverwrite?: boolean;
        enrichmentRequired?: boolean;
      };
    };

    const result = await prepareImportPreview(db, workspace.id, user.id, {
      rows: body.rows ?? [],
      mapping: body.mapping ?? {},
      options: body.options,
    });

    return NextResponse.json(result);
  } catch (err) {
    return apiErrorResponse(err);
  }
}
