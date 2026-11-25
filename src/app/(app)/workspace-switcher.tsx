import { requireWorkspace } from "@/lib/auth";
import { switchWorkspace } from "./actions";

export async function WorkspaceSwitcher() {
  const { workspace, workspaces, user } = await requireWorkspace();
  const initial = workspace.name.trim().charAt(0).toUpperCase() || "W";
  return (
    <div className="border-t border-[#f4dfd0] py-2">
      <div className="flex h-14 w-full items-center">
        <div className="flex h-14 w-16 shrink-0 items-center justify-center">
          <span title={`${workspace.name} | ${user.email ?? ""}`} className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#111827] text-xs font-semibold text-white">{initial}</span>
        </div>
        <div className="min-w-0 flex-1 overflow-hidden whitespace-nowrap md:max-w-0 md:flex-none md:opacity-0 md:-translate-x-1.5 md:transition-[max-width,opacity,transform] md:duration-200 md:group-hover/sidebar:max-w-40 md:group-hover/sidebar:flex-1 md:group-hover/sidebar:translate-x-0 md:group-hover/sidebar:opacity-100">
          {workspaces.length > 1 ? (
            <form action={switchWorkspace} className="flex min-w-0 items-center gap-1">
              <select name="workspaceId" defaultValue={workspace.id}
                aria-label="Workspace"
                className="min-w-0 flex-1 rounded-lg border border-[#e5e7eb] bg-white px-2 py-1.5 text-xs text-[#111827]">
                {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
              <button className="rounded-lg bg-[#f97316] px-2 py-1.5 text-xs font-semibold text-white hover:bg-orange-600">Go</button>
            </form>
          ) : (
            <p className="truncate text-xs font-semibold text-[#111827]">{workspace.name}</p>
          )}
          <p className="mt-1 truncate text-[11px] leading-4 text-slate-500">{user.email}</p>
        </div>
      </div>
    </div>
  );
}
