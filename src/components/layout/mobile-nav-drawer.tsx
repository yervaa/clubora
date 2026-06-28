"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CluboraLogo } from "@/components/brand/clubora-logo";
import { APP_PRIMARY_NAV, APP_SECONDARY_NAV } from "@/components/layout/navigation-config";
import type { UserClub } from "@/lib/clubs/queries";
import { isPathActive } from "@/lib/routing/nav-active";

type MobileNavDrawerProps = {
  clubs: UserClub[];
};

/**
 * Drawer is portaled to document.body so position:fixed is viewport-relative.
 * Rendering inside the sticky header (with backdrop-filter) traps fixed descendants
 * in the header's containing block and collapses top-16…bottom layout (~0 height).
 */
export function MobileNavDrawer({ clubs }: MobileNavDrawerProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    const id = requestAnimationFrame(() => setOpen(false));
    return () => cancelAnimationFrame(id);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const drawer = open ? (
    <div
      className="fixed inset-x-0 bottom-0 top-16 z-[100] lg:hidden"
      role="dialog"
      aria-modal="true"
      aria-label="Navigation menu"
    >
      {/* Backdrop: below panel, receives taps outside drawer */}
      <button
        type="button"
        className="absolute inset-0 z-0 bg-slate-900/50 backdrop-blur-[2px]"
        aria-label="Close menu"
        onClick={() => setOpen(false)}
      />

      {/* Panel: explicit z-index so it always sits above backdrop */}
      <nav
        id="mobile-app-nav-drawer"
        className="absolute left-0 top-0 z-10 flex h-full w-[min(20rem,min(92vw,100%))] max-w-[100vw] flex-col border-r border-slate-200 bg-white shadow-2xl"
      >
        <div className="flex h-14 flex-shrink-0 items-center justify-between border-b border-slate-200 bg-slate-50/90 px-4">
          <Link href="/dashboard" onClick={() => setOpen(false)} aria-label="Clubora home">
            <CluboraLogo variant="full" theme="dark" height={28} />
          </Link>
          <button
            type="button"
            className="flex h-11 min-w-11 items-center justify-center rounded-xl text-slate-600 transition hover:bg-slate-200/80"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-y-contain px-3 py-4 [-webkit-overflow-scrolling:touch]">
          <p className="px-3 pb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">Navigate</p>
          <ul className="space-y-1" role="list">
            {APP_PRIMARY_NAV.map((link) => {
              const active = isPathActive(pathname, link.href, link.match);
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    onClick={() => setOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={`block min-h-12 touch-manipulation rounded-xl px-3 py-3 text-sm font-semibold leading-snug transition ${
                      active ? "bg-slate-900 text-white" : "text-slate-800 hover:bg-slate-100 active:bg-slate-200"
                    }`}
                  >
                    {link.label}
                  </Link>
                </li>
              );
            })}
          </ul>

          <p className="mt-5 px-3 pb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">More</p>
          <ul className="space-y-1" role="list">
            {APP_SECONDARY_NAV.map((link) => {
              const active = isPathActive(pathname, link.href, link.match);
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    onClick={() => setOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={`block min-h-11 touch-manipulation rounded-xl px-3 py-2.5 text-sm leading-snug transition ${
                      active
                        ? "bg-slate-100 font-medium text-slate-900"
                        : "text-slate-500 hover:bg-slate-50 active:bg-slate-100"
                    }`}
                  >
                    {link.label}
                  </Link>
                </li>
              );
            })}
          </ul>

          {clubs.length > 0 ? (
            <>
              <p className="mt-6 px-3 pb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">
                Your clubs
              </p>
              <ul className="space-y-1" role="list">
                {clubs.map((club) => {
                  const base = `/clubs/${club.id}`;
                  const active = pathname === base || pathname.startsWith(`${base}/`);
                  return (
                    <li key={club.id}>
                      <Link
                        href={base}
                        onClick={() => setOpen(false)}
                        className={`flex min-h-12 touch-manipulation items-center gap-2 rounded-xl px-3 py-3 text-sm font-semibold transition ${
                          active ? "bg-slate-900 text-white" : "text-slate-800 hover:bg-slate-100 active:bg-slate-200"
                        }`}
                      >
                        <span className="min-w-0 flex-1 truncate">{club.name}</span>
                        {club.role === "officer" ? (
                          <span
                            className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                              active ? "bg-white/20 text-white" : "bg-slate-200 text-slate-600"
                            }`}
                          >
                            Officer
                          </span>
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : null}
        </div>
      </nav>
    </div>
  ) : null;

  return (
    <>
      <button
        type="button"
        className="inline-flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 lg:hidden"
        aria-expanded={open}
        aria-controls="mobile-app-nav-drawer"
        aria-haspopup="dialog"
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? (
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        )}
      </button>

      {typeof document !== "undefined" && drawer ? createPortal(drawer, document.body) : null}
    </>
  );
}
