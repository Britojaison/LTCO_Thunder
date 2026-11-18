"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { quickAddAction, type QuickAddState } from "./actions";
import { btnPrimary, btnSecondary, inputCls } from "@/components/ui";

/** Add a brand-new (or existing) influencer to this campaign without leaving it. */
export function QuickAdd({ campaignId, defaultOpen = false, defaultHandle = "" }: { campaignId: string; defaultOpen?: boolean; defaultHandle?: string }) {
  const [open, setOpen] = useState(defaultOpen);
  const [state, action, pending] = useActionState<QuickAddState, FormData>(quickAddAction.bind(null, campaignId), {});
  const v = state.values ?? (state.result ? {} : { handle: defaultHandle });
  const s = (k: string) => (v[k] as string | undefined) ?? "";

  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className={btnSecondary}>
        + Quick add new influencer
      </button>
    );

  const r = state.result;
  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Quick add to this campaign</h2>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-zinc-500 hover:underline">Close</button>
      </div>
      {r && (
        <p className="mb-3 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {r.alreadyInCampaign
            ? <>@{r.handle} is already in this campaign. </>
            : <>{r.created ? "Created" : "Found"} @{r.handle} and added to this campaign as Shortlisted. </>}
          <Link href={`/campaigns/${campaignId}/deals/${r.dealId}`} className="font-medium underline">Open deal</Link>
          <span className="text-emerald-700"> · or add the next one below</span>
        </p>
      )}
      {state.error && <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      <form action={action} key={JSON.stringify(state)} className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <input name="handle" required autoFocus placeholder="@handle or profile link *" defaultValue={s("handle")} className={inputCls} />
        <input name="name" placeholder="Name" defaultValue={s("name")} className={inputCls} />
        <input name="followers" inputMode="numeric" placeholder="Followers" defaultValue={s("followers")} className={inputCls} />
        <input name="city" placeholder="City" defaultValue={s("city")} className={inputCls} />
        <input name="phone" placeholder="Phone / WhatsApp" defaultValue={s("phone")} className={inputCls} />
        <input name="niche_tags" placeholder="Niches (comma separated)" defaultValue={s("niche_tags")} className={inputCls} />
        <input name="client_price" inputMode="numeric" placeholder="Cost to client ₹ (optional)" defaultValue={s("client_price")} className={inputCls} />
        <input name="payout" inputMode="numeric" placeholder="Payout ₹ (optional)" defaultValue={s("payout")} className={inputCls} />
        <div className="flex items-center gap-3 sm:col-span-2 lg:col-span-4">
          <button disabled={pending} className={btnPrimary}>{pending ? "Adding…" : "Add to campaign"}</button>
          <span className="text-xs text-zinc-500">
            If the handle is already in your databank, the existing profile is used. Fill in the full profile later from the influencer page.
          </span>
        </div>
      </form>
    </div>
  );
}
