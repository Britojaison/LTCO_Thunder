import { NextResponse, type NextRequest } from "next/server";
import { requireWorkspace } from "@/lib/auth";
import { apiErrorResponse } from "@/lib/import/api-response";
import { buildJobReportCsv, getImportJobDetails } from "@/lib/services/imports";

export async function GET(request: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  try {
    const { jobId } = await params;
    const { db, workspace } = await requireWorkspace();
    const download = request.nextUrl.searchParams.get("download");

    if (download === "all" || download === "failed") {
      const csv = await buildJobReportCsv(db, workspace.id, jobId, download);
      const suffix = download === "failed" ? "failed-records" : "import-report";
      return new NextResponse(csv, {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="thunder-${suffix}-${jobId.slice(0, 8)}.csv"`,
          "cache-control": "no-store",
        },
      });
    }

    const details = await getImportJobDetails(db, workspace.id, jobId);
    return NextResponse.json(details);
  } catch (err) {
    return apiErrorResponse(err);
  }
}
