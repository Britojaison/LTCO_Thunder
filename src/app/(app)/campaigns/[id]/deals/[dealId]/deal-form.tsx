"use client";

import { useActionState, useState } from "react";
import { updateDealAction, type FormState } from "../../../deal-actions";
import { btnPrimary, Card, Field, inputCls } from "@/components/ui";
import { inr } from "@/lib/format";
import type { RateStats } from "@/lib/services/deals";

type Props = {
  dealId: string;
  stages: { id: string; name: string }[];
  members: { user_id: string; full_name: string | null; email: string }[];
  required: { format: string; count: number }[];
  rates: Record<string, number | null>;
  stats: RateStats;
  initial: {
    stage_id: string | null; owner_id: string | null; deliverables: { format: string; count: number }[];
    client_price: number | null; payout: number | null; barter_value: number | null;
    due_date: string | null; posting_date: string | null; usage_rights_days: number | null;
  };
};

const FORMATS = [["reel", "Reels"], ["story", "Stories"], ["carousel", "Carousels"], ["collab", "Collab posts"]] as const;
const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(/[₹, ]/g, "")));

export function DealForm({ dealId, stages, members, required, rates, stats, initial }: Props) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateDealAction.bind(null, dealId), {});
  const v = state.values;
  const str = (k: string, fallback: unknown) => (v?.[k] as string | undefined) ?? (fallback === null || fallback === undefined ? "" : String(fallback));
  const [client, setClient] = useState(str("client_price", initial.client_price));
  const [payout, setPayout] = useState(str("payout", initial.payout));
  const c = num(client), p = num(payout);
  const profit = c !== null && p !== null && !Number.isNaN(c) && !Number.isNaN(p) ? c - p : null;
  const pct = profit !== null && c ? ((profit / c) * 100).toFixed(1) : null;
  const delivCount = (f: string) => str(`deliv_${f}`, initial.deliverables.find((d) => d.format === f)?.count ?? "");

  return (
    <form action={action} key={JSON.stringify(v ?? "init")}>
      <Card title="Deal for this campaign" actions={state.ok && <span className="text-xs text-emerald-700">{state.ok}</span>}>
        <p className="-mt-1 mb-3 text-xs text-zinc-500">
          Prices here apply to this campaign only. They don’t change the influencer’s profile; the profile shows the average of all their deals.
          {stats.all ? ` Average payout per deal so far: ${inr(stats.all.avg_payout)} across ${stats.all.deals}.` : ""}
        </p>
        {state.error && <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Stage">
            <select name="stage_id" defaultValue={str("stage_id", initial.stage_id)} className={inputCls}>
              {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Owner">
            <select name="owner_id" defaultValue={str("owner_id", initial.owner_id)} className={inputCls}>
              <option value="">No owner</option>
              {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.full_name || m.email}</option>)}
            </select>
          </Field>
        </div>

        <p className="mt-4 text-xs font-medium text-zinc-600">
          Deliverables{required.length > 0 && <span className="font-normal text-zinc-400"> · campaign asks for {required.map((r) => `${r.count} ${r.format}`).join(", ")}</span>}
        </p>
        <div className="mt-1 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {FORMATS.map(([f, label]) => (
            <Field key={f} label={label} hint={stats[f] ? `Usually ${inr(stats[f]!.avg)} (avg of ${stats[f]!.deals})` : rates[f] ? `Quoted ${inr(rates[f])}` : undefined}>
              <input name={`deliv_${f}`} type="number" min={0} defaultValue={delivCount(f)} className={inputCls} />
            </Field>
          ))}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <Field label="Cost to client ₹"><input name="client_price" inputMode="numeric" value={client} onChange={(e) => setClient(e.target.value)} className={inputCls} /></Field>
          <Field label="Cost to agency (payout) ₹"><input name="payout" inputMode="numeric" value={payout} onChange={(e) => setPayout(e.target.value)} className={inputCls} /></Field>
          <div className="rounded-md bg-zinc-50 px-3 py-2">
            <div className="text-xs text-zinc-500">Profit</div>
            <div className={`text-lg font-semibold tabular-nums ${profit !== null && profit < 0 ? "text-red-700" : ""}`}>{profit === null ? "–" : inr(profit)}</div>
          </div>
          <div className="rounded-md bg-zinc-50 px-3 py-2">
            <div className="text-xs text-zinc-500">Profit %</div>
            <div className="text-lg font-semibold tabular-nums">{pct === null ? "–" : `${pct}%`}</div>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <Field label="Barter value ₹"><input name="barter_value" inputMode="numeric" defaultValue={str("barter_value", initial.barter_value)} className={inputCls} /></Field>
          <Field label="Content due"><input name="due_date" type="date" defaultValue={str("due_date", initial.due_date)} className={inputCls} /></Field>
          <Field label="Posting date"><input name="posting_date" type="date" defaultValue={str("posting_date", initial.posting_date)} className={inputCls} /></Field>
          <Field label="Usage rights (days)"><input name="usage_rights_days" type="number" min={0} defaultValue={str("usage_rights_days", initial.usage_rights_days)} className={inputCls} /></Field>
        </div>

        <div className="mt-4"><button disabled={pending} className={btnPrimary}>{pending ? "Saving…" : "Save deal"}</button></div>
      </Card>
    </form>
  );
}
