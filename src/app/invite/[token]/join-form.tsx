"use client";

import { useActionState } from "react";
import { acceptInviteAction } from "./actions";
import { btnPrimary, inputCls } from "@/components/ui";

export function JoinForm({ token, agency }: { token: string; agency: string }) {
  const [state, action, pending] = useActionState<{ error?: string }, FormData>(acceptInviteAction.bind(null, token), {});
  return (
    <form action={action} className="space-y-3">
      <label className="block">
        <span className="text-sm text-zinc-600">Your name</span>
        <input name="full_name" className={`${inputCls} mt-1`} placeholder="How the team will see you" />
      </label>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button disabled={pending} className={`${btnPrimary} w-full`}>{pending ? "Joining…" : `Join ${agency}`}</button>
    </form>
  );
}
