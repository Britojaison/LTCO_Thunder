import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/auth";
import { apiErrorResponse } from "@/lib/import/api-response";
import { listImportJobs } from "@/lib/services/imports";

export async function GET() {
  try {
    const { db, workspace } = await requireWorkspace();
    const jobs = await listImportJobs(db, workspace.id);
    return NextResponse.json({ jobs });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
