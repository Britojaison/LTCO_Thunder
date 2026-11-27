import { NextResponse, type NextRequest } from "next/server";
import { requireWorkspace } from "@/lib/auth";
import { apiErrorResponse } from "@/lib/import/api-response";
import type { ColumnMappingRecord } from "@/lib/import/mapper";
import {
  deleteMappingTemplate,
  listMappingTemplates,
  saveMappingTemplate,
} from "@/lib/services/imports";

export async function GET() {
  try {
    const { db, workspace } = await requireWorkspace();
    const templates = await listMappingTemplates(db, workspace.id);
    return NextResponse.json({ templates });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { db, workspace, user } = await requireWorkspace();
    const body = (await request.json().catch(() => ({}))) as {
      name?: string;
      mapping?: ColumnMappingRecord;
      options?: Record<string, unknown>;
    };
    const template = await saveMappingTemplate(db, workspace.id, user.id, {
      name: body.name ?? "",
      mapping: body.mapping ?? {},
      options: body.options,
    });
    return NextResponse.json({ template }, { status: 201 });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { db, workspace, user } = await requireWorkspace();
    const id = request.nextUrl.searchParams.get("id") ?? "";
    await deleteMappingTemplate(db, workspace.id, user.id, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
