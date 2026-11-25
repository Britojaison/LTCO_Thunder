"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const ITEMS = [
  { href: "/influencers", label: "Influencers", icon: "influencers" },
  { href: "/campaigns", label: "Campaigns", icon: "campaigns" },
  { href: "/brands", label: "Brands", icon: "brands" },
  { href: "/reports", label: "Reports", icon: "reports" },
  { href: "/import", label: "Import", icon: "import" },
  { href: "/settings", label: "Settings", icon: "settings" },
] as const;

function NavIcon({ name }: { name: (typeof ITEMS)[number]["icon"] }) {
  const shared = {
    className: "h-5 w-5 shrink-0",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    viewBox: "0 0 24 24",
    "aria-hidden": true as const,
  };

  switch (name) {
    case "influencers":
      return <svg {...shared}><circle cx="12" cy="8" r="3.25" /><path d="M5.5 20v-1.2a6.5 6.5 0 0 1 13 0V20z" /></svg>;
    case "campaigns":
      return <svg {...shared}><path d="m3 11 18-8-6.5 18-3.2-7.3L3 11Z" /><path d="m11.3 13.7 4.2-4.2" /></svg>;
    case "brands":
      return <svg {...shared}><path d="M3 21V8l7-4v17M10 21V3h11v18M1.5 21h21" /><path d="M6 9h.01M6 12h.01M6 15h.01M14 7h.01M17 7h.01M14 11h.01M17 11h.01M14 15h.01M17 15h.01" /></svg>;
    case "reports":
      return <svg {...shared}><path d="M4 4v16h17" /><path d="M8 16v-4M13 16V8M18 16v-7" /></svg>;
    case "import":
      return <svg {...shared}><path d="M12 14V3m0 0L8 7m4-4 4 4" /><path d="M4 14v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" /></svg>;
    case "settings":
      return <svg {...shared}><path d="M5 4v16M12 4v16M19 4v16" /><circle cx="5" cy="9" r="2" fill="currentColor" stroke="none" /><circle cx="12" cy="15" r="2" fill="currentColor" stroke="none" /><circle cx="19" cy="7" r="2" fill="currentColor" stroke="none" /></svg>;
  }
}

function SignOut() {
  return (
    <form action="/auth/signout" method="post" className="mt-2 w-full border-t border-[#f4dfd0] pt-2">
      <button type="submit" title="Sign out" className="flex h-10 w-10 items-center justify-start gap-0 overflow-hidden whitespace-nowrap rounded-xl p-0 text-sm text-slate-600 transition-colors hover:bg-[#ffe7d5] hover:text-[#111827] md:w-full">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center"><svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M10 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5" /><path d="M14 16l4-4-4-4M18 12H9" />
        </svg></span>
        <span className="block max-w-0 shrink-0 -translate-x-1.5 overflow-hidden whitespace-nowrap opacity-0 transition-[max-width,opacity,transform] duration-200 md:group-hover/sidebar:max-w-32 md:group-hover/sidebar:translate-x-0 md:group-hover/sidebar:opacity-100">Sign out</span>
      </button>
    </form>
  );
}

function NavItems({ path }: { path?: string }) {
  return (
    <div className="flex flex-wrap gap-1 md:w-full md:flex-col md:flex-nowrap md:gap-1 md:pt-3">
      {ITEMS.map((item) => {
        const active = path !== undefined && (path === item.href || path.startsWith(item.href + "/"));
        return (
          <Link key={item.href} href={item.href} title={item.label}
            aria-current={active ? "page" : undefined}
            className={`flex h-10 w-10 shrink-0 items-center justify-start overflow-hidden whitespace-nowrap rounded-xl p-0 text-sm transition-colors md:w-full ${
              active
                ? "bg-[#f97316] text-white shadow-[0_4px_12px_rgba(249,115,22,0.24)]"
                : "text-slate-600 hover:bg-[#ffe7d5]"
            }`}>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center md:w-16"><NavIcon name={item.icon} /></span>
            <span className="block max-w-0 shrink-0 -translate-x-1.5 overflow-hidden whitespace-nowrap opacity-0 transition-[max-width,opacity,transform] duration-200 md:group-hover/sidebar:max-w-40 md:group-hover/sidebar:translate-x-0 md:group-hover/sidebar:opacity-100">{item.label}</span>
          </Link>
        );
      })}
      <SignOut />
    </div>
  );
}

/** Links shown while the current path streams in. */
export function NavFallback({ footer }: { footer?: ReactNode }) {
  return (
    <nav aria-label="Main navigation" className="flex min-w-0 flex-col md:min-h-0 md:w-full md:flex-1">
      <NavItems />
      <div className="mt-auto w-full shrink-0">
        {footer}
      </div>
    </nav>
  );
}

export function Nav({ footer }: { footer?: ReactNode }) {
  const path = usePathname();
  return (
    <nav aria-label="Main navigation" className="flex min-w-0 flex-col md:min-h-0 md:w-full md:flex-1">
      <NavItems path={path} />
      <div className="mt-auto w-full shrink-0">
        {footer}
      </div>
    </nav>
  );
}
