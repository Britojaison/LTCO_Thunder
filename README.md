# Thunder

Influencer management for agencies. See the Thunder project docs: **Thunder — PRD** and **Thunder — System Design**.

Stack: Next.js 16 (App Router, Cache Components) · Supabase (Postgres + RLS, Auth, Storage) · Vercel.

## First-time setup

1. **Create a Supabase project** at supabase.com. In *Authentication → Providers*, keep Email on and (optionally) enable Google.
   In *Authentication → URL configuration* add `http://localhost:3000/auth/callback` as a redirect URL.
2. **Install the Supabase CLI** (macOS): `brew install supabase/tap/supabase`
3. **Apply the database migrations**
   ```bash
   supabase login
   supabase init            # only once, creates supabase/config.toml (keep the existing migrations folder)
   supabase link --project-ref <your-project-ref>
   supabase db push         # runs supabase/migrations/*.sql in order
   ```
   Migration 0004 enables `pg_cron`. If it fails, enable *pg_cron* under Database → Extensions and run `supabase db push` again.
4. **Environment**: `cp .env.example .env.local` and fill in the URL and publishable key (Project settings → API).
5. **Run**: `npm install && npm run dev` → http://localhost:3000. Sign up, create your agency workspace, done.

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
  0001_foundation           # workspaces, members, invites, is_member(), activity log triggers
  0002_core_tables          # influencers, brands, campaigns, deals (margin), posts, snapshots, reports, jobs + RLS
  0003_rpc_and_views        # create_workspace, accept_invite, submit_registration, client-safe report views
  0004_storage_and_cron     # per-workspace file bucket policies, nightly soft-delete purge
```

## Rules for contributors

- **Server actions and route handlers stay thin**: validate input, call `lib/services/*`, return. This keeps a later move to a standalone backend cheap.
- **Never** use the service-role key in the web app. RLS is the security boundary.
- **Session reads go inside `<Suspense>`** (Cache Components). Call `requireWorkspace()` in the async child, not in the page or layout body.
- **Client reports read only from `report_deals` and `report_post_metrics`.** These views have no payout or margin columns.
- **No hard deletes from the app**: set `deleted_at`. A nightly job purges rows older than 30 days.
- **New tables**: add `workspace_id`, a composite FK to the parent, RLS policies via the same pattern, and `select private.track('public.<table>')`.
