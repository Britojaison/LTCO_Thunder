import { requireWorkspace } from "@/lib/auth";
import { switchWorkspace } from "./actions";

export async function WorkspaceSwitcher() {
  const { workspace, workspaces, user } = await requireWorkspace();
  return (
    <div className="space-y-2">
      {workspaces.length > 1 ? (
        <form action={switchWorkspace} className="flex gap-1">
          <select name="workspaceId" defaultValue={workspace.id}
            className="min-w-0 flex-1 rounded-xl border border-[#eceef2] bg-white px-3 py-2 text-sm">
            {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          <button className="rounded-xl bg-[#ff5a1f] px-3 py-2 text-sm font-medium text-white hover:bg-[#ef4d19]">Go</button>
        </form>
      ) : (
        <p className="truncate text-sm font-medium">{workspace.name}</p>
      )}
      <p className="truncate text-xs text-zinc-500">{user.email}</p>
    </div>
  );
}
