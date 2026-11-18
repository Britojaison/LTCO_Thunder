"use client";

import { useActionState, useState } from "react";
import { updatePaymentAction, type FormState } from "../../../deal-actions";
import { Badge, btnPrimary, Card, Field, inputCls } from "@/components/ui";
import { inr } from "@/lib/format";

type Initial = {
  invoice_amount: number | null; gst_amount: number | null; tds_amount: number | null; amount_paid: number;
  payment_due_date: string | null; paid_on: string | null; payment_status: string;
};
const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(/[₹, ]/g, "")));
const s = (v: number | string | null | undefined) => (v === null || v === undefined ? "" : String(v));
const LABEL: Record<string, string> = { pending: "Pending", partly_paid: "Partly paid", paid: "Paid" };

export function PaymentForm({ dealId, initial, payout, children }: { dealId: string; initial: Initial; payout: number | null; children?: React.ReactNode }) {
  const [state, action, pending] = useActionState<FormState, FormData>(updatePaymentAction.bind(null, dealId), {});
  const v = state.values;
  const [inv, setInv] = useState((v?.invoice_amount as string) ?? s(initial.invoice_amount));
  const [gst, setGst] = useState((v?.gst_amount as string) ?? s(initial.gst_amount));
  const [tds, setTds] = useState((v?.tds_amount as string) ?? s(initial.tds_amount));
  const [paid, setPaid] = useState((v?.amount_paid as string) ?? s(initial.amount_paid || ""));

  const i = num(inv), g = num(gst) ?? 0, t = num(tds) ?? 0, pd = num(paid) ?? 0;
  const net = i === null ? null : i + g - t;
  const balance = net === null ? null : net - pd;
  const status = pd <= 0 ? "pending" : net !== null && pd + 0.005 < net ? "partly_paid" : "paid";

  return (
    <form action={action}>
      <Card title="Payment" actions={<Badge tone={status === "paid" ? "green" : "amber"}>{LABEL[status]}</Badge>}>
        {state.error && <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
        {state.ok && <p className="mb-3 text-xs text-emerald-700">{state.ok}</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Invoice amount ₹" hint={payout !== null ? `Agreed payout ${inr(payout)}` : undefined}>
            <input name="invoice_amount" inputMode="numeric" value={inv} onChange={(e) => setInv(e.target.value)} className={inputCls} />
          </Field>
          <Field label="GST ₹"><input name="gst_amount" inputMode="numeric" value={gst} onChange={(e) => setGst(e.target.value)} className={inputCls} /></Field>
          <Field label="TDS deducted ₹"><input name="tds_amount" inputMode="numeric" value={tds} onChange={(e) => setTds(e.target.value)} className={inputCls} /></Field>
          <Field label="Amount paid so far ₹"><input name="amount_paid" inputMode="numeric" value={paid} onChange={(e) => setPaid(e.target.value)} className={inputCls} /></Field>
          <Field label="Payment due"><input name="payment_due_date" type="date" defaultValue={(v?.payment_due_date as string) ?? s(initial.payment_due_date)} className={inputCls} /></Field>
          <Field label="Paid on" hint="Filled with today when fully paid"><input name="paid_on" type="date" defaultValue={(v?.paid_on as string) ?? s(initial.paid_on)} className={inputCls} /></Field>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-2 rounded-md bg-zinc-50 p-3 text-sm">
          <div><dt className="text-xs text-zinc-500">Net payable (invoice + GST − TDS)</dt><dd className="font-semibold tabular-nums">{net === null ? "–" : inr(net)}</dd></div>
          <div><dt className="text-xs text-zinc-500">Balance due</dt><dd className={`font-semibold tabular-nums ${balance !== null && balance > 0 ? "text-amber-700" : ""}`}>{balance === null ? "–" : inr(balance)}</dd></div>
        </dl>
        {children}
        <div className="mt-4"><button disabled={pending} className={btnPrimary}>{pending ? "Saving…" : "Save payment"}</button></div>
      </Card>
    </form>
  );
}
