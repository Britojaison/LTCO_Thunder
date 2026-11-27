import Link from "next/link";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { inviteInfo } from "@/lib/services/team";
import { JoinForm } from "./join-form";

export const metadata = { title: "Join workspace" };

export default function InvitePage({ params }: PageProps<"/invite/[token]">) {
  return (
    <main className="bg-thunder-mesh flex flex-1 items-center justify-center p-6">
      <div className="glass-card w-full max-w-sm p-6">
        <Suspense fallback={<p className="text-sm text-zinc-400">Loading invite…</p>}><Invite params={params} /></Suspense>
      </div>
    </main>
  );
}

async function Invite({ params }: { params: PageProps<"/invite/[token]">["params"] }) {
  const { token } = await params;
  const { db, user } = await requireUser();
  const info = await inviteInfo(db, token);

  if (!info) return <Message title="Invite not found" body="This link isn't valid. Ask your teammate to send a new invite." />;
  if (info.status === "expired") return <Message title="Invite expired" body={`This invite to ${info.workspace_name} has expired. Ask your teammate to create it again.`} />;
  if (info.status === "accepted") return <Message title="Already used" body={`This invite to ${info.workspace_name} was already accepted.`} link />;

  const sameEmail = user.email.toLowerCase() === info.email.toLowerCase();
  return (
    <>
      <h1 className="text-xl font-semibold">Join {info.workspace_name}</h1>
      <p className="mb-5 text-sm text-zinc-500">You’ve been invited to {info.workspace_name}’s Thunder workspace.</p>
      {sameEmail ? (
        <JoinForm token={token} agency={info.workspace_name} />
      ) : (
        <div className="space-y-3 text-sm">
          <p className="rounded-md bg-amber-50 px-3 py-2 text-amber-800">
            This invite is for <strong>{info.email}</strong>, but you’re signed in as <strong>{user.email}</strong>.
          </p>
          <form action="/auth/signout" method="post">
            <input type="hidden" name="next" value={`/invite/${token}`} />
            <button className="w-full rounded-md bg-zinc-900 px-3 py-2 font-medium text-white">Sign out and use {info.email}</button>
          </form>
        </div>
      )}
    </>
  );
}

function Message({ title, body, link }: { title: string; body: string; link?: boolean }) {
  return (
    <>
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="mt-2 text-sm text-zinc-600">{body}</p>
      {link && <Link href="/campaigns" className="mt-4 inline-block text-sm underline">Go to Thunder</Link>}
    </>
  );
}
