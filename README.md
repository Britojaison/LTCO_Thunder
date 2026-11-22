# Thunder

Influencer management for agencies. See the Thunder project docs: **Thunder — PRD** and **Thunder — System Design**.

Stack: Next.js 16 (App Router, Cache Components) · Supabase (Postgres + RLS, Auth, Storage) · Vercel.

## First-time setup

> Thunder currently shares a Supabase project with another app (cost saving). Everything Thunder creates is namespaced so it can't collide:
> tables/views end in `_thunder`, helpers live in the `thunder_private` schema, RPCs end in `_thunder`, the storage bucket is `thunder-files`,
> and the cron job is `thunder-purge-soft-deleted`. Auth users are shared, so workspace creation is limited to `access_allowlist_thunder`.

1. **Run the migrations in the shared project's SQL Editor**, one file at a time, in filename order
   (`supabase/migrations/20261118000001_foundation.sql` up to the newest).
   (Don't use `supabase db push` against the shared project: it would clash with the other app's migration history.)
   If 0004 fails on `pg_cron`, enable it under *Database → Extensions*, then run 0004 again.
2. **Approve who can create a workspace** (SQL Editor):
   ```sql
   insert into public.access_allowlist_thunder (email) values ('you@agency.com');
   ```
   Teammates don't need this. They join through invites.
3. **Auth settings**: in *Authentication → URL configuration* add `http://localhost:3000/auth/callback` (and your Vercel URL later)
   as an additional redirect URL (and the Vercel one, see *Deploy to Vercel*). **Leave the Site URL as the other app's.** Google sign-in uses the project's existing Google provider.
4. **Environment**: `cp .env.example .env.local` and fill in the shared project's URL and publishable key (Project settings → API).
5. **Run**: `npm install && npm run dev` → http://localhost:3000. Sign up with the approved email and create your agency workspace.

## Deploy to Vercel

The repo is ready to deploy as is: Vercel detects Next.js, runs `npm run build`, and `vercel.json` pins the
server functions to **Tokyo (`hnd1`)**, next to the Supabase database (`ap-northeast-1`). No `output` or server setup is needed.

1. **Import the repo**: vercel.com → *Add New → Project* → pick `LTCO_Thunder` → Framework: Next.js (auto). Don't deploy yet.
2. **Environment variables** (*Settings → Environment Variables*, Production and Preview):

   | Name | Value | Required |
   | --- | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project settings → API → URL | Yes |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase → API keys → publishable key (`sb_publishable_…`) | Yes |
   | `NEXT_PUBLIC_SITE_URL` | Your final address, e.g. `https://thunder.88gb.in`. Leave unset to use the Vercel domain automatically | Recommended once you have a custom domain |
   | `META_ACCESS_TOKEN` | Instagram token (System User, never expires). Mark as *Sensitive* | For Instagram lookups |
   | `META_IG_USER_ID` | Agency Instagram account id (`1784…`) | For Instagram lookups |
   | `ANTHROPIC_API_KEY` | Anthropic API key. Mark as *Sensitive* | For brief search |

   Never add the Supabase **service-role / secret** key. Thunder doesn't use it.
   `NEXT_PUBLIC_*` values are baked in at build time: redeploy after changing them.
3. **Deploy.** Note the production address (e.g. `ltco-thunder.vercel.app`).
4. **Supabase auth redirect URLs** (*Authentication → URL configuration → Redirect URLs*, keep the Site URL as the other app's), add:
   - `https://<your-production-domain>/auth/callback`
   - `https://*-<your-vercel-team>.vercel.app/auth/callback` if you want sign-in to work on preview deployments
   Without this, email confirmation and Google sign-in send people back to the wrong site.
5. **Google sign-in**: nothing to change in Google Cloud. Google returns to Supabase, and Supabase uses the redirect URLs above.
6. **Custom domain (optional)**: *Settings → Domains* → add e.g. `thunder.88gb.in` and the DNS record Vercel shows. Then set
   `NEXT_PUBLIC_SITE_URL` to it, add its `/auth/callback` to Supabase, and redeploy.
7. **Check**: sign in, open Settings → create an invite (the link should use the live domain), and try *Fetch from Instagram*.

Plan: use **Vercel Pro** for business use (Hobby is non-commercial only). Database jobs (cleanup) run in Supabase pg_cron,
so no Vercel cron is needed. Every push to `main` redeploys; other branches get preview URLs.

## Project structure

```
src/
  proxy.ts                  # Next 16 "middleware": refreshes session, redirects signed-out users
  lib/
    env.ts                  # validated env vars
    auth.ts                 # Data Access Layer: requireUser(), requireWorkspace()
    supabase/               # server client + proxy helper (@supabase/ssr)
    services/               # ALL business logic. Plain TS, takes a db client, no Next.js imports.
  app/
    login/ onboarding/ auth/ # sign in, sign up, Google, workspace creation
    (app)/                  # signed-in shell: nav + workspace switcher + module pages
supabase/migrations/
  0001_foundation           # workspaces, members, invites, allowlist, is_member(), activity log triggers
  0002_core_tables          # influencers, brands, campaigns, deals (margin), posts, snapshots, reports, jobs + RLS
  0003_rpc_and_views        # create_workspace_thunder, accept_invite_thunder, submit_registration_thunder, report views
  0004_storage_and_cron     # per-workspace file bucket policies, nightly soft-delete purge
```

## Rules for contributors

- **Server actions and route handlers stay thin**: validate input, call `lib/services/*`, return. This keeps a later move to a standalone backend cheap.
- **Never** use the service-role key in the web app. RLS is the security boundary.
- **Session reads go inside `<Suspense>`** (Cache Components). Call `requireWorkspace()` in the async child, not in the page or layout body.
- **Client reports read only from `report_deals_thunder` and `report_post_metrics_thunder`.** These views have no payout or margin columns.
- **No hard deletes from the app**: set `deleted_at`. A nightly job purges rows older than 30 days.
- **Namespacing**: tables, views and public functions end with `_thunder`; internal helpers go in the `thunder_private` schema.
- **New tables**: name them `<name>_thunder`, add `workspace_id`, a composite FK to the parent, RLS policies via the same pattern, and `select thunder_private.track('public.<name>_thunder')`.
