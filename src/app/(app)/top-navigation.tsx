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
    <nav aria-label="Main navigation" className="flex min-w-0 items-center gap-1 overflow-x-auto rounded-full p-1">
      {links.map(([href, label]) => {
        const active = pathname === href || pathname?.startsWith(`${href}/`);
        return (
          <Link key={href} href={href} aria-current={active ? "page" : undefined}
            className={`shrink-0 rounded-full px-3 py-2 text-xs font-semibold transition duration-200 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-indigo-600 motion-safe:hover:-translate-y-px xl:px-4 ${active
              ? "bg-gradient-to-r from-[#6c5ce7] to-[#4f46e5] text-white shadow-[0_8px_18px_rgba(79,70,229,0.24)]"
              : "text-slate-600 hover:bg-white/80 hover:text-[#4f46e5] hover:shadow-sm"
            }`}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
