"use client";

import { useActionState } from "react";
import { createWorkspaceAction, type OnboardingState } from "./actions";

export function OnboardingForm() {
  const [state, action, pending] = useActionState<OnboardingState, FormData>(createWorkspaceAction, {});
  return (
    <form action={action} className="space-y-3">
      <label className="block">
        <span className="text-sm text-zinc-600">Your name</span>
        <input name="fullName" className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2" />
      </label>
      <label className="block">
        <span className="text-sm text-zinc-600">Agency name</span>
        <input name="name" required maxLength={120} className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2" />
      </label>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button disabled={pending} className="w-full rounded-md bg-zinc-900 px-3 py-2 font-medium text-white disabled:opacity-50">
        {pending ? "Creating…" : "Create workspace"}
      </button>
    </form>
  );
}
