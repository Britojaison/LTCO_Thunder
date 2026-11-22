"use client";

import { useActionState, useEffect } from "react";
import { acceptInviteAction, type JoinState } from "./actions";
import { btnPrimary, inputCls } from "@/components/ui";

export function JoinForm({ token, agency }: { token: string; agency: string }) {
  const [state, action, pending] = useActionState<JoinState, FormData>(acceptInviteAction.bind(null, token), {});
  // Full page load after joining: replaces this page in history and drops any cached "no workspace" screens.
  useEffect(() => { if (state.redirectTo) window.location.replace(state.redirectTo); }, [state.redirectTo]);
  const joining = pending || Boolean(state.redirectTo);
  return (
    <form action={action} className="space-y-3">
      <label className="block">
        <span className="text-sm text-zinc-600">Your name</span>
        <input name="full_name" className={`${inputCls} mt-1`} placeholder="How the team will see you" />
      </label>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button disabled={joining} className={`${btnPrimary} w-full`}>{joining ? "Joining…" : `Join ${agency}`}</button>
    </form>
  );
}
