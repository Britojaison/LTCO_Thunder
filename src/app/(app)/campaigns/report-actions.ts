"use server";

import { refresh } from "next/cache";
import { requireWorkspace } from "@/lib/auth";
import { ServiceError } from "@/lib/services/errors";
import { saveReport, saveTemplate, deleteTemplate } from "@/lib/services/reports";
import type { ReportConfig } from "@/lib/services/report-config";

const message = (e: unknown) => (e instanceof ServiceError ? e.message : "Something went wrong. Please try again.");

export async function createReportAction(campaignId: string, config: ReportConfig, templateId: string | null) {
  const { db, workspace, user } = await requireWorkspace();
  try {
    return { id: await saveReport(db, workspace.id, user.id, campaignId, config, templateId) };
  } catch (e) {
    return { error: message(e) };
  }
}

export async function saveTemplateAction(brandId: string, name: string, config: ReportConfig): Promise<{ error?: string; ok?: string }> {
  const { db, workspace, user } = await requireWorkspace();
  try {
    await saveTemplate(db, workspace.id, user.id, brandId, name, config);
  } catch (e) {
    return { error: message(e) };
  }
  refresh();
  return { ok: "Template saved" };
}

export async function deleteTemplateAction(templateId: string) {
  const { db, workspace } = await requireWorkspace();
  await deleteTemplate(db, workspace.id, templateId);
  refresh();
}
