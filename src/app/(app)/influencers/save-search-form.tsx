"use client";

import { useActionState } from "react";
import { saveSearchAction, type FormState } from "./actions";
import { btnSecondary, inputCls } from "@/components/ui";

export function SaveSearchForm({ query }: { query: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveSearchAction, {});
  return (
    <form action={action} className="flex gap-1">
      <input type="hidden" name="query" value={query} />
      <input name="name" placeholder="Name this search" className={`${inputCls} py-1`} />
      <button disabled={pending} className={`${btnSecondary} py-1`}>Save</button>
      {state.error && <p className="text-xs text-red-600">{state.error}</p>}
      {state.ok && <p className="self-center text-xs text-emerald-700">{state.ok}</p>}
    </form>
  );
}
