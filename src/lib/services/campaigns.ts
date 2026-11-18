import type { Db } from "@/lib/supabase/server";
import { ServiceError, fromDb } from "./errors";

/** Campaigns the team can add influencers to (planning or live). */
export async function listOpenCampaigns(db: Db, workspaceId: string) {
  const { data, error } = await db
    .from("campaigns_thunder")
    .select("id, name, status, brand:brands_thunder(name)")
    .eq("workspace_id", workspaceId)
    .in("status", ["planning", "live"])
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  fromDb(error, "Loading campaigns");
  return (data ?? []).map((c) => ({
    id: c.id as string,
    name: c.name as string,
    brand: (Array.isArray(c.brand) ? c.brand[0]?.name : (c.brand as { name?: string } | null)?.name) ?? "",
  }));
}

/** Adds influencers to a campaign pipeline as Shortlisted. Skips anyone already in it. */
export async function addInfluencersToCampaign(db: Db, workspaceId: string, userId: string, campaignId: string, influencerIds: string[]) {
  const ids = [...new Set(influencerIds)].slice(0, 200);
  if (ids.length === 0) throw new ServiceError("Select at least one influencer.", "validation");

  const { data: existing, error: e1 } = await db
    .from("deals_thunder")
    .select("influencer_id")
    .eq("workspace_id", workspaceId)
    .eq("campaign_id", campaignId)
    .is("deleted_at", null)
    .in("influencer_id", ids);
  fromDb(e1, "Checking campaign");
  const already = new Set((existing ?? []).map((d) => d.influencer_id as string));
  const toAdd = ids.filter((id) => !already.has(id));

  if (toAdd.length) {
    const { error } = await db.from("deals_thunder").insert(
      toAdd.map((influencer_id) => ({ workspace_id: workspaceId, campaign_id: campaignId, influencer_id, owner_id: userId, created_by: userId })),
    );
    fromDb(error, "Adding to campaign");
  }
  return { added: toAdd.length, skipped: already.size };
}
