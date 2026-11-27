import { Suspense } from "react";
import { AppHeader, AppHeaderFallback } from "./app-header";

const contentWidth = "mx-auto w-full max-w-[1664px] px-4 md:px-8";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="relative min-h-screen bg-[#f8fafc] text-slate-900 antialiased">
      <div className={`sticky top-3 z-50 ${contentWidth}`}>
        <Suspense fallback={<AppHeaderFallback />}>
          <AppHeader />
        </Suspense>
      </div>
      <main className={`app-main relative bg-transparent pb-8 pt-6 ${contentWidth}`}>
        {children}
      </main>
    </div>
  );
}
