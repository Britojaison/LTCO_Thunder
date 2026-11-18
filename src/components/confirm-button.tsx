"use client";

import { useState, useTransition } from "react";
import { btnDanger, btnSecondary } from "./ui";

/** Two-step destructive button. `action` returns an error message or nothing. */
export function ConfirmButton({ label, confirmText, action }: { label: string; confirmText: string; action: () => Promise<{ error?: string } | void> }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  if (!open) return <button onClick={() => setOpen(true)} className={btnDanger}>{label}</button>;
  return (
    <span className="flex flex-wrap items-center gap-2 text-sm">
      {confirmText}
      <button disabled={pending} className={btnDanger}
        onClick={() => start(async () => { const r = await action(); if (r && r.error) setError(r.error); })}>
        {pending ? "Working…" : `Yes, ${label.toLowerCase()}`}
      </button>
      <button onClick={() => { setOpen(false); setError(undefined); }} className={btnSecondary}>Cancel</button>
      {error && <span className="basis-full text-red-600">{error}</span>}
    </span>
  );
}
