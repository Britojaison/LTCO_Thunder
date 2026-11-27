"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge, btnDanger, btnSecondary, Card } from "@/components/ui";
import { dateTimeIN } from "@/lib/format";
import type { ImportJobItem, ImportRowResultItem } from "./types";

const STATUS_TONE: Record<string, "zinc" | "green" | "amber" | "red"> = {
  completed: "green",
  partially_completed: "amber",
  processing: "amber",
  pending: "zinc",
  failed: "red",
  cancelled: "zinc",
  rolled_back: "zinc",
};

const SOURCE_LABEL: Record<string, string> = {
  csv: "CSV",
  excel: "Excel",
  google_sheets: "Google Sheets",
  urls: "Quick URLs",
};

export function ImportHistory({
  jobs,
  currentUserId,
  userRole,
  onRefresh,
}: {
  jobs: ImportJobItem[];
  currentUserId: string;
  userRole: string;
  onRefresh: () => Promise<void>;
}) {
  const [selectedJob, setSelectedJob] = useState<{ job: ImportJobItem; rows: ImportRowResultItem[] } | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [busyJobId, setBusyJobId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ ok?: string; error?: string }>({});

  const canRollback = (job: ImportJobItem) => {
    if (job.rolled_back_at || job.status === "rolled_back" || job.status === "cancelled" || job.status === "failed") {
      return false;
    }
    if (job.created_count + job.updated_count + job.merged_count === 0) return false;
    return userRole === "owner" || userRole === "admin" || job.created_by === currentUserId;
  };

  async function viewDetails(jobId: string) {
    setLoadingDetails(true);
    setFeedback({});
    try {
      const res = await fetch(`/api/imports/jobs/${jobId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load import details");
      setSelectedJob(data);
    } catch (err) {
      setFeedback({ error: err instanceof Error ? err.message : "Could not load details" });
    } finally {
      setLoadingDetails(false);
    }
  }

  async function handleRollback(jobId: string) {
    if (!window.confirm("Roll back this import? Unmodified newly created influencers will be removed and unmodified fields will be restored. Subsequent edits made by your team will be preserved.")) {
      return;
    }
    setBusyJobId(jobId);
    setFeedback({});
    try {
      const res = await fetch(`/api/imports/jobs/${jobId}/rollback`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Rollback failed");
      setFeedback({
        ok: `Rolled back job: ${data.revertedCreates} created removed, ${data.revertedUpdates} updates reverted${
          data.skippedModified ? `, ${data.skippedModified} preserved (modified later)` : ""
        }.`,
      });
      await onRefresh();
    } catch (err) {
      setFeedback({ error: err instanceof Error ? err.message : "Rollback failed" });
    } finally {
      setBusyJobId(null);
    }
  }

  return (
    <Card
      title="Import History"
      actions={
        <button type="button" onClick={onRefresh} className="text-xs font-medium text-[#f97316] hover:underline">
          Refresh
        </button>
      }
    >
      {feedback.ok && (
        <p className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">{feedback.ok}</p>
      )}
      {feedback.error && (
        <p className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{feedback.error}</p>
      )}

      {jobs.length === 0 ? (
        <p className="py-6 text-center text-sm text-zinc-500">No imports have been executed in this workspace yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-[#e5e7eb] text-left text-xs font-medium text-slate-500">
              <tr>
                <th className="p-2">Import ID</th>
                <th className="p-2">File / Source</th>
                <th className="p-2">Imported By</th>
                <th className="p-2">Date</th>
                <th className="p-2 text-right tabular-nums">Total</th>
                <th className="p-2 text-right tabular-nums">Created</th>
                <th className="p-2 text-right tabular-nums">Updated</th>
                <th className="p-2 text-right tabular-nums">Skipped</th>
                <th className="p-2 text-right tabular-nums">Failed</th>
                <th className="p-2">Status</th>
                <th className="p-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id} className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50/70">
                  <td className="p-2 font-mono text-xs text-zinc-500" title={job.id}>{job.id.slice(0, 8)}</td>
                  <td className="p-2">
                    <div className="font-medium text-zinc-800">{job.file_name || "Untitled import"}</div>
                    <div className="text-xs text-zinc-500">
                      {SOURCE_LABEL[job.source_type] ?? job.source_type}
                      {job.sheet_name && job.sheet_name !== "CSV" ? ` · ${job.sheet_name}` : ""}
                    </div>
                  </td>
                  <td className="p-2 text-xs text-zinc-600">{job.created_by_email || "Workspace member"}</td>
                  <td className="p-2 text-xs text-zinc-600 whitespace-nowrap">{dateTimeIN(job.created_at)}</td>
                  <td className="p-2 text-right tabular-nums">{job.total_rows}</td>
                  <td className="p-2 text-right tabular-nums text-emerald-700">{job.created_count}</td>
                  <td className="p-2 text-right tabular-nums text-blue-700">{job.updated_count + job.merged_count}</td>
                  <td className="p-2 text-right tabular-nums text-zinc-600">{job.skipped_count}</td>
                  <td className="p-2 text-right tabular-nums text-red-600">{job.failed_count}</td>
                  <td className="p-2">
                    <Badge tone={STATUS_TONE[job.status] ?? "zinc"}>{job.status.replace(/_/g, " ")}</Badge>
                  </td>
                  <td className="p-2 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={loadingDetails}
                        onClick={() => viewDetails(job.id)}
                        className="rounded-lg border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                      >
                        Details
                      </button>
                      <a
                        href={`/api/imports/jobs/${job.id}?download=all`}
                        className="rounded-lg border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                      >
                        Report
                      </a>
                      {canRollback(job) && (
                        <button
                          type="button"
                          disabled={busyJobId === job.id}
                          onClick={() => handleRollback(job.id)}
                          className="rounded-lg border border-red-200 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                        >
                          {busyJobId === job.id ? "Rolling back…" : "Rollback"}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[85vh] w-full max-w-4xl overflow-hidden rounded-2xl border border-[#eceef2] bg-white shadow-xl flex flex-col">
            <div className="flex items-center justify-between border-b border-[#eceef2] px-5 py-4">
              <div>
                <h3 className="text-base font-semibold text-zinc-900">
                  Import Details · <span className="font-mono text-sm text-zinc-500">{selectedJob.job.id.slice(0, 8)}</span>
                </h3>
                <p className="text-xs text-zinc-500">
                  {selectedJob.job.file_name || "Import"} · {dateTimeIN(selectedJob.job.created_at)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <a href={`/api/imports/jobs/${selectedJob.job.id}?download=all`} className={btnSecondary}>
                  Download CSV Report
                </a>
                {canRollback(selectedJob.job) && (
                  <button
                    type="button"
                    disabled={busyJobId === selectedJob.job.id}
                    onClick={async () => {
                      await handleRollback(selectedJob.job.id);
                      setSelectedJob(null);
                    }}
                    className={btnDanger}
                  >
                    Rollback Import
                  </button>
                )}
                <button type="button" onClick={() => setSelectedJob(null)} className={btnSecondary}>
                  Close
                </button>
              </div>
            </div>
            <div className="overflow-y-auto p-5">
              <table className="w-full text-sm">
                <thead className="border-b border-[#e5e7eb] text-left text-xs font-medium text-slate-500">
                  <tr>
                    <th className="p-2">Row</th>
                    <th className="p-2">Influencer</th>
                    <th className="p-2">Action</th>
                    <th className="p-2">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedJob.rows.slice(0, 250).map((r) => (
                    <tr key={r.id} className="border-b border-zinc-100 last:border-0">
                      <td className="p-2 tabular-nums text-xs text-zinc-500">#{r.row_number}</td>
                      <td className="p-2">
                        {r.influencer_id ? (
                          <Link href={`/influencers/${r.influencer_id}`} className="font-medium text-zinc-900 hover:underline">
                            {r.influencer_name || "Unnamed"}
                          </Link>
                        ) : (
                          <span className="font-medium text-zinc-800">{r.influencer_name || "–"}</span>
                        )}
                        {r.handle && <div className="text-xs text-zinc-500">@{r.handle}</div>}
                      </td>
                      <td className="p-2">
                        <Badge
                          tone={
                            r.action === "created" || r.action === "updated" || r.action === "merged"
                              ? "green"
                              : r.action === "failed"
                                ? "red"
                                : "zinc"
                          }
                        >
                          {r.action}
                        </Badge>
                      </td>
                      <td className="p-2 text-xs text-zinc-600">
                        {r.reason || r.status}
                        {r.warnings?.length > 0 && (
                          <div className="mt-0.5 text-amber-700">Warnings: {r.warnings.join("; ")}</div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {selectedJob.rows.length > 250 && (
                <p className="mt-3 text-xs text-zinc-500">
                  Showing first 250 of {selectedJob.rows.length} rows. Download the CSV report for the complete log.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
