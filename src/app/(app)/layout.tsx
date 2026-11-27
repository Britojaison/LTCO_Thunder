import { Suspense } from "react";
import { AppHeader, AppHeaderFallback } from "./app-header";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="bg-thunder-mesh min-h-screen overflow-x-hidden text-slate-900 supports-[overflow:clip]:overflow-x-clip">
      <Suspense fallback={<AppHeaderFallback />}>
        <AppHeader />
      </Suspense>
      <main className="app-main relative mx-auto w-full max-w-[1664px] px-4 pb-8 pt-4 md:px-8">
        {children}
      </main>
    </div>
  );
}
