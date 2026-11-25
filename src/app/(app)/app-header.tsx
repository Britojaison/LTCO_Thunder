import { requireWorkspace } from "@/lib/auth";

export function AppHeaderFallback() {
  return (
    <header aria-hidden="true" className="flex items-center justify-between gap-4 border-b border-[#eceef2] pb-4">
      <div className="h-10 w-full max-w-xl rounded-full border border-[#eceef2] bg-white" />
      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <div className="hidden h-9 w-9 rounded-full border border-[#eceef2] bg-white sm:block" />
        <div className="h-9 w-9 rounded-full border border-[#eceef2] bg-white" />
        <div className="h-10 w-10 rounded-full border border-[#eceef2] bg-white sm:w-40" />
      </div>
    </header>
  );
}

export async function AppHeader() {
  const { user } = await requireWorkspace();
  const email = user.email ?? "";
  const initials = email.split("@")[0].split(/[._-]/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "U";

  return (
    <header className="flex items-center justify-between gap-4 border-b border-[#eceef2] pb-4">
      <form action="/influencers" method="get" role="search" className="relative w-full max-w-xl">
        <svg className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.5 4.5" />
        </svg>
        <input name="q" aria-label="Search influencers" placeholder="Search Anything..." className="w-full rounded-full border border-[#eceef2] bg-white py-2.5 pl-11 pr-4 text-sm outline-none shadow-[0_2px_8px_rgba(24,25,28,0.025)] placeholder:text-zinc-400 focus:border-orange-300 focus:ring-2 focus:ring-orange-100" />
      </form>

      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <span title="Help" aria-label="Help" className="hidden h-9 w-9 items-center justify-center rounded-full border border-[#e5e7eb] bg-white text-slate-500 sm:flex">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M9.6 9a2.5 2.5 0 1 1 4.4 1.6c-1.2 1.1-2 1.4-2 3M12 17.5h.01" /></svg>
        </span>
        <span title="Notifications" aria-label="Notifications" className="relative flex h-9 w-9 items-center justify-center rounded-full border border-[#e5e7eb] bg-white text-slate-500">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>
        </span>
        <div className="flex items-center gap-2 rounded-full border border-[#eceef2] bg-white py-1 pl-1 pr-3 shadow-[0_2px_8px_rgba(24,25,28,0.025)]">
          <span className="flex h-8 w-8 items-center justify-center rounded-full border border-[#e5e7eb] bg-white text-xs font-semibold text-[#111827]">{initials}</span>
          <span className="hidden max-w-40 truncate text-xs font-medium text-zinc-700 sm:block">{email}</span>
        </div>
      </div>
    </header>
  );
}
