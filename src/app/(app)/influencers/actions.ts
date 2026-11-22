"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { requireWorkspace } from "@/lib/auth";
import { formToDefaults, formToObject } from "@/lib/form";
import { ServiceError } from "@/lib/services/errors";
import { filtersFromParams, filtersToQuery } from "@/lib/services/filters";
import { briefToFilters } from "@/lib/services/brief-search";
import { workspaceVocab } from "@/lib/services/lists";
import { saveSearch, deleteSavedSearch } from "@/lib/services/saved-searches";
import { addInfluencersToCampaign } from "@/lib/services/campaigns";
import {
  createInfluencer, updateInfluencer, setBlacklist, softDeleteInfluencer, restoreInfluencer,
  addCompetitorPromo, removeCompetitorPromo, approvePending, rejectPending, findByHandle,
} from "@/lib/services/influencers";
import { lookupProfile, refreshInfluencerFromInstagram, type ProfileLookup } from "@/lib/services/instagram";

// Actions are thin: check the session, call a service, map errors to a message.
const message = (e: unknown) => (e instanceof ServiceError ? e.message : "Something went wrong. Please try again.");
const ARRAY_FIELDS = ["languages", "formats", "content_styles"];

export type FormState = { error?: string; values?: Record<string, string | string[]>; ok?: string };

// ── Search ───────────────────────────────────────────────────
export async function briefSearchAction(_: FormState, form: FormData): Promise<FormState> {
  const brief = String(form.get("brief") ?? "");
  const { db, workspace } = await requireWorkspace();
  let query: string;
  try {
    const vocab = await workspaceVocab(db, workspace.id);
    const filters = await briefToFilters(brief, vocab);
    query = filtersToQuery(filters, { brief: brief.trim().slice(0, 300) });
  } catch (e) {
    return { error: message(e), values: { brief } };
  }
  redirect(`/influencers${query || "?brief=" + encodeURIComponent(brief)}`);
}

export async function saveSearchAction(_: FormState, form: FormData): Promise<FormState> {
  const { db, workspace, user } = await requireWorkspace();
  const filters = filtersFromParams(Object.fromEntries(new URLSearchParams(String(form.get("query") ?? ""))));
  try {
    await saveSearch(db, workspace.id, user.id, String(form.get("name") ?? ""), filters);
  } catch (e) {
    return { error: message(e) };
  }
  refresh();
  return { ok: "Saved" };
}

export async function deleteSavedSearchAction(form: FormData) {
  const { db, workspace } = await requireWorkspace();
  await deleteSavedSearch(db, workspace.id, String(form.get("id")));
  refresh();
}

export async function addToCampaignAction(campaignId: string, influencerIds: string[]): Promise<FormState> {
  const { db, workspace, user } = await requireWorkspace();
  try {
    const { added, skipped } = await addInfluencersToCampaign(db, workspace.id, user.id, campaignId, influencerIds);
    refresh();
    return { ok: `Added ${added} to the campaign as Shortlisted${skipped ? ` (${skipped} already there)` : ""}.` };
  } catch (e) {
    return { error: message(e) };
  }
}

// ── Create / edit ────────────────────────────────────────────
export async function createInfluencerAction(_: FormState, form: FormData): Promise<FormState> {
  const { db, workspace, user } = await requireWorkspace();
  let id: string;
  try {
    id = await createInfluencer(db, workspace.id, user.id, formToObject(form, ARRAY_FIELDS));
  } catch (e) {
    return { error: message(e), values: formToDefaults(form) };
  }
  redirect(`/influencers/${id}`);
}

export async function updateInfluencerAction(id: string, _: FormState, form: FormData): Promise<FormState> {
  const { db, workspace } = await requireWorkspace();
  try {
    await updateInfluencer(db, workspace.id, id, formToObject(form, ARRAY_FIELDS));
  } catch (e) {
    return { error: message(e), values: formToDefaults(form) };
  }
  redirect(`/influencers/${id}`);
}

// ── Profile actions ──────────────────────────────────────────
export async function blacklistAction(id: string, _: FormState, form: FormData): Promise<FormState> {
  const { db, workspace } = await requireWorkspace();
  try {
    await setBlacklist(db, workspace.id, id, form.get("blacklisted") === "true", String(form.get("reason") ?? ""));
  } catch (e) {
    return { error: message(e) };
  }
  refresh();
  return {};
}

export async function deleteInfluencerAction(id: string) {
  const { db, workspace } = await requireWorkspace();
  await softDeleteInfluencer(db, workspace.id, id);
  refresh();
}

export async function restoreInfluencerAction(id: string): Promise<FormState> {
  const { db, workspace } = await requireWorkspace();
  try {
    await restoreInfluencer(db, workspace.id, id);
  } catch (e) {
    return { error: message(e) };
  }
  refresh();
  return {};
}

export async function addPromoAction(influencerId: string, _: FormState, form: FormData): Promise<FormState> {
  const { db, workspace } = await requireWorkspace();
  try {
    await addCompetitorPromo(db, workspace.id, influencerId, formToObject(form));
  } catch (e) {
    return { error: message(e), values: formToDefaults(form) };
  }
  refresh();
  return {};
}

export async function removePromoAction(form: FormData) {
  const { db, workspace } = await requireWorkspace();
  await removeCompetitorPromo(db, workspace.id, String(form.get("id")));
  refresh();
}

// ── Review queue ─────────────────────────────────────────────
export async function approvePendingAction(form: FormData) {
  const { db } = await requireWorkspace();
  await approvePending(db, String(form.get("id")));
  refresh();
}

export async function rejectPendingAction(form: FormData) {
  const { db, workspace, user } = await requireWorkspace();
  await rejectPending(db, workspace.id, user.id, String(form.get("id")));
  refresh();
}

// ── Instagram (Business Discovery) ───────────────────────────
export async function lookupInstagramAction(handle: string): Promise<{ error?: string; profile?: ProfileLookup; existing?: { id: string; name: string } }> {
  const { db, workspace } = await requireWorkspace();
  try {
    const [profile, existing] = await Promise.all([lookupProfile(handle), findByHandle(db, workspace.id, handle)]);
    return { profile, existing: existing ? { id: existing.id, name: existing.name } : undefined };
  } catch (e) {
    return { error: message(e) };
  }
}

export async function refreshInfluencerIgAction(id: string): Promise<{ error?: string; ok?: string }> {
  const { db, workspace } = await requireWorkspace();
  try {
    const p = await refreshInfluencerFromInstagram(db, workspace.id, id);
    refresh();
    return { ok: `Updated: ${p.followers?.toLocaleString("en-IN") ?? "–"} followers${p.engagement_rate !== null ? `, ${p.engagement_rate}% engagement` : ""}` };
  } catch (e) {
    return { error: message(e) };
  }
}
