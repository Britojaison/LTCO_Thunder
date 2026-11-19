import { Suspense } from "react";
import { requireWorkspace } from "@/lib/auth";
import { env } from "@/lib/env";
import { getBranding, listMembers, listOpenInvites, PRESET_COLORS } from "@/lib/services/team";
import { signedUrls } from "@/lib/services/storage";
import { Card } from "@/components/ui";
import { BrandingForm } from "./branding-form";
import { TeamSection } from "./team-section";

export const metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <section className="max-w-5xl space-y-4">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <Suspense fallback={<p className="text-sm text-zinc-400">Loading…</p>}><Settings /></Suspense>
    </section>
  );
}

async function Settings() {
  const { db, workspace, user } = await requireWorkspace();
  const [branding, members, invites] = await Promise.all([
    getBranding(db, workspace.id), listMembers(db, workspace.id), listOpenInvites(db, workspace.id),
  ]);
  const urls = await signedUrls(db, [branding.logo_path]);
  return (
    <>
      <TeamSection members={members} invites={invites} me={user.id} siteUrl={env.NEXT_PUBLIC_SITE_URL} agency={branding.name} />
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
