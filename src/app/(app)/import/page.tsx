import { Suspense } from "react";
import { requireWorkspace } from "@/lib/auth";
import { isGoogleSheetsApiConfigured } from "@/lib/import/google-sheets";
import { DEFAULT_MAX_FILE_BYTES, DEFAULT_MAX_ROWS } from "@/lib/import/parser";
import {
  getMemberRole,
  listImportJobs,
  listMappingTemplates,
} from "@/lib/services/imports";
import { ImportWizard } from "./import-wizard";

export const metadata = { title: "Import Influencers" };

export default function Page() {
  return (
    <Suspense fallback={<p className="text-sm text-zinc-400">Loading import workspace…</p>}>
      <ImportPageContent />
    </Suspense>
  );
}

async function ImportPageContent() {
  const { db, workspace, user } = await requireWorkspace();
  const [templates, jobs, role] = await Promise.all([
    listMappingTemplates(db, workspace.id).catch(() => []),
    listImportJobs(db, workspace.id).catch(() => []),
    getMemberRole(db, workspace.id, user.id).catch(() => "admin" as const),
  ]);

  return (
    <ImportWizard
      initialTemplates={templates}
      initialJobs={jobs}
      currentUserId={user.id}
      userRole={role}
      googleApiConfigured={isGoogleSheetsApiConfigured()}
      maxFileBytes={DEFAULT_MAX_FILE_BYTES}
      maxRows={DEFAULT_MAX_ROWS}
    />
  );
}
