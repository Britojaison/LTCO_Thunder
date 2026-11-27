"use client";

import { useActionState, useState } from "react";
import { brandingAction, type State } from "./actions";
import { btnPrimary, Card, Field, inputCls } from "@/components/ui";

export function BrandingForm({ name, color, logoUrl, presets }: { name: string; color: string; logoUrl?: string; presets: string[] }) {
  const [state, action, pending] = useActionState<State, FormData>(brandingAction, {});
  const [c, setC] = useState(color);
  const [preview, setPreview] = useState<string | undefined>(logoUrl);
  const [agency, setAgency] = useState(name);

  return (
    <Card title="Agency branding" actions={state.ok && <span className="text-xs text-emerald-700">{state.ok}</span>}>
      <form action={action} className="grid gap-4 md:grid-cols-[1fr_260px]">
        <div className="space-y-3">
          {state.error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
          <Field label="Agency name"><input name="name" required value={agency} onChange={(e) => setAgency(e.target.value)} className={inputCls} /></Field>
          <Field label="Logo" hint="PNG, JPG, WebP or SVG, under 900 KB. A wide logo with a transparent background works best.">
            <input type="file" name="logo" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="text-sm"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) setPreview(URL.createObjectURL(f)); }} />
          </Field>
          {logoUrl && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="remove_logo" onChange={(e) => setPreview(e.target.checked ? undefined : logoUrl)} /> Remove current logo</label>}
          <Field label="Report colour" hint="Used for headings and accents in client reports.">
            <div className="flex flex-wrap items-center gap-2">
              {presets.map((p) => (
                <button key={p} type="button" onClick={() => setC(p)} aria-label={`Use ${p}`}
                  className={`h-7 w-7 rounded-full border-2 ${c.toLowerCase() === p ? "border-zinc-900" : "border-white ring-1 ring-zinc-200"}`} style={{ backgroundColor: p }} />
              ))}
              <input type="color" value={c} onChange={(e) => setC(e.target.value)} className="h-8 w-10 cursor-pointer rounded border border-zinc-300" aria-label="Custom colour" />
              <input name="color" value={c} onChange={(e) => setC(e.target.value)} className={`${inputCls} w-28 font-mono`} />
            </div>
          </Field>
          <button disabled={pending} className={btnPrimary}>{pending ? "Saving…" : "Save branding"}</button>
        </div>
        <div>
          <p className="mb-1 text-xs text-zinc-500">Report cover preview</p>
          <div className="paper-preview aspect-[1/1.414] rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
            {preview
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={preview} alt="" className="h-8 max-w-[60%] object-contain" />
              : <span className="text-xs font-semibold" style={{ color: c }}>{agency}</span>}
            <div className="mt-16 text-[9px] uppercase tracking-wide text-zinc-400">Brand</div>
            <div className="text-base font-semibold leading-tight">Campaign report</div>
            <div className="mt-2 h-1 w-10 rounded" style={{ backgroundColor: c }} />
            <div className="mt-6 text-[10px] font-semibold" style={{ color: c }}>Summary</div>
            <div className="mt-1 grid grid-cols-3 gap-1">{[1, 2, 3].map((i) => <div key={i} className="h-6 rounded border border-zinc-200" />)}</div>
          </div>
        </div>
      </form>
    </Card>
  );
}
