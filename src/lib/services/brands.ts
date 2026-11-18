import { z } from "zod";
import type { Db } from "@/lib/supabase/server";
import { ServiceError, fromDb } from "./errors";
import { uploadImage } from "./storage";

/** Brand services. Plain functions, no Next.js imports. */

export const contactSchema = z.object({
  name: z.string().trim().max(120).default(""),
  role: z.string().trim().max(120).default(""),
  email: z.string().trim().max(200).default(""),
  phone: z.string().trim().max(40).default(""),
});
export type Contact = z.infer<typeof contactSchema>;

export const brandInput = z.object({
  name: z.string().trim().min(1, "Brand name is required").max(120),
  category: z.preprocess((v) => (v === "" ? null : v), z.string().trim().max(80).nullable()).optional(),
  competitor_brands: z.preprocess(
    (v) => (typeof v === "string" ? v.split(",") : v ?? []),
    z.array(z.string().trim()).transform((a) => [...new Set(a.filter(Boolean))].slice(0, 50)),
  ),
  client_contacts: z.preprocess(
    (v) => {
      if (typeof v !== "string" || !v) return [];
      try { return JSON.parse(v); } catch { return []; }
    },
    z.array(contactSchema).transform((a) => a.filter((c) => c.name || c.email || c.phone).slice(0, 20)),
  ),
});

function parse(input: unknown) {
  const p = brandInput.safeParse(input);
  if (!p.success) throw new ServiceError(p.error.issues[0].message, "validation");
  for (const c of p.data.client_contacts)
    if (c.email && !z.email().safeParse(c.email).success) throw new ServiceError(`“${c.email}” isn't a valid email.`, "validation");
  return p.data;
}

export async function listBrands(db: Db, workspaceId: string) {
  const [brands, campaigns] = await Promise.all([
    db.from("brands_thunder").select("id, name, category, logo_path, competitor_brands").eq("workspace_id", workspaceId).is("deleted_at", null).order("name"),
    db.from("campaigns_thunder").select("brand_id, status").eq("workspace_id", workspaceId).is("deleted_at", null),
  ]);
  fromDb(brands.error, "Loading brands");
  fromDb(campaigns.error, "Loading campaigns");
  const counts = new Map<string, { total: number; live: number }>();
  for (const c of campaigns.data ?? []) {
    const n = counts.get(c.brand_id) ?? { total: 0, live: 0 };
    n.total++;
    if (c.status === "live") n.live++;
    counts.set(c.brand_id, n);
  }
  return (brands.data ?? []).map((b) => ({ ...b, campaigns: counts.get(b.id) ?? { total: 0, live: 0 } }));
}

export async function getBrand(db: Db, workspaceId: string, id: string) {
  if (!z.uuid().safeParse(id).success) throw new ServiceError("Brand not found", "not_found");
  const { data, error } = await db.from("brands_thunder").select("*").eq("workspace_id", workspaceId).eq("id", id).is("deleted_at", null).maybeSingle();
  fromDb(error, "Loading brand");
  if (!data) throw new ServiceError("Brand not found", "not_found");
  const client_contacts: Contact[] = z.array(contactSchema).catch([]).parse(data.client_contacts);
  return {
    id: data.id as string, name: data.name as string, category: data.category as string | null,
    logo_path: data.logo_path as string | null, competitor_brands: (data.competitor_brands ?? []) as string[], client_contacts,
  };
}

async function nameTaken(db: Db, workspaceId: string, name: string, exceptId?: string) {
  const { data } = await db.from("brands_thunder").select("id").eq("workspace_id", workspaceId).ilike("name", name.replace(/[%_\\]/g, "\\$&")).is("deleted_at", null);
  return (data ?? []).some((b) => b.id !== exceptId);
}

export async function createBrand(db: Db, workspaceId: string, userId: string, input: unknown, logo?: File | null) {
  const values = parse(input);
  if (await nameTaken(db, workspaceId, values.name)) throw new ServiceError(`${values.name} already exists.`, "validation");
  const { data, error } = await db.from("brands_thunder").insert({ ...values, workspace_id: workspaceId, created_by: userId }).select("id").single();
  if (error?.code === "23505") throw new ServiceError(`${values.name} already exists.`, "validation");
  fromDb(error, "Saving brand");
  if (logo && logo.size > 0) await setBrandLogo(db, workspaceId, data!.id, logo);
  return data!.id as string;
}

export async function updateBrand(db: Db, workspaceId: string, id: string, input: unknown, logo?: File | null, removeLogo = false) {
  const values = parse(input);
  if (await nameTaken(db, workspaceId, values.name, id)) throw new ServiceError(`${values.name} already exists.`, "validation");
  const { error } = await db.from("brands_thunder").update({ ...values, ...(removeLogo ? { logo_path: null } : {}) }).eq("workspace_id", workspaceId).eq("id", id);
  if (error?.code === "23505") throw new ServiceError(`${values.name} already exists.`, "validation");
  fromDb(error, "Updating brand");
  if (logo && logo.size > 0) await setBrandLogo(db, workspaceId, id, logo);
}

async function setBrandLogo(db: Db, workspaceId: string, id: string, logo: File) {
  const path = await uploadImage(db, workspaceId, "brands", id, logo);
  const { error } = await db.from("brands_thunder").update({ logo_path: path }).eq("workspace_id", workspaceId).eq("id", id);
  fromDb(error, "Saving logo");
}

export async function deleteBrand(db: Db, workspaceId: string, id: string) {
  const { count } = await db.from("campaigns_thunder").select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId).eq("brand_id", id).is("deleted_at", null).in("status", ["planning", "live"]);
  if (count) throw new ServiceError("This brand has planning or live campaigns. Complete or archive them first.", "validation");
  const { error } = await db.from("brands_thunder").update({ deleted_at: new Date().toISOString() }).eq("workspace_id", workspaceId).eq("id", id);
  fromDb(error, "Deleting brand");
}
