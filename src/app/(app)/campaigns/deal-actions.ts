"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { requireWorkspace } from "@/lib/auth";
import { formToDefaults, formToObject } from "@/lib/form";
import { ServiceError } from "@/lib/services/errors";
import {
  moveDeal, updateDeal, updatePayment, removeDeal, addContact,
  createDealUpload, attachDealFile, detachDealFile,
} from "@/lib/services/deals";
import { addPost, deletePost, saveSnapshot, deleteSnapshot, createScreenshotUpload } from "@/lib/services/posts";

export type FormState = { error?: string; ok?: string; values?: Record<string, string | string[]> };
const message = (e: unknown) => (e instanceof ServiceError ? e.message : "Something went wrong. Please try again.");

export async function moveDealAction(dealId: string, stageId: string): Promise<{ error?: string }> {
  const { db, workspace } = await requireWorkspace();
  try {
    await moveDeal(db, workspace.id, dealId, stageId);
  } catch (e) {
    return { error: message(e) };
  }
  refresh();
  return {};
}

export async function updateDealAction(dealId: string, _: FormState, form: FormData): Promise<FormState> {
  const { db, workspace } = await requireWorkspace();
  try {
    await updateDeal(db, workspace.id, dealId, formToObject(form));
  } catch (e) {
    return { error: message(e), values: formToDefaults(form) };
  }
  refresh();
  return { ok: "Saved" };
}

export async function updatePaymentAction(dealId: string, _: FormState, form: FormData): Promise<FormState> {
  const { db, workspace } = await requireWorkspace();
  try {
    const status = await updatePayment(db, workspace.id, dealId, formToObject(form));
    refresh();
    return { ok: `Saved · ${status.replace("_", " ")}` };
  } catch (e) {
    return { error: message(e), values: formToDefaults(form) };
  }
}

export async function addContactAction(dealId: string, _: FormState, form: FormData): Promise<FormState> {
  const { db, workspace, user } = await requireWorkspace();
  try {
    await addContact(db, workspace.id, user.id, dealId, formToObject(form));
  } catch (e) {
    return { error: message(e), values: formToDefaults(form) };
  }
  refresh();
  return {};
}

export async function removeDealAction(campaignId: string, dealId: string): Promise<{ error?: string }> {
  const { db, workspace } = await requireWorkspace();
  try {
    await removeDeal(db, workspace.id, dealId);
  } catch (e) {
    return { error: message(e) };
  }
  redirect(`/campaigns/${campaignId}/pipeline`);
}

export async function startUploadAction(dealId: string, kind: string, contentType: string, size: number) {
  const { db, workspace } = await requireWorkspace();
  try {
    return { ok: true as const, ...(await createDealUpload(db, workspace.id, dealId, kind, contentType, size)) };
  } catch (e) {
    return { ok: false as const, error: message(e) };
  }
}

export async function finishUploadAction(dealId: string, kind: string, path: string): Promise<{ error?: string }> {
  const { db, workspace } = await requireWorkspace();
  try {
    await attachDealFile(db, workspace.id, dealId, kind, path);
  } catch (e) {
    return { error: message(e) };
  }
  refresh();
  return {};
}

export async function removeFileAction(dealId: string, kind: string): Promise<{ error?: string }> {
  const { db, workspace } = await requireWorkspace();
  try {
    await detachDealFile(db, workspace.id, dealId, kind);
  } catch (e) {
    return { error: message(e) };
  }
  refresh();
  return {};
}

// ── Posts and metrics ────────────────────────────────────────

export async function addPostAction(dealId: string, _: FormState, form: FormData): Promise<FormState> {
  const { db, workspace, user } = await requireWorkspace();
  try {
    await addPost(db, workspace.id, user.id, dealId, formToObject(form));
  } catch (e) {
    return { error: message(e), values: formToDefaults(form) };
  }
  refresh();
  return { ok: "Post added" };
}

export async function deletePostAction(postId: string): Promise<{ error?: string }> {
  const { db, workspace } = await requireWorkspace();
  try {
    await deletePost(db, workspace.id, postId);
  } catch (e) {
    return { error: message(e) };
  }
  refresh();
  return {};
}

export async function saveSnapshotAction(postId: string, form: FormData): Promise<FormState> {
  const { db, workspace, user } = await requireWorkspace();
  try {
    await saveSnapshot(db, workspace.id, user.id, postId, formToObject(form));
  } catch (e) {
    return { error: message(e), values: formToDefaults(form) };
  }
  refresh();
  return { ok: "Metrics saved" };
}

export async function deleteSnapshotAction(snapshotId: string): Promise<{ error?: string }> {
  const { db, workspace } = await requireWorkspace();
  try {
    await deleteSnapshot(db, workspace.id, snapshotId);
  } catch (e) {
    return { error: message(e) };
  }
  refresh();
  return {};
}

export async function startScreenshotUploadAction(postId: string, contentType: string, size: number) {
  const { db, workspace } = await requireWorkspace();
  try {
    return { ok: true as const, ...(await createScreenshotUpload(db, workspace.id, postId, contentType, size)) };
  } catch (e) {
    return { ok: false as const, error: message(e) };
  }
}
