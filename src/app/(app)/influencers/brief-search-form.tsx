"use client";

import { useActionState } from "react";
import { briefSearchAction, type FormState } from "./actions";
import { inputCls } from "@/components/ui";

export function BriefSearchForm({ initial, enabled }: { initial?: string; enabled: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(briefSearchAction, {});
  const value = (state.values?.brief as string | undefined) ?? initial ?? "";
  return (
    <form action={action} className="flex w-full flex-col gap-2 sm:flex-row" key={value}>
      <input
        name="brief"
        defaultValue={value}
        disabled={!enabled}
        placeholder={enabled ? "Describe the brief: “Tamil mom creators in Coimbatore, 20k–100k, under ₹10k a reel”" : "Brief search needs ANTHROPIC_API_KEY in the environment variables"}
        className={`${inputCls} flex-1`}
      />
      <button disabled={!enabled || pending} className="inline-flex h-11 w-[152px] shrink-0 items-center justify-center gap-2 self-end whitespace-nowrap rounded-xl border border-orange-200 bg-[#fff4eb] px-4 text-sm font-semibold text-[#c2410c] transition hover:bg-[#ffede0] disabled:opacity-50 sm:self-auto"><svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.5 4.5" /></svg>{pending ? "Reading brief…" : "Find matches"}</button>
      {state.error && <p className="text-sm text-red-600 sm:basis-full">{state.error}</p>}
    </form>
  );
}
