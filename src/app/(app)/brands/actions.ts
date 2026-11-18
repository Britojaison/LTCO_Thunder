"use server";

import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import { formToDefaults, formToObject } from "@/lib/form";
import { ServiceError } from "@/lib/services/errors";
import { createBrand, updateBrand, deleteBrand } from "@/lib/services/brands";

export type FormState = { error?: string; values?: Record<string, string | string[]> };
const message = (e: unknown) => (e instanceof ServiceError ? e.message : "Something went wrong. Please try again.");
const fileOf = (form: FormData) => {
  const f = form.get("logo");
  return f instanceof File && f.size > 0 ? f : null;
};
const defaults = (form: FormData) => {
  const d = formToDefaults(form);
  delete d.logo;
  return d;
};

export async function createBrandAction(_: FormState, form: FormData): Promise<FormState> {
  const { db, workspace, user } = await requireWorkspace();
  let id: string;
  try {
    const fields = formToObject(form);
    delete fields.logo;
    id = await createBrand(db, workspace.id, user.id, fields, fileOf(form));
  } catch (e) {
    return { error: message(e), values: defaults(form) };
  }
  redirect(`/brands/${id}`);
}

export async function updateBrandAction(id: string, _: FormState, form: FormData): Promise<FormState> {
  const { db, workspace } = await requireWorkspace();
  try {
    const fields = formToObject(form);
    const removeLogo = fields.remove_logo === "on";
    delete fields.logo;
    delete fields.remove_logo;
    await updateBrand(db, workspace.id, id, fields, fileOf(form), removeLogo);
  } catch (e) {
    return { error: message(e), values: defaults(form) };
  }
  redirect(`/brands/${id}`);
}

export async function deleteBrandAction(id: string): Promise<{ error?: string }> {
  const { db, workspace } = await requireWorkspace();
  try {
    await deleteBrand(db, workspace.id, id);
  } catch (e) {
    return { error: message(e) };
  }
  redirect("/brands");
}
