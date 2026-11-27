import { NextResponse, type NextRequest } from "next/server";
import { requireWorkspace } from "@/lib/auth";
import { apiErrorResponse } from "@/lib/import/api-response";
import { cancelImportJob } from "@/lib/services/imports";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  try {
    const { jobId } = await params;
    const { db, workspace, user } = await requireWorkspace();
    const result = await cancelImportJob(db, workspace.id, user.id, jobId);
    return NextResponse.json(result);
  } catch (err) {
    return apiErrorResponse(err);
  }
}
