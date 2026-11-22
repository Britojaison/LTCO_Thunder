"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { requireWorkspace } from "@/lib/auth";
import { formToDefaults, formToObject } from "@/lib/form";
import { ServiceError } from "@/lib/services/errors";
import { createCampaign, updateCampaign, setCampaignStatus, setCampaignPoc, deleteCampaign, addInfluencersToCampaign, quickAddToCampaign } from "@/lib/services/campaigns";

export type FormState = { error?: string; values?: Record<string, string | string[]> };
const message = (e: unknown) => (e instanceof ServiceError ? e.message : "Something went wrong. Please try again.");

export async function createCampaignAction(_: FormState, form: FormData): Promise<FormState> {
  const { db, workspace, user } = await requireWorkspace();
  let id: string;
  try {
    id = await createCampaign(db, workspace.id, user.id, formToObject(form));
  } catch (e) {
    return { error: message(e), values: formToDefaults(form) };
  }
  redirect(`/campaigns/${id}`);
}

export async function updateCampaignAction(id: string, _: FormState, form: FormData): Promise<FormState> {
  const { db, workspace } = await requireWorkspace();
  try {
    await updateCampaign(db, workspace.id, id, formToObject(form));
  } catch (e) {
    return { error: message(e), values: formToDefaults(form) };
  }
  redirect(`/campaigns/${id}`);
}

export async function setStatusAction(id: string, form: FormData) {
  const { db, workspace } = await requireWorkspace();
  await setCampaignStatus(db, workspace.id, id, String(form.get("status")));
  refresh();
}

export async function setPocAction(id: string, form: FormData) {
  const { db, workspace } = await requireWorkspace();
  await setCampaignPoc(db, workspace.id, id, String(form.get("poc_id") ?? ""));
  refresh();
}

export async function addFromPreviousAction(campaignId: string, influencerIds: string[], copyFrom: string | null): Promise<{ ok?: string; error?: string }> {
  const { db, workspace, user } = await requireWorkspace();
  try {
    const { added, skipped } = await addInfluencersToCampaign(db, workspace.id, user.id, campaignId, influencerIds, copyFrom ?? undefined);
    refresh();
    return { ok: `Added ${added} as Shortlisted${copyFrom ? ", with price, payout and product copied" : ""}${skipped ? ` (${skipped} already in the campaign)` : ""}.` };
  } catch (e) {
    return { error: message(e) };
  }
}

export async function deleteCampaignAction(id: string): Promise<{ error?: string }> {
  const { db, workspace } = await requireWorkspace();
  try {
    await deleteCampaign(db, workspace.id, id);
  } catch (e) {
    return { error: message(e) };
  }
  redirect("/campaigns");
}

export async function addToThisCampaignAction(campaignId: string, influencerIds: string[]): Promise<{ ok?: string; error?: string }> {
  const { db, workspace, user } = await requireWorkspace();
  try {
    const { added, skipped } = await addInfluencersToCampaign(db, workspace.id, user.id, campaignId, influencerIds);
    refresh();
    return { ok: `Added ${added} as Shortlisted${skipped ? ` (${skipped} already in the campaign)` : ""}.` };
  } catch (e) {
    return { error: message(e) };
  }
}

export type QuickAddState = { error?: string; result?: import("@/lib/services/campaigns").QuickAddResult; values?: Record<string, string | string[]> };

export async function quickAddAction(campaignId: string, _: QuickAddState, form: FormData): Promise<QuickAddState> {
  const { db, workspace, user } = await requireWorkspace();
  try {
    const result = await quickAddToCampaign(db, workspace.id, user.id, campaignId, formToObject(form));
    refresh();
    return { result };
  } catch (e) {
    return { error: message(e), values: formToDefaults(form) };
  }
}
