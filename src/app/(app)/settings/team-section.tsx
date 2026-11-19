"use client";

import { useActionState, useState, useTransition } from "react";
import { inviteAction, myNameAction, removeMemberAction, revokeInviteAction, type State } from "./actions";
import { Badge, btnPrimary, btnSecondary, Card, inputCls } from "@/components/ui";

type Member = { user_id: string; full_name: string | null; email: string; joined_at: string };
type Invite = { id: string; email: string; token: string; created_at: string; expires_at: string; expired: boolean };

function CopyLink({ link, email, agency }: { link: string; email: string; agency: string }) {
  const [copied, setCopied] = useState(false);
  const text = `You're invited to join ${agency} on Thunder. Sign in or create an account with ${email}, then open: ${link}`;
  return (
    <span className="flex flex-wrap items-center gap-2">
      <button type="button" className="text-xs font-medium text-blue-700 underline"
        onClick={async () => { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
        {copied ? "Copied" : "Copy link"}
      </button>
      <a href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer" className="text-xs font-medium text-emerald-700 underline">Send on WhatsApp</a>
      <a href={`mailto:${email}?subject=${encodeURIComponent(`Join ${agency} on Thunder`)}&body=${encodeURIComponent(text)}`} className="text-xs font-medium text-zinc-600 underline">Email</a>
    </span>
  );
}

export function TeamSection({ members, invites, me, siteUrl, agency }: { members: Member[]; invites: Invite[]; me: string; siteUrl: string; agency: string }) {
  const [inv, inviteFormAction, inviting] = useActionState<State, FormData>(inviteAction, {});
  const [nameState, nameAction, savingName] = useActionState<State, FormData>(myNameAction, {});
  const [busy, start] = useTransition();
  const [removeError, setRemoveError] = useState<string>();
  const [confirm, setConfirm] = useState<string>();
  const mine = members.find((m) => m.user_id === me);

  return (
    <Card title={`Team (${members.length})`}>
      <form action={nameAction} className="mb-4 flex flex-wrap items-end gap-2">
        <label className="block">
          <span className="text-xs font-medium text-zinc-600">Your name (shown on deals and contact logs)</span>
          <input name="full_name" defaultValue={mine?.full_name ?? ""} className={`${inputCls} mt-1 w-64`} />
        </label>
        <button disabled={savingName} className={btnSecondary}>Save</button>
        {nameState.ok && <span className="text-xs text-emerald-700">{nameState.ok}</span>}
        {nameState.error && <span className="text-xs text-red-600">{nameState.error}</span>}
      </form>

      <ul className="divide-y divide-zinc-100">
        {members.map((m) => (
          <li key={m.user_id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
            <span>
              <span className="font-medium">{m.full_name || m.email}</span>
              {m.user_id === me && <span className="ml-1"><Badge>You</Badge></span>}
              <span className="block text-xs text-zinc-500">{m.email} · joined {new Date(m.joined_at).toLocaleDateString("en-IN")}</span>
            </span>
            {m.user_id !== me && (confirm === m.user_id ? (
              <span className="flex items-center gap-2 text-xs">
                Remove {m.full_name || m.email}? They lose access immediately.
                <button disabled={busy} className="font-medium text-red-700"
                  onClick={() => start(async () => { const r = await removeMemberAction(m.user_id); setRemoveError(r.error); setConfirm(undefined); })}>Remove</button>
                <button className="text-zinc-500" onClick={() => setConfirm(undefined)}>Cancel</button>
              </span>
            ) : (
              <button onClick={() => setConfirm(m.user_id)} className="text-xs text-zinc-400 hover:text-red-600">Remove</button>
            ))}
          </li>
        ))}
      </ul>
      {removeError && <p className="mt-1 text-sm text-red-600">{removeError}</p>}

      <div className="mt-5 rounded-lg bg-zinc-50 p-3">
        <p className="mb-2 text-sm font-medium">Invite a teammate</p>
        <form action={inviteFormAction} className="flex flex-wrap gap-2">
          <input name="email" type="email" required placeholder="teammate@agency.com" className={`${inputCls} w-72`} />
          <button disabled={inviting} className={btnPrimary}>{inviting ? "Creating…" : "Create invite link"}</button>
        </form>
        {inv.error && <p className="mt-2 text-sm text-red-600">{inv.error}</p>}
        {inv.link && (
          <div className="mt-3 rounded-md border border-emerald-200 bg-white p-3 text-sm">
            <p className="text-emerald-800">{inv.ok}. Send them this link:</p>
            <code className="my-1 block break-all text-xs">{inv.link}</code>
            <CopyLink link={inv.link} email={inv.email ?? ""} agency={agency} />
          </div>
        )}
        <p className="mt-2 text-xs text-zinc-500">
          They sign in (or create an account) with that exact email, open the link, and join. Links last 14 days. Everyone in the team has full access.
        </p>
      </div>

      {invites.length > 0 && (
        <div className="mt-4">
          <p className="mb-1 text-xs font-medium text-zinc-600">Pending invites</p>
          <ul className="divide-y divide-zinc-100">
            {invites.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span>
                  {i.email} {i.expired ? <Badge tone="red">Expired</Badge> : <span className="text-xs text-zinc-400">expires {new Date(i.expires_at).toLocaleDateString("en-IN")}</span>}
                </span>
                <span className="flex items-center gap-3">
                  {!i.expired && <CopyLink link={`${siteUrl}/invite/${i.token}`} email={i.email} agency={agency} />}
                  <form action={revokeInviteAction}><input type="hidden" name="id" value={i.id} /><button className="text-xs text-zinc-400 hover:text-red-600">Revoke</button></form>
                </span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-zinc-400">To renew an expired invite, create it again for the same email.</p>
        </div>
      )}
    </Card>
  );
}
