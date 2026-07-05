import type { Metadata } from "next";
import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";
import { Navbar } from "@/components/layout/navbar";
import {
  getPublicClubDirectory,
  normalizeDirectoryCategory,
  normalizeDirectorySearchQuery,
} from "@/lib/clubs/public-club-directory";

type DiscoverPageProps = {
  searchParams: Promise<{
    q?: string;
    category?: string;
  }>;
};

export const metadata: Metadata = {
  title: "Discover Clubs | Clubora",
  description: "Browse active clubs and open each club's public page before joining.",
  alternates: {
    canonical: "/discover",
  },
  openGraph: {
    title: "Discover Clubs | Clubora",
    description: "Browse active clubs and open each club's public page before joining.",
    type: "website",
    siteName: "Clubora",
  },
  twitter: {
    card: "summary",
    title: "Discover Clubs | Clubora",
    description: "Browse active clubs and open each club's public page before joining.",
  },
};

function buildDiscoverHref(query: string, category: string): string {
  const nextParams = new URLSearchParams();
  if (query) nextParams.set("q", query);
  if (category) nextParams.set("category", category);
  const serialized = nextParams.toString();
  return serialized ? `/discover?${serialized}` : "/discover";
}

function summarizeDescription(value: string): string {
  const text = value.replace(/\s+/g, " ").trim();
  if (!text) {
    return "No description yet.";
  }
  if (text.length <= 170) {
    return text;
  }
  return `${text.slice(0, 167).trimEnd()}...`;
}

export default async function DiscoverPage({ searchParams }: DiscoverPageProps) {
  noStore();
  const params = await searchParams;
  const rawQ = typeof params.q === "string" ? params.q : "";
  const rawCategory = typeof params.category === "string" ? params.category : "";
  const q = normalizeDirectorySearchQuery(rawQ);
  const category = normalizeDirectoryCategory(rawCategory);

  const { clubs, supportsCategory, categoryOptions } = await getPublicClubDirectory(q, category);
  let selectedCategory = "";
  if (supportsCategory && category) {
    const match = categoryOptions.find((option) => option.localeCompare(category, undefined, { sensitivity: "accent" }) === 0);
    if (match) {
      selectedCategory = match;
    }
  }
  const hasQuery = Boolean(q || selectedCategory);

  const canonicalHref = buildDiscoverHref(q, selectedCategory);
  if (buildDiscoverHref(rawQ, rawCategory) !== canonicalHref) {
    redirect(canonicalHref);
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <main id="main-content" className="page-shell space-y-5 sm:space-y-7">
        <section className="rounded-2xl border border-slate-200/90 bg-white px-4 py-5 shadow-sm sm:px-6 sm:py-7">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Club Directory</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Discover clubs</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-600 sm:text-base">
            Browse active clubs and open each public page to learn more before you join.
          </p>

          <form action="/discover" method="get" className="mt-4 flex flex-col gap-2.5 sm:mt-5 sm:flex-row" role="search">
            <label htmlFor="discover-search" className="sr-only">
              Search clubs by name or description
            </label>
            <input
              id="discover-search"
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Search by club name or description"
              aria-describedby="discover-search-hint"
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 shadow-sm outline-none ring-0 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 sm:text-base"
            />
            {supportsCategory && selectedCategory ? <input type="hidden" name="category" value={selectedCategory} /> : null}
            <button type="submit" className="btn-primary min-h-11 px-5 text-sm font-semibold sm:text-base">
              Search
            </button>
            {hasQuery ? (
              <Link
                href="/discover"
                className="btn-secondary inline-flex min-h-11 items-center justify-center px-5 text-sm font-semibold sm:text-base"
              >
                Clear
              </Link>
            ) : null}
          </form>
          <p id="discover-search-hint" className="mt-2 text-xs text-slate-500">
            Search is case-insensitive and matches club names and descriptions.
          </p>

          {supportsCategory && categoryOptions.length > 0 ? (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Category</span>
              <Link
                href={buildDiscoverHref(q, "")}
                className={`inline-flex min-h-9 items-center rounded-full border px-3 text-xs font-semibold ${
                  selectedCategory
                    ? "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    : "border-indigo-200 bg-indigo-50 text-indigo-700"
                }`}
              >
                All
              </Link>
              {categoryOptions.map((option) => {
                const href = buildDiscoverHref(q, option);
                const selected = option === selectedCategory;
                return (
                  <Link
                    key={option}
                    href={href}
                    className={`inline-flex min-h-9 items-center rounded-full border px-3 text-xs font-semibold ${
                      selected ? "border-indigo-200 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {option}
                  </Link>
                );
              })}
            </div>
          ) : null}
        </section>

        <section aria-live="polite" aria-label="Directory results">
          {clubs.length > 0 ? (
            <>
              <p className="mb-3 text-sm text-slate-600">
                Showing {clubs.length} active {clubs.length === 1 ? "club" : "clubs"}
                {q ? ` for "${q}"` : ""}
                {selectedCategory ? ` in ${selectedCategory}` : ""}.
              </p>
              <ul className="grid gap-3 sm:gap-4 lg:grid-cols-2">
                {clubs.map((club) => (
                  <li key={club.id} className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm sm:p-5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Club</p>
                    <div className="flex items-start justify-between gap-3">
                      <h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">{club.name}</h2>
                      {club.category ? (
                        <span className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                          {club.category}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-slate-600">{summarizeDescription(club.description)}</p>
                    <div className="mt-4">
                      <Link
                        href={`/club/${club.id}`}
                        className="btn-primary inline-flex min-h-11 w-full items-center justify-center px-4 text-sm font-semibold sm:min-h-10 sm:w-auto"
                      >
                        Open club page
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-5 py-8 text-center sm:px-6">
              <h2 className="text-lg font-semibold tracking-tight text-slate-900">No clubs found</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                {hasQuery
                  ? "Try a different keyword or clear filters. Club search matches names and descriptions."
                  : "No active clubs are available in the directory yet."}
              </p>
              {hasQuery ? (
                <p className="mt-4">
                  <Link href="/discover" className="btn-secondary inline-flex min-h-10 items-center px-4 text-sm font-semibold">
                    Clear search
                  </Link>
                </p>
              ) : null}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

