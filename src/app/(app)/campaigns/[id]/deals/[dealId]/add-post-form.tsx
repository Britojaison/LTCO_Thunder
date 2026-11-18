"use client";

import { useActionState, useState } from "react";
import { addPostAction, type FormState } from "../../../deal-actions";
import { btnPrimary, btnSecondary, inputCls } from "@/components/ui";

export function AddPostForm({ dealId, startOpen }: { dealId: string; startOpen: boolean }) {
  const [open, setOpen] = useState(startOpen);
  const [state, action, pending] = useActionState<FormState, FormData>(addPostAction.bind(null, dealId), {});
  if (!open) return <button type="button" onClick={() => setOpen(true)} className={btnSecondary}>+ Add post</button>;
  const v = state.values ?? {};
  return (
    <form action={action} key={JSON.stringify(state)} className="grid gap-2 sm:grid-cols-[1fr_130px_190px_auto]">
      <input name="url" required placeholder="https://www.instagram.com/reel/…" defaultValue={(v.url as string) ?? ""} className={inputCls} />
      <select name="format" defaultValue={(v.format as string) ?? "reel"} className={inputCls}>
        <option value="reel">Reel</option><option value="story">Story</option><option value="carousel">Carousel</option>
        <option value="collab">Collab post</option><option value="static">Static post</option>
      </select>
      <input name="posted_at" type="datetime-local" aria-label="Posted at" defaultValue={(v.posted_at as string) ?? ""} className={inputCls} />
      <button disabled={pending} className={btnPrimary}>{pending ? "Adding…" : "Add post"}</button>
      {state.error && <p className="text-sm text-red-600 sm:col-span-4">{state.error}</p>}
      {state.ok && <p className="text-sm text-emerald-700 sm:col-span-4">{state.ok}. Its 24h, 7d and 30d snapshots will show as due on time.</p>}
    </form>
  );
}
