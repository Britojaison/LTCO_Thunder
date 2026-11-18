"use client";

import { useActionState, useState, useTransition } from "react";
import { blacklistAction, deleteInfluencerAction, restoreInfluencerAction, addPromoAction, type FormState } from "../actions";
import { btnDanger, btnSecondary, btnPrimary, inputCls } from "@/components/ui";

export function BlacklistControl({ id, blacklisted }: { id: string; blacklisted: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(blacklistAction.bind(null, id), {});
  const [open, setOpen] = useState(false);
  if (blacklisted)
    return (
      <form action={action}>
        <input type="hidden" name="blacklisted" value="false" />
        <button disabled={pending} className={btnSecondary}>Remove from blacklist</button>
      </form>
    );
  if (!open) return <button onClick={() => setOpen(true)} className={btnDanger}>Blacklist</button>;
  return (
    <form action={action} className="flex flex-wrap gap-2">
      <input type="hidden" name="blacklisted" value="true" />
      <input name="reason" required placeholder="Reason (internal)" className={`${inputCls} w-56`} />
      <button disabled={pending} className={btnDanger}>Confirm blacklist</button>
      <button type="button" onClick={() => setOpen(false)} className={btnSecondary}>Cancel</button>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
    </form>
  );
}

export function DeleteControl({ id, deleted }: { id: string; deleted: boolean }) {
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string>();
  if (deleted)
    return (
      <span className="flex items-center gap-2">
        <button disabled={pending} className={btnSecondary}
          onClick={() => start(async () => setError((await restoreInfluencerAction(id)).error))}>Restore</button>
        {error && <span className="text-sm text-red-600">{error}</span>}
      </span>
    );
  if (!confirm) return <button onClick={() => setConfirm(true)} className={btnDanger}>Delete</button>;
  return (
    <span className="flex items-center gap-2 text-sm">
      Delete this profile? It can be restored for 30 days.
      <button disabled={pending} className={btnDanger} onClick={() => start(() => deleteInfluencerAction(id))}>Yes, delete</button>
      <button onClick={() => setConfirm(false)} className={btnSecondary}>Cancel</button>
    </span>
  );
}

export function AddPromoForm({ influencerId }: { influencerId: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(addPromoAction.bind(null, influencerId), {});
  return (
    <form action={action} key={JSON.stringify(state)} className="mt-3 grid gap-2 sm:grid-cols-[1fr_150px_1fr_auto]">
      <input name="brand_name" required placeholder="Brand promoted" defaultValue={(state.values?.brand_name as string) ?? ""} className={inputCls} />
      <input name="promoted_on" type="date" required defaultValue={(state.values?.promoted_on as string) ?? ""} className={inputCls} />
      <input name="post_url" placeholder="Post link (optional)" defaultValue={(state.values?.post_url as string) ?? ""} className={inputCls} />
      <button disabled={pending} className={btnPrimary}>Add</button>
      {state.error && <p className="text-sm text-red-600 sm:col-span-4">{state.error}</p>}
    </form>
  );
}
