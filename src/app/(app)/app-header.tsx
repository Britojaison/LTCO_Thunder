import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import brandLogo from "../../../public/brand-logo.jpg";
import { TopNavigation, TopNavigationFallback } from "./top-navigation";
import { SignOutControl } from "./sign-out-control";
import { WorkspaceSwitcher } from "./workspace-switcher";
import { GlassEntrance } from "./glass-entrance";

const surface = "relative flex h-14 items-center justify-between rounded-full border border-white bg-white/85 px-4 shadow-[0_8px_24px_rgba(15,23,42,0.06),inset_0_1px_1px_rgba(255,255,255,0.95)] backdrop-blur-xl";

export function AppHeaderFallback() {
  return <div aria-hidden="true" className={surface} />;
}

export function AppHeader() {
  return (
    <GlassEntrance>
      <header data-gsap-enter className={`${surface} gap-2`}>
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-full">
          <div className="absolute inset-0 bg-gradient-to-b from-white/70 via-white/10 to-transparent" />
        </div>
        <Link href="/influencers" className="relative z-10 flex shrink-0 items-center gap-2 rounded-full text-[#27223f]">
          <Image src={brandLogo} alt="" sizes="32px" className="h-8 w-8 shrink-0 object-contain mix-blend-multiply" />
          <span className="hidden text-lg font-bold tracking-tight xl:inline">Thunder</span>
        </Link>
        <div className="relative z-10 min-w-0 overflow-x-auto">
          <Suspense fallback={<TopNavigationFallback />}><TopNavigation /></Suspense>
        </div>
        <form action="/influencers" method="get" role="search" className="relative z-10 ml-auto hidden min-w-24 flex-1 md:block lg:max-w-sm">
          <svg className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.5 4.5" />
          </svg>
          <input name="q" aria-label="Search influencers" placeholder="Search Anything..." className="h-9 w-full rounded-full border border-slate-200/70 bg-white/75 pl-9 pr-3 text-sm text-slate-900 outline-none shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] placeholder:text-slate-500 focus:border-orange-300 focus:ring-2 focus:ring-orange-100" />
        </form>
        <div className="relative z-10 flex shrink-0 items-center gap-1.5 min-[380px]:gap-2">
          <button type="button" aria-label="Notifications" className="flex size-9 items-center justify-center rounded-full border border-slate-200/70 bg-white/75 text-slate-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] transition hover:bg-white hover:text-[#ff5a1f] motion-safe:hover:scale-105">
            <svg className="h-4.5 w-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></svg>
          </button>
          <WorkspaceSwitcher />
          <SignOutControl variant="topbar" />
        </div>
      </header>
    </GlassEntrance>
  );
}
