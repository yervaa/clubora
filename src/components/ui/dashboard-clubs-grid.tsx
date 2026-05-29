import Link from "next/link";
import type { UserClub } from "@/lib/clubs/queries";
import {
  clubAccentTextColor,
  getClubAccentColor,
  getClubInitials,
  inferClubCoverIcon,
  type ClubCoverIconKind,
} from "@/lib/clubs/club-visual";

type DashboardClubsGridProps = {
  clubs: UserClub[];
};

function CoverIcon({ kind }: { kind: ClubCoverIconKind }) {
  const common = {
    width: 28,
    height: 28,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  switch (kind) {
    case "award":
      return (
        <svg {...common}>
          <path d="M8 21l4 -7l4 7" />
          <path d="M12 3a4 4 0 0 1 4 4v2a4 4 0 0 1 -8 0v-2a4 4 0 0 1 4 -4z" />
        </svg>
      );
    case "camera":
      return (
        <svg {...common}>
          <path d="M5 7h1a2 2 0 0 0 2 -2a1 1 0 0 1 1 -1h6a1 1 0 0 1 1 1a2 2 0 0 0 2 2h1a2 2 0 0 1 2 2v9a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-9a2 2 0 0 1 2 -2" />
          <path d="M12 13a3 3 0 1 0 0 -6a3 3 0 0 0 0 6z" />
        </svg>
      );
    case "trending":
      return (
        <svg {...common}>
          <path d="M3 17l6 -6l4 4l8 -8" />
          <path d="M14 7l7 0l0 7" />
        </svg>
      );
    case "star":
      return (
        <svg {...common}>
          <path d="M12 17.75l-6.172 3.245l1.179 -6.873l-5 -4.867l6.9 -1l3.093 -6.26l3.093 6.26l6.9 1l-5 4.867l1.179 6.873z" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <path d="M9 7m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0" />
          <path d="M3 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          <path d="M21 21v-2a4 4 0 0 0 -3 -3.85" />
        </svg>
      );
  }
}

export function DashboardClubsGrid({ clubs }: DashboardClubsGridProps) {
  if (clubs.length === 0) return null;

  return (
    <section aria-labelledby="dash-your-clubs-heading" className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="dash-your-clubs-heading" className="text-base font-semibold tracking-tight text-slate-900 sm:text-lg">
            Your clubs
          </h2>
          <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">Jump into a workspace</p>
        </div>
        <Link href="/clubs/join" className="text-sm font-medium text-slate-600 hover:text-slate-900">
          Join another →
        </Link>
      </div>

      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4" role="list">
        {clubs.map((club) => {
          const accent = getClubAccentColor(club.name);
          const coverFg = clubAccentTextColor(accent);
          const iconKind = inferClubCoverIcon(club.name);
          const isOfficer = club.role === "officer";

          return (
            <li key={club.id}>
              <Link
                href={`/clubs/${club.id}`}
                className="dashboard-club-card card-interactive block overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
              >
                <div
                  className="relative flex h-16 items-center justify-center"
                  style={{ backgroundColor: accent, color: coverFg }}
                >
                  <CoverIcon kind={iconKind} />
                  <span
                    className="absolute bottom-1.5 right-1.5 rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide"
                    style={{
                      backgroundColor: isOfficer ? "rgb(15 23 42 / 0.85)" : "rgb(255 255 255 / 0.9)",
                      color: isOfficer ? "#fff" : "#334155",
                    }}
                  >
                    {isOfficer ? "Officer" : "Member"}
                  </span>
                </div>
                <div className="px-2.5 py-2">
                  <p className="truncate text-[13px] font-medium text-slate-900" title={club.name}>
                    {club.name}
                  </p>
                  <p className="sr-only">{getClubInitials(club.name)}</p>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
