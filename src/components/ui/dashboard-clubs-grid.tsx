import Link from "next/link";
import type { UserClub } from "@/lib/clubs/queries";
import { ClubCoverIcon } from "@/components/ui/club-cover-icon";
import {
  getClubAccentColor,
  getClubAccentIconColor,
  getClubCoverGradient,
  getClubInitials,
  inferClubCoverIcon,
} from "@/lib/clubs/club-visual";

type DashboardClubsGridProps = {
  clubs: UserClub[];
};

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
          const iconColor = getClubAccentIconColor(accent);
          const coverGradient = getClubCoverGradient(accent);
          const iconKind = inferClubCoverIcon(club.name);
          const isOfficer = club.role === "officer";

          return (
            <li key={club.id}>
              <Link
                href={`/clubs/${club.id}`}
                className="dashboard-club-card card-interactive block overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
              >
                <div
                  className="club-cover flex h-16 items-center justify-center"
                  style={{ background: coverGradient, color: iconColor }}
                >
                  <span className="club-cover__texture" aria-hidden />
                  <span className="relative z-10">
                    <ClubCoverIcon kind={iconKind} />
                  </span>
                  <span
                    className="absolute bottom-1.5 right-1.5 z-10 rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide"
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
