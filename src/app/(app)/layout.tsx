import { Suspense } from "react";
import { Nav } from "./nav";
import { WorkspaceSwitcher } from "./workspace-switcher";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex flex-1 flex-col md:flex-row">
      <aside className="border-b border-zinc-200 bg-white p-3 md:w-56 md:border-b-0 md:border-r md:p-4">
        <div className="mb-3 flex items-center justify-between md:mb-6 md:block">
          <p className="text-lg font-semibold">Thunder</p>
          <div className="md:mt-3">
            <Suspense fallback={<p className="text-sm text-zinc-400">Loading…</p>}>
              <WorkspaceSwitcher />
            </Suspense>
          </div>
        </div>
        <Nav />
      </aside>
      <main className="flex-1 p-4 md:p-8">{children}</main>
    </div>
  );
}
