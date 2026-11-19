"use client";

import { useState, useTransition } from "react";
import { updateProductAction } from "../../deal-actions";

/** Inline product editor for the campaign table: type, then press Enter or click away to save. */
export function ProductCell({ dealId, value, listId }: { dealId: string; value: string | null; listId: string }) {
  const [v, setV] = useState(value ?? "");
  const [state, setState] = useState<"idle" | "saved" | "error">("idle");
  const [err, setErr] = useState<string>();
  const [pending, start] = useTransition();
  const save = () => {
    if ((value ?? "") === v.trim()) return;
    start(async () => {
      const r = await updateProductAction(dealId, v);
      if (r.error) { setState("error"); setErr(r.error); } else { setState("saved"); setTimeout(() => setState("idle"), 1200); }
    });
  };
  return (
    <span className="block">
      <input value={v} list={listId} placeholder="Add product" aria-label="Product"
        onChange={(e) => { setV(e.target.value); setState("idle"); }}
        onBlur={save} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        className={`w-36 rounded border px-1.5 py-1 text-xs outline-none focus:border-zinc-900 ${state === "error" ? "border-red-300" : "border-transparent bg-zinc-50 hover:border-zinc-200"}`} />
      {pending && <span className="ml-1 text-[10px] text-zinc-400">saving</span>}
      {state === "saved" && <span className="ml-1 text-[10px] text-emerald-600">saved</span>}
      {state === "error" && <span className="block text-[10px] text-red-600">{err}</span>}
    </span>
  );
}
