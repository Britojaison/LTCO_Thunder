import { requireUser } from "@/lib/auth";

/** Shows which account is signed in, so a session left over from another app is obvious. */
export async function SignedInAs() {
  const { user } = await requireUser();
  return (
    <form action="/auth/signout" method="post"
      className="mb-4 flex items-center justify-between gap-2 rounded-md bg-zinc-100 px-3 py-2 text-xs text-zinc-600">
      <span className="truncate">Signed in as <strong className="text-zinc-900">{user.email}</strong></span>
      <button className="shrink-0 underline">Sign out</button>
    </form>
  );
}
