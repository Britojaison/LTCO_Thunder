import { requireUser } from "@/lib/auth";
import { myPendingInvites } from "@/lib/services/team";
import { JoinForm } from "../invite/[token]/join-form";

/** If this person was invited somewhere, offer that first: most new users should join, not create. */
export async function PendingInvites() {
  const { db } = await requireUser();
  // Never block setup if the lookup fails (e.g. migration 0012 not run yet).
  const invites = await myPendingInvites(db).catch((e) => {
    console.error("Pending invite lookup failed:", e instanceof Error ? e.message : e);
    return [];
  });
  if (!invites.length) return null;
  return (
    <div className="mb-6 space-y-4">
      {invites.map((i) => (
        <div key={i.token} className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-4">
          <p className="mb-3 text-sm">
            You’ve been invited to join <strong>{i.workspace_name}</strong>.
          </p>
          <JoinForm token={i.token} agency={i.workspace_name} />
        </div>
      ))}
      <p className="text-center text-xs text-zinc-400">Or set up a separate agency of your own below.</p>
    </div>
  );
}
