"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireUser, ACTIVE_WS_COOKIE } from "@/lib/auth";
import { createWorkspace } from "@/lib/services/workspaces";
import { ServiceError } from "@/lib/services/errors";

export type OnboardingState = { error?: string };

export async function createWorkspaceAction(_: OnboardingState, form: FormData): Promise<OnboardingState> {
  const { db } = await requireUser();
  let id: string;
  try {
    id = await createWorkspace(db, {
      name: String(form.get("name") ?? ""),
      fullName: String(form.get("fullName") ?? ""),
    });
  } catch (e) {
    return { error: e instanceof ServiceError ? e.message : "Could not create the workspace." };
  }
  (await cookies()).set(ACTIVE_WS_COOKIE, id, { path: "/", sameSite: "lax", httpOnly: true, maxAge: 60 * 60 * 24 * 365 });
  redirect("/influencers");
}
