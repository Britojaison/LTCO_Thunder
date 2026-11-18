import { requireWorkspace } from "@/lib/auth";
import { switchWorkspace } from "./actions";

export async function WorkspaceSwitcher() {
  const { workspace, workspaces, user } = await requireWorkspace();
  return (
    <div className="space-y-2">
      {workspaces.length > 1 ? (
        <form action={switchWorkspace} className="flex gap-1">
          <select name="workspaceId" defaultValue={workspace.id}
            className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm">
            {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          <button className="rounded-md border border-zinc-300 px-2 text-sm">Go</button>
        </form>
      ) : (
        <p className="truncate text-sm font-medium">{workspace.name}</p>
      )}
      <form action="/auth/signout" method="post" className="flex items-center justify-between gap-2">
        <span className="truncate text-xs text-zinc-500">{user.email}</span>
        <button className="text-xs text-zinc-600 underline">Sign out</button>
      </form>
    </div>
  );
}
