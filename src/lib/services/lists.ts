import type { Db } from "@/lib/supabase/server";
import { fromDb } from "./errors";

export type ListType = "niche" | "content_style" | "city" | "language" | "format";

/** Workspace vocabulary: editable lists merged with values already used on profiles. */
export async function workspaceVocab(db: Db, workspaceId: string) {
  const [lists, used, brands] = await Promise.all([
    db.from("workspace_lists_thunder").select("list_type, value, position").eq("workspace_id", workspaceId).order("position"),
    db.from("influencers_thunder").select("niche_tags, city, languages, content_styles").eq("workspace_id", workspaceId).is("deleted_at", null).limit(5000),
    db.from("brands_thunder").select("id, name").eq("workspace_id", workspaceId).is("deleted_at", null).order("name"),
  ]);
  fromDb(lists.error, "Loading lists");
  fromDb(used.error, "Loading tags");
  fromDb(brands.error, "Loading brands");

  const fromList = (t: ListType) => (lists.data ?? []).filter((l) => l.list_type === t).map((l) => l.value.toLowerCase());
  const uniq = (a: (string | null | undefined)[]) => [...new Set(a.filter(Boolean).map((s) => s!.toLowerCase()))].sort();
  const rows = used.data ?? [];

  return {
    niches: uniq([...fromList("niche"), ...rows.flatMap((r) => r.niche_tags ?? [])]),
    cities: uniq([...fromList("city"), ...rows.map((r) => r.city)]),
    languages: uniq([...fromList("language"), ...rows.flatMap((r) => r.languages ?? [])]),
    contentStyles: uniq([...fromList("content_style"), ...rows.flatMap((r) => r.content_styles ?? [])]),
    formats: ["reel", "story", "carousel", "collab"],
    brands: (brands.data ?? []) as { id: string; name: string }[],
  };
}
