import { Suspense } from "react";
import { requireWorkspace } from "@/lib/auth";
import { env } from "@/lib/env";
import { getBranding, listMembers, listOpenInvites, teamHistory, PRESET_COLORS } from "@/lib/services/team";
import { dateTimeIN } from "@/lib/format";
import { signedUrls } from "@/lib/services/storage";
import { Card } from "@/components/ui";
import { BrandingForm } from "./branding-form";
import { TeamSection } from "./team-section";

export const metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <section className="max-w-5xl space-y-4">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-[#18191c]">Settings</h1>
        <p className="mt-1 text-sm text-[#6b7280]">Manage your workspace, team, and client branding.</p>
      </div>
      <Suspense fallback={<p className="text-sm text-zinc-400">Loading…</p>}><Settings /></Suspense>
    </section>
  );
}

async function Settings() {
  const { db, workspace, user } = await requireWorkspace();
  const [branding, members, invites, history] = await Promise.all([
    getBranding(db, workspace.id), listMembers(db, workspace.id), listOpenInvites(db, workspace.id), teamHistory(db, workspace.id),
  ]);
  const urls = await signedUrls(db, [branding.logo_path]);
  return (
    <>
      <TeamSection members={members} invites={invites} me={user.id} siteUrl={env.NEXT_PUBLIC_SITE_URL} agency={branding.name} />
      <Card title="Team history">
        {history.length === 0 ? <p className="text-sm text-zinc-500">No changes yet.</p> : (
          <ol className="space-y-1.5 text-sm">
            {history.map((h, i) => (
              <li key={i} className="flex gap-3">
                <span className="w-32 shrink-0 text-xs tabular-nums text-zinc-400">{dateTimeIN(h.at)}</span>
                <span>{h.text}</span>
              </li>
            ))}
          </ol>
        )}
        <p className="mt-3 text-xs text-zinc-400">Removed members keep their name in all campaign and deal history. Their campaigns stay; reassign a POC from each campaign.</p>
      </Card>
      <BrandingForm name={branding.name} color={branding.color} logoUrl={branding.logo_path ? urls[branding.logo_path] : undefined} presets={PRESET_COLORS} />
      <Card title="Coming next in settings">
        <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-600">
          <li>Editable lists: niches, content styles, cities, languages</li>
          <li>Pipeline stages: rename, reorder, add</li>
          <li>Fit score weights</li>
          <li>Full CSV export</li>
        </ul>
      </Card>
    </>
  );
}
