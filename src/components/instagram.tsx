"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { lookupInstagramAction, refreshInfluencerIgAction } from "@/app/(app)/influencers/actions";
import { refreshPostsIgAction } from "@/app/(app)/campaigns/deal-actions";
import { btnSecondary } from "@/components/ui";

const setField = (form: HTMLFormElement, name: string, value: string | number | null, onlyIfEmpty = false) => {
  const el = form.elements.namedItem(name);
  if (!(el instanceof HTMLInputElement) || value === null || value === undefined) return false;
  if (onlyIfEmpty && el.value.trim()) return false;
  el.value = String(value);
  return true;
};

/** Sits inside a form with a `handle` input. Looks the handle up on Instagram and fills
 *  followers, engagement rate and (if empty) name. The team still reviews and saves. */
export function InstagramFill({ compact = false }: { compact?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok?: string; error?: string; existing?: { id: string; name: string } }>({});

  const run = () => {
    const form = ref.current?.closest("form");
    const handle = (form?.elements.namedItem("handle") as HTMLInputElement | null)?.value.trim();
    if (!form || !handle) return setMsg({ error: "Type the handle first." });
    start(async () => {
      const r = await lookupInstagramAction(handle);
      if (r.error || !r.profile) return setMsg({ error: r.error ?? "Lookup failed" });
      const p = r.profile;
      setField(form, "name", p.name, true);
      setField(form, "followers", p.followers);
      setField(form, "engagement_rate", p.engagement_rate);
      setField(form, "avg_reel_views", p.avg_reel_views);
      setMsg({
        ok: `${p.followers?.toLocaleString("en-IN") ?? "–"} followers · ${p.media_count ?? "–"} posts${p.engagement_rate !== null ? ` · ${p.engagement_rate}% avg engagement (last ${p.posts_sampled})` : ""}${p.avg_reel_views !== null ? ` · ${p.avg_reel_views.toLocaleString("en-IN")} avg reel views` : ""}`,
        existing: r.existing,
      });
    });
  };

  return (
    <span ref={ref} className={compact ? "contents" : "flex flex-wrap items-center gap-2"}>
      <button type="button" onClick={run} disabled={pending} className={btnSecondary}>
        {pending ? "Looking up…" : "Fetch from Instagram"}
      </button>
      {(msg.ok || msg.error) && (
        <span className={`text-xs ${msg.error ? "text-red-600" : "text-emerald-700"} ${compact ? "sm:col-span-2 lg:col-span-4" : ""}`}>
          {msg.error ?? msg.ok}
          {msg.existing && <> · Already in your databank as <Link href={`/influencers/${msg.existing.id}`} className="underline">{msg.existing.name}</Link></>}
        </span>
      )}
    </span>
  );
}

/** Profile page: update followers, engagement rate and avg reel views from Instagram. */
export function RefreshProfileButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  return (
    <span className="flex flex-wrap items-center gap-2">
      <button type="button" disabled={pending} className={btnSecondary} onClick={() => start(async () => setMsg(await refreshInfluencerIgAction(id)))}>
        {pending ? "Updating…" : "Update from Instagram"}
      </button>
      {(msg.ok || msg.error) && <span className={`text-xs ${msg.error ? "text-red-600" : "text-emerald-700"}`}>{msg.error ?? msg.ok}</span>}
    </span>
  );
}

/** Deal page or campaign performance: pull likes and comments for posts. */
export function RefreshPostsButton({ dealId, campaignId, label = "Refresh likes, comments & views" }: { dealId?: string; campaignId?: string; label?: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok?: string; error?: string; detail?: string[] }>({});
  const run = () => start(async () => {
    const r = await refreshPostsIgAction({ dealId, campaignId });
    if (r.error || !r.result) return setMsg({ error: r.error ?? "Refresh failed" });
    const { updated, notFound, skipped, errors } = r.result;
    const detail = [
      ...errors,
      ...notFound.map((u) => `Not found on the influencer's feed (collab on another account?): ${u.replace(/^https?:\/\/(www\.)?/, "")}`),
    ];
    setMsg({
      ok: updated || !errors.length
        ? `Updated ${updated} post${updated === 1 ? "" : "s"}${skipped.length ? ` · ${skipped.length} skipped (stories or no post link)` : ""}. Saves, shares and reach still need Insights screenshots.`
        : undefined,
      error: !updated && errors.length ? errors[0] : undefined,
      detail,
    });
  });
  return (
    <div className="space-y-1">
      <button type="button" onClick={run} disabled={pending} className={btnSecondary}>{pending ? "Refreshing…" : label}</button>
      {(msg.ok || msg.error) && <p className={`text-xs ${msg.error ? "text-red-600" : "text-emerald-700"}`}>{msg.error ?? msg.ok}</p>}
      {msg.detail && msg.detail.length > 0 && (
        <ul className="list-disc pl-4 text-xs text-amber-700">{msg.detail.slice(0, 6).map((d) => <li key={d} className="break-all">{d}</li>)}</ul>
      )}
    </div>
  );
}
