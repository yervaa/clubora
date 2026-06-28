import Link from "next/link";
import { CluboraLogo } from "@/components/brand/clubora-logo";

/** Sticky wordmark across the main column (all breakpoints). */
export function AppBrandHeader() {
  return (
    <header className="app-brand-header sticky top-0 z-40 flex min-h-14 shrink-0 items-center border-b border-slate-200/90 bg-white/95 px-4 py-2 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-white/90 md:min-h-[3.75rem] md:px-6">
      <Link href="/dashboard" className="flex items-center py-0.5" aria-label="Clubora home">
        <CluboraLogo variant="full" theme="dark" height={32} />
      </Link>
    </header>
  );
}
