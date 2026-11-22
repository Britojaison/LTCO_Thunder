"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { FormState } from "./actions";
import { btnPrimary, btnSecondary, Card, Field, inputCls } from "@/components/ui";
import { cap } from "@/lib/format";
import { InstagramFill } from "@/components/instagram";

type Values = Record<string, string | string[] | number | boolean | null | undefined>;
type Vocab = { niches: string[]; languages: string[]; contentStyles: string[]; formats: string[] };

/** Shared create/edit form. Uncontrolled inputs; on a validation error the server returns
 *  the submitted values and the form remounts with them, so nothing typed is lost. */
export function InfluencerForm({
  action, initial = {}, vocab, cancelHref, submitLabel,
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  initial?: Values; vocab: Vocab; cancelHref: string; submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, {});
  const v: Values = state.values ?? initial;
  const s = (k: string) => (v[k] === null || v[k] === undefined ? "" : Array.isArray(v[k]) ? (v[k] as string[]).join(", ") : String(v[k]));
  const arr = (k: string) => (Array.isArray(v[k]) ? (v[k] as string[]) : typeof v[k] === "string" && v[k] ? [String(v[k])] : []);
  const bool = (k: string) => v[k] === true || v[k] === "true" || v[k] === "on";
  const triState = (k: string) => (v[k] === true || v[k] === "true" ? "true" : v[k] === false || v[k] === "false" ? "false" : "");

  const checks = (name: string, options: string[]) => {
    const current = arr(name);
    const all = [...new Set([...options, ...current])];
    return (
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {all.map((o) => (
          <label key={o} className="flex items-center gap-1 text-sm">
            <input type="checkbox" name={name} value={o} defaultChecked={current.includes(o)} /> {cap(o)}
          </label>
        ))}
      </div>
    );
  };
  const rating = (name: string, label: string) => (
    <Field label={label}>
      <select name={name} defaultValue={s(name)} className={inputCls}>
        <option value="">Not rated</option>
        {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} / 5</option>)}
      </select>
    </Field>
  );

  return (
    <form action={formAction} key={JSON.stringify(state.values ?? "initial")} className="max-w-4xl space-y-4">
      {state.error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}

      <Card title="Basics">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name *"><input name="name" required defaultValue={s("name")} className={inputCls} /></Field>
          <Field label="Instagram handle *" hint="@handle or profile link. Fetch fills followers, engagement rate and reel views.">
            <div className="flex gap-2"><input name="handle" required defaultValue={s("handle")} className={inputCls} /><InstagramFill compact /></div>
          </Field>
          <Field label="City"><input name="city" defaultValue={s("city")} className={inputCls} /></Field>
          <Field label="State"><input name="state" defaultValue={s("state")} className={inputCls} /></Field>
          <Field label="Gender">
            <select name="gender" defaultValue={s("gender")} className={inputCls}>
              <option value="">–</option><option value="female">Female</option><option value="male">Male</option>
              <option value="other">Other</option><option value="mixed">Mixed (couple / group)</option>
            </select>
          </Field>
          <Field label="Age group"><input name="age_group" placeholder="e.g. 25–34" defaultValue={s("age_group")} className={inputCls} /></Field>
          <Field label="Phone"><input name="phone" defaultValue={s("phone")} className={inputCls} /></Field>
          <Field label="WhatsApp"><input name="whatsapp" defaultValue={s("whatsapp")} className={inputCls} /></Field>
          <Field label="Email"><input name="email" type="email" defaultValue={s("email")} className={inputCls} /></Field>
          <Field label="Manager / agency contact"><input name="manager_contact" defaultValue={s("manager_contact")} className={inputCls} /></Field>
        </div>
        <div className="mt-3"><Field label="Languages">{checks("languages", vocab.languages)}</Field></div>
      </Card>

      <Card title="Audience">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Followers"><input name="followers" inputMode="numeric" defaultValue={s("followers")} className={inputCls} /></Field>
          <Field label="Average reel views"><input name="avg_reel_views" inputMode="numeric" defaultValue={s("avg_reel_views")} className={inputCls} /></Field>
          <Field label="Engagement rate %"><input name="engagement_rate" inputMode="decimal" defaultValue={s("engagement_rate")} className={inputCls} /></Field>
        </div>
      </Card>

      <Card title="Content">
        <div className="space-y-3">
          <Field label="Niche tags" hint={`Comma separated. In use: ${vocab.niches.slice(0, 12).join(", ") || "none yet"}`}>
            <input name="niche_tags" defaultValue={s("niche_tags")} list="niche-options" className={inputCls} />
            <datalist id="niche-options">{vocab.niches.map((n) => <option key={n} value={n} />)}</datalist>
          </Field>
          <Field label="Content style">{checks("content_styles", vocab.contentStyles)}</Field>
          <Field label="Formats offered">{checks("formats", vocab.formats)}</Field>
          <Field label="On camera">
            <select name="on_camera" defaultValue={triState("on_camera")} className={`${inputCls} sm:w-48`}>
              <option value="">–</option><option value="true">Yes</option><option value="false">No</option>
            </select>
          </Field>
          <Field label="Sample posts" hint="Up to 5 links, one per line">
            <textarea name="sample_posts" rows={3} defaultValue={arr("sample_posts").join("\n")} className={inputCls} />
          </Field>
        </div>
      </Card>

      <Card title="Commercial">
        <p className="-mt-1 mb-3 text-xs text-zinc-500">Quoted rates. Once this influencer has deals with you, the profile shows the latest amount they were actually paid instead.</p>
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Reel ₹ (quoted)"><input name="rate_reel" inputMode="numeric" defaultValue={s("rate_reel")} className={inputCls} /></Field>
          <Field label="Story ₹"><input name="rate_story" inputMode="numeric" defaultValue={s("rate_story")} className={inputCls} /></Field>
          <Field label="Carousel ₹"><input name="rate_carousel" inputMode="numeric" defaultValue={s("rate_carousel")} className={inputCls} /></Field>
          <Field label="Collab post ₹"><input name="rate_collab" inputMode="numeric" defaultValue={s("rate_collab")} className={inputCls} /></Field>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="open_to_barter" defaultChecked={bool("open_to_barter")} /> Open to barter</label>
          <Field label="GST registered">
            <select name="gst_registered" defaultValue={triState("gst_registered")} className={inputCls}>
              <option value="">Unknown</option><option value="true">Yes</option><option value="false">No</option>
            </select>
          </Field>
        </div>
        <div className="mt-3"><Field label="Negotiation notes"><textarea name="negotiation_notes" rows={2} defaultValue={s("negotiation_notes")} className={inputCls} /></Field></div>
      </Card>

      <Card title="Team ratings (internal, never in client reports)">
        <div className="grid gap-3 sm:grid-cols-3">
          {rating("rating_reliability", "Reliability")}
          {rating("rating_quality", "Content quality")}
          {rating("rating_ease", "Ease of working")}
        </div>
      </Card>

      <div className="flex gap-2">
        <button disabled={pending} className={btnPrimary}>{pending ? "Saving…" : submitLabel}</button>
        <Link href={cancelHref} className={btnSecondary}>Cancel</Link>
      </div>
    </form>
  );
}
