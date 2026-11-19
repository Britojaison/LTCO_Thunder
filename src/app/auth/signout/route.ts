import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const db = await createClient();
  await db.auth.signOut();
  // Optional "next" (e.g. an invite link) so the person lands back there after signing in.
  const form = await request.formData().catch(() => null);
  const next = String(form?.get("next") ?? "");
  const url = new URL("/login", request.url);
  if (next.startsWith("/") && !next.startsWith("//")) url.searchParams.set("next", next);
  return NextResponse.redirect(url, { status: 303 });
}
