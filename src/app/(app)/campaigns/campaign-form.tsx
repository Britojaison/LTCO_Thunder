"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { FormState } from "./actions";
import { btnPrimary, btnSecondary, Card, Field, inputCls } from "@/components/ui";

type Initial = {
  brand_id?: string; name?: string; brief?: string | null; objective?: string | null;
  start_date?: string | null; end_date?: string | null; status?: string;
  deliverables?: { format: string; count: number }[];
};

export function CampaignForm({ action, brands, initial = {}, cancelHref, submitLabel }: {
  action: (s: FormState, f: FormData) => Promise<FormState>; brands: { id: string; name: string }[];
  initial?: Initial; cancelHref: string; submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, {});
  const v = state.values;
  const s = (k: keyof Initial) => (v?.[k] as string | undefined) ?? ((initial[k] as string | null | undefined) ?? "");
  const deliv = (f: string) => (v?.[`deliv_${f}`] as string | undefined) ?? String(initial.deliverables?.find((d) => d.format === f)?.count ?? "");

  return (
    <form action={formAction} key={JSON.stringify(v ?? "init")} className="max-w-3xl space-y-4">
      {state.error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      <Card title="Campaign">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Brand *">
            <select name="brand_id" required defaultValue={s("brand_id")} className={inputCls}>
              <option value="">Choose a brand</option>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </Field>
          <Field label="Campaign name *"><input name="name" required defaultValue={s("name")} className={inputCls} /></Field>
          <Field label="Start date"><input name="start_date" type="date" defaultValue={s("start_date")} className={inputCls} /></Field>
          <Field label="End date"><input name="end_date" type="date" defaultValue={s("end_date")} className={inputCls} /></Field>
          <Field label="Status">
            <select name="status" defaultValue={s("status") || "planning"} className={inputCls}>
              <option value="planning">Planning</option><option value="live">Live</option>
              <option value="completed">Completed</option><option value="archived">Archived</option>
            </select>
          </Field>
          <Field label="Objective"><input name="objective" placeholder="e.g. Launch awareness in Tamil Nadu" defaultValue={s("objective")} className={inputCls} /></Field>
        </div>
        <div className="mt-3">
          <Field label="Brief" hint="Optional"><textarea name="brief" rows={5} defaultValue={s("brief")} className={inputCls} /></Field>
        </div>
      </Card>
      <Card title="Deliverables required">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[["reel", "Reels"], ["story", "Stories"], ["carousel", "Carousels"], ["collab", "Collab posts"]].map(([f, label]) => (
            <Field key={f} label={label}><input name={`deliv_${f}`} type="number" min={0} defaultValue={deliv(f)} className={inputCls} /></Field>
          ))}
        </div>
      </Card>
      <p className="text-xs text-zinc-500">Cost to client, cost to agency and profit are calculated from each influencer’s deal in this campaign.</p>
      <div className="flex gap-2">
        <button disabled={pending} className={btnPrimary}>{pending ? "Saving…" : submitLabel}</button>
        <Link href={cancelHref} className={btnSecondary}>Cancel</Link>
      </div>
    </form>
  );
}
