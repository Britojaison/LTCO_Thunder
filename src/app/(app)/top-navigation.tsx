"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  ["/influencers", "Influencers"],
  ["/campaigns", "Campaigns"],
  ["/brands", "Brands"],
  ["/reports", "Reports"],
  ["/settings", "Settings"],
] as const;

export function TopNavigation() {
  return <NavigationLinks pathname={usePathname()} />;
}

export function TopNavigationFallback() {
  return <NavigationLinks />;
}

function NavigationLinks({ pathname }: { pathname?: string }) {
  return (
    <nav aria-label="Main navigation" className="flex min-h-9 min-w-0 items-center gap-1.5 rounded-full">
      {links.map(([href, label]) => {
        const active = pathname === href || pathname?.startsWith(`${href}/`);
        return (
          <Link key={href} href={href} aria-current={active ? "page" : undefined}
            className={`inline-flex h-9 shrink-0 items-center rounded-full px-4 py-1.5 text-[15px] font-medium transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#ff5a1f] ${active
              ? "bg-[#ff5a1f] text-white shadow-sm"
              : "text-slate-600 hover:bg-slate-100/70 hover:text-slate-900"
            }`}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
