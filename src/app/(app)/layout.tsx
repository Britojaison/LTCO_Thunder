import { Suspense } from "react";
import { Nav, NavFallback } from "./nav";
import { WorkspaceSwitcher } from "./workspace-switcher";
import { AppHeader, AppHeaderFallback } from "./app-header";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex flex-1 flex-col md:flex-row">
      <aside className="group/sidebar relative z-20 border-b border-zinc-200 bg-white p-3 md:fixed md:inset-y-0 md:left-0 md:flex md:h-dvh md:w-14 md:flex-col md:items-center md:overflow-hidden md:border-b-0 md:border-r md:px-2 md:py-3 md:transition-[width,box-shadow] md:duration-200 md:hover:w-60 md:hover:items-start md:hover:shadow-xl">
        <div className="mb-3 flex items-center justify-between md:mb-0 md:block md:w-full">
          <div className="relative mb-0 flex h-9 items-center md:mb-8 md:w-full md:justify-center md:transition-[margin] md:duration-200 md:group-hover/sidebar:mb-0">
            <img src="/brand-logo.jpg" alt="88GB" className="hidden h-9 w-12 object-contain md:block md:h-8 md:w-10 md:transition-opacity md:duration-200 md:group-hover/sidebar:opacity-0" />
            <p className="text-lg font-semibold md:absolute md:left-0 md:opacity-0 md:transition-opacity md:duration-200 md:group-hover/sidebar:opacity-100">Thunder</p>
          </div>
          <div className="md:mb-0 md:max-h-0 md:overflow-hidden md:opacity-0 md:transition-[max-height,margin,opacity] md:duration-200 md:group-hover/sidebar:mb-6 md:group-hover/sidebar:max-h-40 md:group-hover/sidebar:opacity-100">
            <Suspense fallback={<p className="text-sm text-zinc-400">Loading…</p>}>
              <WorkspaceSwitcher />
            </Suspense>
          </div>
        </div>
        <Suspense fallback={<NavFallback />}>
          <Nav />
        </Suspense>
      </aside>
      <main className="app-main min-w-0 flex-1 p-4 md:ml-14 md:p-8">
        <Suspense fallback={<AppHeaderFallback />}>
          <AppHeader />
        </Suspense>
        <div className="mt-7">{children}</div>
      </main>
    </div>
  );
}
