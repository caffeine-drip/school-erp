"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = { href: string; label: string; section: string };

export function Nav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const sections = [...new Set(items.map((i) => i.section))];
  return (
    <nav className="flex gap-1 overflow-x-auto lg:flex-col lg:gap-4">
      {sections.map((section) => (
        <div key={section} className="flex gap-1 lg:flex-col">
          <div className="hidden px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400 lg:block">{section}</div>
          {items
            .filter((i) => i.section === section)
            .map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium ${
                    active ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
        </div>
      ))}
    </nav>
  );
}
