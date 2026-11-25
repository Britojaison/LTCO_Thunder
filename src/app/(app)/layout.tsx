import { Suspense } from "react";
import { Nav, NavFallback } from "./nav";
import { WorkspaceSwitcher } from "./workspace-switcher";
import { AppHeader, AppHeaderFallback } from "./app-header";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex flex-1 flex-col overflow-x-clip md:flex-row">
      <aside className="peer/sidebar group/sidebar relative z-20 border-b border-[#f4dfd0] bg-[#fff4eb] p-3 md:fixed md:inset-y-0 md:left-0 md:flex md:h-dvh md:w-16 md:flex-col md:items-start md:overflow-visible md:border-b-0 md:border-r md:p-0 md:transition-[width] md:duration-[250ms] md:ease-[cubic-bezier(0.16,1,0.3,1)] md:hover:w-60 md:hover:shadow-xl">
        <div className="relative flex w-full shrink-0 flex-col items-start gap-3 pb-3 md:h-14 md:flex-row md:items-center md:gap-0 md:pb-0">
          <div className="flex h-12 w-16 shrink-0 items-center justify-center md:h-14">
            <img src="/brand-logo.jpg" alt="88GB" className="hidden h-8 w-10 object-contain mix-blend-multiply md:block" />
            <p className="text-lg font-semibold md:hidden">Thunder</p>
          </div>
          <p className="pointer-events-none absolute left-16 whitespace-nowrap text-lg font-semibold text-[#111827] opacity-0 transition-[opacity,transform] duration-200 -translate-x-1.5 group-hover/sidebar:translate-x-0 group-hover/sidebar:opacity-100">Thunder</p>
        </div>
        <Suspense fallback={<NavFallback />}>
          <Nav footer={<WorkspaceSwitcher />} />
        </Suspense>
      </aside>
      <main className="app-main min-w-0 flex-1 overflow-x-clip p-4 transition-[margin-left] duration-[250ms] ease-[cubic-bezier(0.16,1,0.3,1)] md:ml-16 md:p-8 md:peer-hover/sidebar:ml-60">
        <Suspense fallback={<AppHeaderFallback />}>
          <AppHeader />
        </Suspense>
        <div className="mt-7">{children}</div>
      </main>
    </div>
  );
}
