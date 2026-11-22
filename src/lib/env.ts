import { z } from "zod";

/**
 * Site URL used in invite, registration and sign-in links.
 * Order: NEXT_PUBLIC_SITE_URL if set → on Vercel production, the production domain →
 * on Vercel previews, that deployment's branch URL → localhost.
 */
function siteUrl() {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/+$/, "");
  const host =
    process.env.VERCEL_ENV === "production"
      ? process.env.VERCEL_PROJECT_PRODUCTION_URL
      : process.env.VERCEL_BRANCH_URL || process.env.VERCEL_URL;
  return host ? `https://${host}` : "http://localhost:3000";
}

const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url("NEXT_PUBLIC_SUPABASE_URL is missing. Add it to .env.local, or to the Vercel project's environment variables."),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is missing.").min(1, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is empty."),
  NEXT_PUBLIC_SITE_URL: z.url(),
});

export const env = schema.parse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  NEXT_PUBLIC_SITE_URL: siteUrl(),
});
