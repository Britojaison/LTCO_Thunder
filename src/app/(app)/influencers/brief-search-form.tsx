"use client";

import { useActionState } from "react";
import { briefSearchAction, type FormState } from "./actions";
import { btnPrimary, inputCls } from "@/components/ui";

export function BriefSearchForm({ initial, enabled }: { initial?: string; enabled: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(briefSearchAction, {});
  const value = (state.values?.brief as string | undefined) ?? initial ?? "";
  return (
    <form action={action} className="flex flex-col gap-2 sm:flex-row" key={value}>
      <input
        name="brief"
        defaultValue={value}
        disabled={!enabled}
        placeholder={enabled ? "Describe the brief: “Tamil mom creators in Coimbatore, 20k–100k, under ₹10k a reel”" : "Brief search needs ANTHROPIC_API_KEY in the environment variables"}
        className={`${inputCls} flex-1`}
      />
      <button disabled={!enabled || pending} className={btnPrimary}>{pending ? "Reading brief…" : "Find matches"}</button>
      {state.error && <p className="text-sm text-red-600 sm:basis-full">{state.error}</p>}
    </form>
  );
}
