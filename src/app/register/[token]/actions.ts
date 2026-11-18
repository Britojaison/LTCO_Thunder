"use server";

import { createClient } from "@/lib/supabase/server";
import { formToDefaults, formToObject } from "@/lib/form";
import { submitRegistration } from "@/lib/services/influencers";
import { ServiceError } from "@/lib/services/errors";

export type RegisterState = { error?: string; done?: boolean; values?: Record<string, string | string[]> };

export async function registerAction(token: string, _: RegisterState, form: FormData): Promise<RegisterState> {
  // Honeypot: real people never fill this hidden field.
  if (String(form.get("website") ?? "")) return { done: true };
  const db = await createClient();
  try {
    await submitRegistration(db, token, formToObject(form, ["languages", "formats"]), form.get("consent") === "on");
  } catch (e) {
    return { error: e instanceof ServiceError ? e.message : "Couldn't submit. Please try again.", values: formToDefaults(form) };
  }
  return { done: true };
}
