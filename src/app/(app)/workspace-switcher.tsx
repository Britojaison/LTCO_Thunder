import { requireWorkspace } from "@/lib/auth";
import { switchWorkspace } from "./actions";

export async function WorkspaceSwitcher() {
  const { workspace, workspaces, user } = await requireWorkspace();
  const initials = user.email.split("@")[0].split(/[._+-]/).filter(Boolean).slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase()).join("") || "U";

  return (
    <details className="relative">
      <summary aria-label="Profile and workspace" title={user.email} className="flex h-9 cursor-pointer list-none items-center gap-2 rounded-full border border-slate-200/70 bg-white/75 p-0.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] transition hover:bg-white/95 focus-visible:ring-2 focus-visible:ring-orange-400 sm:pr-3 [&::-webkit-details-marker]:hidden">
        <span aria-hidden="true" className="grid size-7 place-items-center rounded-full bg-orange-50 text-xs font-bold text-[#ff5a1f]">{initials}</span>
        <span className="hidden max-w-28 truncate text-xs font-semibold text-slate-700 sm:block xl:max-w-44">{user.email}</span>
      </summary>
      <div className="glass-card absolute right-0 top-full z-10 mt-3 w-60 space-y-3 bg-white/95 p-4">
        <div>
          <p className="text-sm font-semibold text-slate-900">{workspace.name}</p>
          <p className="break-all text-xs text-slate-600">{user.email}</p>
        </div>
        {workspaces.length > 1 && (
          <form action={switchWorkspace} className="flex items-center gap-2">
            <select name="workspaceId" defaultValue={workspace.id} aria-label="Workspace" className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white/80 px-2 py-1.5 text-xs text-slate-900">
              {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
            <button className="rounded-full bg-[#4f46e5] px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700">Go</button>
          </form>
        )}
      </div>
    </details>
  );
}
