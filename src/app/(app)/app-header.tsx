import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import brandLogo from "../../../public/brand-logo.jpg";
import { TopNavigation, TopNavigationFallback } from "./top-navigation";
import { SignOutControl } from "./sign-out-control";
import { WorkspaceSwitcher } from "./workspace-switcher";
import { GlassEntrance } from "./glass-entrance";

const frame = "mx-auto max-w-[1664px] px-4 py-3 md:px-8";
const surface = "rounded-[28px] border border-white/80 bg-white/70 shadow-[0_8px_32px_rgba(31,38,135,0.06)] backdrop-blur-xl lg:rounded-full";

export function AppHeaderFallback() {
  return (
    <div className={frame}>
      <div aria-hidden="true" className={`${surface} h-[152px] sm:h-[104px] lg:h-[62px]`} />
    </div>
  );
}

export function AppHeader() {
  return (
    <GlassEntrance className={`relative z-20 ${frame}`}>
      <header data-gsap-enter className={`${surface} flex flex-wrap items-center justify-between gap-2 px-3 py-2 lg:flex-nowrap lg:gap-3 lg:px-5 xl:px-6`}>
        <Link href="/influencers" className="flex shrink-0 items-center gap-2 rounded-full text-[#27223f]">
          <Image src={brandLogo} alt="" sizes="36px" className="h-9 w-9 shrink-0 object-contain mix-blend-multiply" />
          <span className="text-base font-bold tracking-tight">Thunder</span>
        </Link>
        <div className="order-3 min-w-0 basis-full lg:order-none lg:basis-auto">
          <Suspense fallback={<TopNavigationFallback />}><TopNavigation /></Suspense>
        </div>
        <form action="/influencers" method="get" role="search" className="relative order-2 ml-auto min-w-0 basis-full sm:order-none sm:min-w-24 sm:flex-1 lg:max-w-sm">
          <svg className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.5 4.5" />
          </svg>
          <input name="q" aria-label="Search influencers" placeholder="Search Anything..." className="h-10 w-full rounded-full border border-white/90 bg-white/65 pl-9 pr-3 text-sm outline-none shadow-inner placeholder:text-slate-500 focus:border-violet-300 focus:ring-2 focus:ring-violet-100" />
        </form>
        <div className="flex shrink-0 items-center gap-1.5 min-[380px]:gap-2">
          <button type="button" aria-label="Notifications" className="flex size-9 items-center justify-center rounded-full border border-white/90 bg-white/65 text-slate-600 transition hover:bg-white hover:text-[#4f46e5] motion-safe:hover:scale-105 sm:size-10">
            <svg className="h-4.5 w-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></svg>
          </button>
          <WorkspaceSwitcher />
          <SignOutControl variant="topbar" />
        </div>
      </header>
    </GlassEntrance>
  );
}
