"use client";

import { createBrowserClient } from "@supabase/ssr";

/** Browser client. Only used for direct file uploads with a signed upload token. */
export function createClient() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
}
