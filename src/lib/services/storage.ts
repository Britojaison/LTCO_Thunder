import type { Db } from "@/lib/supabase/server";
import { ServiceError } from "./errors";

export const BUCKET = "thunder-files";
const IMAGE_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/svg+xml": "svg" };

/** Uploads an image under {workspaceId}/{folder}/{name}.{ext}. Storage RLS checks the workspace prefix. */
export async function uploadImage(db: Db, workspaceId: string, folder: string, name: string, file: File, maxBytes = 900_000) {
  const ext = IMAGE_TYPES[file.type];
  if (!ext) throw new ServiceError("Logo must be a PNG, JPG, WebP or SVG image.", "validation");
  if (file.size > maxBytes) throw new ServiceError(`Logo must be under ${Math.round(maxBytes / 1000)} KB.`, "validation");
  const path = `${workspaceId}/${folder}/${name}-${Date.now()}.${ext}`;
  const { error } = await db.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new ServiceError(`Upload failed: ${error.message}`);
  return path;
}

/** Short-lived links for private files. Returns a map path → URL. */
export async function signedUrls(db: Db, paths: (string | null | undefined)[], seconds = 3600) {
  const list = [...new Set(paths.filter(Boolean) as string[])];
  if (!list.length) return {} as Record<string, string>;
  const { data } = await db.storage.from(BUCKET).createSignedUrls(list, seconds);
  return Object.fromEntries((data ?? []).filter((d) => d.signedUrl).map((d) => [d.path, d.signedUrl])) as Record<string, string>;
}
