import { NextResponse, type NextRequest } from "next/server";
import { requireWorkspace } from "@/lib/auth";
import { buildSampleTemplateCsv, buildSampleTemplateXlsx } from "@/lib/services/imports";

export async function GET(request: NextRequest) {
  await requireWorkspace();
  const format = request.nextUrl.searchParams.get("format")?.toLowerCase() ?? "csv";

  if (format === "xlsx") {
    const bytes = buildSampleTemplateXlsx();
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": 'attachment; filename="thunder-influencers-template.xlsx"',
        "cache-control": "no-store",
      },
    });
  }

  const csv = buildSampleTemplateCsv();
  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="thunder-influencers-template.csv"',
      "cache-control": "no-store",
    },
  });
}
