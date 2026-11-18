"use client";

import { useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/browser";
import { saveSnapshotAction, startScreenshotUploadAction, deletePostAction, deleteSnapshotAction } from "../../../deal-actions";
import { btnPrimary, btnSecondary, inputCls } from "@/components/ui";
import { METRIC_KEYS, METRIC_LABELS } from "@/lib/services/metrics";

type Existing = { id: string; snapshot_point: string; [metric: string]: string | number | null | undefined };

/** Enter or update one snapshot. Screenshots upload straight to private storage first. */
export function SnapshotForm({ postId, defaultPoint, existing }: { postId: string; defaultPoint: string; existing: Existing[] }) {
  const [open, setOpen] = useState(false);
  const [point, setPoint] = useState(defaultPoint);
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [busy, start] = useTransition();
  const files = useRef<HTMLInputElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const current = point === "adhoc" ? undefined : existing.find((e) => e.snapshot_point === point);

  if (!open) return <button type="button" onClick={() => setOpen(true)} className={btnPrimary}>Enter metrics</button>;

  const submit = (fd: FormData) =>
    start(async () => {
      setMsg({});
      const paths: string[] = [];
      for (const f of Array.from(files.current?.files ?? [])) {
        const up = await startScreenshotUploadAction(postId, f.type, f.size);
        if (!up.ok) return setMsg({ error: up.error });
        const { error } = await createClient().storage.from("thunder-files").uploadToSignedUrl(up.path, up.token, f, { contentType: f.type });
        if (error) return setMsg({ error: `Screenshot upload failed: ${error.message}` });
        paths.push(up.path);
      }
      fd.set("screenshot_paths", paths.join("|"));
      fd.delete("files");
      const res = await saveSnapshotAction(postId, fd);
      setMsg(res);
      if (res.ok) { form.current?.reset(); setOpen(false); }
    });

  return (
    <form ref={form} action={submit} key={point} className="mt-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-xs font-medium text-zinc-600">Snapshot</span>
        {["24h", "7d", "30d", "adhoc"].map((p) => (
          <label key={p} className={`cursor-pointer rounded-md border px-2 py-1 text-xs ${point === p ? "border-zinc-900 bg-white" : "border-zinc-200"}`}>
            <input type="radio" name="snapshot_point" value={p} checked={point === p} onChange={() => setPoint(p)} className="sr-only" />
            {p === "adhoc" ? "Other / latest" : p}
          </label>
        ))}
        {current && <span className="text-xs text-amber-700">Updates the existing {point} snapshot</span>}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {METRIC_KEYS.map((k) => (
          <label key={k} className="block">
            <span className="text-[11px] text-zinc-500">{METRIC_LABELS[k]}</span>
            <input name={k} inputMode="numeric" defaultValue={current?.[k] ?? ""} className={`${inputCls} py-1.5`} />
          </label>
        ))}
      </div>
      <label className="mt-2 block text-xs text-zinc-600">
        Insights screenshots (optional, PNG/JPG, up to 10)
        <input ref={files} name="files" type="file" accept="image/png,image/jpeg,image/webp" multiple className="mt-1 block text-sm" />
      </label>
      <div className="mt-3 flex items-center gap-2">
        <button disabled={busy} className={btnPrimary}>{busy ? "Saving…" : "Save metrics"}</button>
        <button type="button" onClick={() => setOpen(false)} className={btnSecondary}>Cancel</button>
        {msg.error && <span className="text-sm text-red-600">{msg.error}</span>}
      </div>
    </form>
  );
}

export function DeletePostButton({ postId }: { postId: string }) {
  const [busy, start] = useTransition();
  const [confirm, setConfirm] = useState(false);
  if (!confirm) return <button type="button" onClick={() => setConfirm(true)} className="text-xs text-zinc-400 hover:text-red-600">Remove post</button>;
  return (
    <span className="text-xs">
      Remove this post and hide its metrics?{" "}
      <button type="button" disabled={busy} onClick={() => start(async () => { await deletePostAction(postId); })} className="font-medium text-red-700">Yes</button>{" "}
      <button type="button" onClick={() => setConfirm(false)} className="text-zinc-500">No</button>
    </span>
  );
}

export function DeleteSnapshotButton({ snapshotId }: { snapshotId: string }) {
  const [busy, start] = useTransition();
  return (
    <button type="button" disabled={busy} title="Delete this snapshot" aria-label="Delete snapshot"
      onClick={() => { if (confirm("Delete this snapshot?")) start(async () => { await deleteSnapshotAction(snapshotId); }); }}
      className="text-zinc-300 hover:text-red-600">×</button>
  );
}
