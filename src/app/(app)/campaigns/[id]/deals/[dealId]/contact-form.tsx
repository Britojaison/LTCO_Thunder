"use client";

import { useActionState } from "react";
import { addContactAction, type FormState } from "../../../deal-actions";
import { btnPrimary, inputCls } from "@/components/ui";

export function ContactForm({ dealId }: { dealId: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(addContactAction.bind(null, dealId), {});
  const today = new Date().toISOString().slice(0, 10);
  return (
    <form action={action} key={JSON.stringify(state)} className="grid gap-2 sm:grid-cols-[130px_150px_1fr_auto]">
      <select name="channel" defaultValue={(state.values?.channel as string) ?? "whatsapp"} className={inputCls}>
        <option value="whatsapp">WhatsApp</option><option value="call">Call</option><option value="email">Email</option>
        <option value="instagram_dm">Instagram DM</option><option value="other">Other</option>
      </select>
      <input name="contacted_on" type="date" max={today} defaultValue={(state.values?.contacted_on as string) ?? today} className={inputCls} />
      <input name="note" placeholder="What was discussed?" defaultValue={(state.values?.note as string) ?? ""} className={inputCls} />
      <button disabled={pending} className={btnPrimary}>Log</button>
      {state.error && <p className="text-sm text-red-600 sm:col-span-4">{state.error}</p>}
    </form>
  );
}
