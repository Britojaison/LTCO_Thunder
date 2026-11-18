"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import type { FormState } from "./actions";
import type { Contact } from "@/lib/services/brands";
import { btnPrimary, btnSecondary, Card, Field, inputCls } from "@/components/ui";

type Initial = { name?: string; category?: string | null; competitor_brands?: string[]; client_contacts?: Contact[] };

export function BrandForm({ action, initial = {}, logoUrl, cancelHref, submitLabel }: {
  action: (s: FormState, f: FormData) => Promise<FormState>; initial?: Initial; logoUrl?: string; cancelHref: string; submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, {});
  const v = state.values;
  const startContacts: Contact[] = v?.client_contacts ? safeContacts(String(v.client_contacts)) : initial.client_contacts ?? [];
  const [contacts, setContacts] = useState<Contact[]>(startContacts.length ? startContacts : [{ name: "", role: "", email: "", phone: "" }]);
  const set = (i: number, k: keyof Contact, val: string) => setContacts((c) => c.map((x, j) => (j === i ? { ...x, [k]: val } : x)));

  return (
    <form action={formAction} key={JSON.stringify(v ?? "init")} className="max-w-3xl space-y-4">
      {state.error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      <Card title="Brand">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Brand name *"><input name="name" required defaultValue={(v?.name as string) ?? initial.name ?? ""} className={inputCls} /></Field>
          <Field label="Category"><input name="category" placeholder="e.g. Food & beverage" defaultValue={(v?.category as string) ?? initial.category ?? ""} className={inputCls} /></Field>
        </div>
        <div className="mt-3 flex items-center gap-4">
          {logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="Current logo" className="h-14 w-14 rounded-md border border-zinc-200 object-contain" />
          )}
          <Field label={logoUrl ? "Replace logo" : "Logo"} hint="PNG, JPG, WebP or SVG, under 900 KB. Used on report covers.">
            <input type="file" name="logo" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="text-sm" />
          </Field>
          {logoUrl && <label className="flex items-center gap-1 text-sm"><input type="checkbox" name="remove_logo" /> Remove</label>}
        </div>
        <div className="mt-3">
          <Field label="Competitor brands" hint="Comma separated. Used by the “no competitor promotion” search filter.">
            <input name="competitor_brands" defaultValue={(v?.competitor_brands as string) ?? (initial.competitor_brands ?? []).join(", ")} className={inputCls} />
          </Field>
        </div>
      </Card>

      <Card title="Client contacts" actions={
        <button type="button" className={btnSecondary} onClick={() => setContacts((c) => [...c, { name: "", role: "", email: "", phone: "" }])}>Add contact</button>
      }>
        <input type="hidden" name="client_contacts" value={JSON.stringify(contacts)} />
        <div className="space-y-2">
          {contacts.map((c, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_1fr_auto]">
              <input placeholder="Name" value={c.name} onChange={(e) => set(i, "name", e.target.value)} className={inputCls} />
              <input placeholder="Role" value={c.role} onChange={(e) => set(i, "role", e.target.value)} className={inputCls} />
              <input placeholder="Email" value={c.email} onChange={(e) => set(i, "email", e.target.value)} className={inputCls} />
              <input placeholder="Phone" value={c.phone} onChange={(e) => set(i, "phone", e.target.value)} className={inputCls} />
              <button type="button" aria-label="Remove contact" onClick={() => setContacts((x) => x.filter((_, j) => j !== i))} className="px-2 text-zinc-400 hover:text-red-600">×</button>
            </div>
          ))}
        </div>
      </Card>

      <div className="flex gap-2">
        <button disabled={pending} className={btnPrimary}>{pending ? "Saving…" : submitLabel}</button>
        <Link href={cancelHref} className={btnSecondary}>Cancel</Link>
      </div>
    </form>
  );
}

function safeContacts(s: string): Contact[] {
  try { return JSON.parse(s); } catch { return []; }
}
