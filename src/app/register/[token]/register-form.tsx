"use client";

import { useActionState } from "react";
import { registerAction, type RegisterState } from "./actions";
import { btnPrimary, Field, inputCls } from "@/components/ui";

const LANGS = ["tamil", "telugu", "kannada", "malayalam", "hindi", "english"];
const FORMATS = ["reel", "story", "carousel", "collab"];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function RegisterForm({ token, agency }: { token: string; agency: string }) {
  const [state, action, pending] = useActionState<RegisterState, FormData>(registerAction.bind(null, token), {});
  if (state.done)
    return <p className="rounded-md bg-emerald-50 px-3 py-3 text-sm text-emerald-800">Thanks! {agency} has your details and will reach out when there’s a fit.</p>;

  const v = state.values ?? {};
  const s = (k: string) => (Array.isArray(v[k]) ? (v[k] as string[]).join(", ") : (v[k] as string) ?? "");
  const has = (k: string, o: string) => (Array.isArray(v[k]) ? (v[k] as string[]).includes(o) : v[k] === o);

  return (
    <form action={action} key={JSON.stringify(v)} className="space-y-3">
      {state.error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      <input name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Your name *"><input name="name" required defaultValue={s("name")} className={inputCls} /></Field>
        <Field label="Instagram handle *"><input name="handle" required placeholder="@yourhandle" defaultValue={s("handle")} className={inputCls} /></Field>
        <Field label="City"><input name="city" defaultValue={s("city")} className={inputCls} /></Field>
        <Field label="State"><input name="state" defaultValue={s("state")} className={inputCls} /></Field>
        <Field label="Phone"><input name="phone" defaultValue={s("phone")} className={inputCls} /></Field>
        <Field label="WhatsApp"><input name="whatsapp" defaultValue={s("whatsapp")} className={inputCls} /></Field>
        <Field label="Email"><input name="email" type="email" defaultValue={s("email")} className={inputCls} /></Field>
        <Field label="Gender">
          <select name="gender" defaultValue={s("gender")} className={inputCls}>
            <option value="">Prefer not to say</option><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option>
          </select>
        </Field>
      </div>
      <Field label="Languages you create in">
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {LANGS.map((l) => <label key={l} className="flex items-center gap-1 text-sm"><input type="checkbox" name="languages" value={l} defaultChecked={has("languages", l)} /> {cap(l)}</label>)}
        </div>
      </Field>
      <Field label="Your niches" hint="Comma separated, e.g. food, mom, travel"><input name="niche_tags" defaultValue={s("niche_tags")} className={inputCls} /></Field>
      <Field label="Formats you offer">
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {FORMATS.map((l) => <label key={l} className="flex items-center gap-1 text-sm"><input type="checkbox" name="formats" value={l} defaultChecked={has("formats", l)} /> {cap(l)}</label>)}
        </div>
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Followers"><input name="followers" inputMode="numeric" defaultValue={s("followers")} className={inputCls} /></Field>
        <Field label="Average reel views"><input name="avg_reel_views" inputMode="numeric" defaultValue={s("avg_reel_views")} className={inputCls} /></Field>
        <Field label="Rate per reel (₹)"><input name="rate_reel" inputMode="numeric" defaultValue={s("rate_reel")} className={inputCls} /></Field>
        <Field label="Rate per story (₹)"><input name="rate_story" inputMode="numeric" defaultValue={s("rate_story")} className={inputCls} /></Field>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="open_to_barter" defaultChecked={has("open_to_barter", "on")} /> Open to barter collaborations</label>
      <label className="flex items-start gap-2 rounded-md bg-zinc-50 p-3 text-sm">
        <input type="checkbox" name="consent" required className="mt-1" />
        <span>I agree that {agency} may store these details and contact me about brand collaborations. I can ask for my data to be deleted at any time.</span>
      </label>
      <button disabled={pending} className={`${btnPrimary} w-full`}>{pending ? "Submitting…" : "Submit"}</button>
    </form>
  );
}
