"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { APP_PRIMARY_NAV, APP_SECONDARY_NAV } from "@/components/layout/navigation-config";
import { NavIcon } from "@/components/layout/nav-icons";
import { isPathActive } from "@/lib/routing/nav-active";

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside className="app-icon-sidebar sticky top-0 hidden h-screen w-16 shrink-0 flex-col md:flex">
      <div className="flex h-full w-full flex-col items-center py-3">
        <nav className="flex w-full flex-1 flex-col items-center gap-1 px-1.5" aria-label="Main">
          {APP_PRIMARY_NAV.map((link) => {
            const active = isPathActive(pathname, link.href, link.match);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                title={link.label}
                className={`app-icon-sidebar-link${active ? " is-active" : ""}`}
              >
                <NavIcon name={link.icon} className="h-6 w-6" />
                <span className="app-icon-sidebar-label">{link.shortLabel}</span>
              </Link>
            );
          })}
        </nav>

        <nav className="mt-auto flex w-full flex-col items-center gap-1 px-1.5 pb-1" aria-label="Account">
          {APP_SECONDARY_NAV.map((link) => {
            const active = isPathActive(pathname, link.href, link.match);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                title={link.label}
                className={`app-icon-sidebar-link${active ? " is-active" : ""}`}
              >
                <NavIcon name={link.icon} className="h-6 w-6" />
                <span className="app-icon-sidebar-label">{link.shortLabel}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
