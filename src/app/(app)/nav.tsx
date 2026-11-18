"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/influencers", label: "Influencers" },
  { href: "/campaigns", label: "Campaigns" },
  { href: "/brands", label: "Brands" },
  { href: "/reports", label: "Reports" },
  { href: "/import", label: "Import" },
  { href: "/settings", label: "Settings" },
];

export function Nav() {
  const path = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto md:flex-col">
      {ITEMS.map((item) => {
        const active = path === item.href || path.startsWith(item.href + "/");
        return (
          <Link key={item.href} href={item.href}
            className={`whitespace-nowrap rounded-md px-3 py-2 text-sm ${
              active ? "bg-zinc-900 text-white" : "text-zinc-700 hover:bg-zinc-200"
            }`}>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
