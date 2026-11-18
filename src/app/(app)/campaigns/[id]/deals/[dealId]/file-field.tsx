"use client";

import { useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/browser";
import { startUploadAction, finishUploadAction, removeFileAction } from "../../../deal-actions";

const BUCKET = "thunder-files";

/** Uploads straight from the browser to private storage with a signed upload token (no size limit from the server). */
export function FileField({ dealId, kind, label, url }: { dealId: string; kind: "contract" | "invoice"; label: string; url?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string>();
  const [busy, start] = useTransition();

  const upload = (file: File) =>
    start(async () => {
      setError(undefined);
      const res = await startUploadAction(dealId, kind, file.type, file.size);
      if (!res.ok) return setError(res.error);
      const { error: upErr } = await createClient().storage.from(BUCKET).uploadToSignedUrl(res.path, res.token, file, { contentType: file.type });
      if (upErr) return setError(`Upload failed: ${upErr.message}`);
      const done = await finishUploadAction(dealId, kind, res.path);
      if (done.error) setError(done.error);
      if (input.current) input.current.value = "";
    });

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="w-20 text-xs font-medium text-zinc-600">{label}</span>
      {url ? (
        <>
          <a href={url} target="_blank" rel="noreferrer" className="text-zinc-800 underline">View</a>
          <button type="button" disabled={busy} onClick={() => start(async () => setError((await removeFileAction(dealId, kind)).error))}
            className="text-xs text-zinc-400 hover:text-red-600">Remove</button>
          <span className="text-zinc-300">·</span>
        </>
      ) : null}
      <label className="cursor-pointer text-zinc-600 underline">
        {busy ? "Uploading…" : url ? "Replace" : "Upload"}
        <input ref={input} type="file" accept="application/pdf,image/png,image/jpeg,image/webp" className="hidden" disabled={busy}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} />
      </label>
      <span className="text-xs text-zinc-400">PDF or image, up to 10 MB</span>
      {error && <span className="basis-full text-xs text-red-600">{error}</span>}
    </div>
  );
}
