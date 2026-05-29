"use client";

/**
 * My Clubs photo grid — separate from `dashboard-clubs-grid.tsx` because:
 * - Taller cover (80px vs 64px), join code row for officers, and a full-width Open workspace CTA
 * - 3-col desktop grid plus a dashed “Join or start” tile (dashboard uses 4 cols, link-only cards)
 */

import Link from "next/link";
import { useCallback, useState } from "react";
import type { UserClub } from "@/lib/clubs/queries";
import {
  getClubAccentColor,
  getClubAccentIconColor,
  getClubRoleBadgeColors,
  inferClubCoverIcon,
  type ClubCoverIconKind,
} from "@/lib/clubs/club-visual";

type MyClubsGridProps = {
  clubs: UserClub[];
};

function stopNav(e: React.MouseEvent | React.KeyboardEvent) {
  e.preventDefault();
  e.stopPropagation();
}

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

function MyClubJoinCode({ joinCode }: { joinCode: string }) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(
    async (e: React.MouseEvent) => {
      stopNav(e);
      try {
        await navigator.clipboard.writeText(joinCode);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      } catch {
        /* ignore */
      }
    },
    [joinCode],
  );

  return (
    <div
      className="mt-1.5 flex min-w-0 items-center gap-1.5"
      onClick={stopNav}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") stopNav(e);
      }}
    >
      <span className="min-w-0 truncate font-mono text-[11px] text-slate-500" title={joinCode}>
        {joinCode}
      </span>
      <button
        type="button"
        onClick={copy}
        className="shrink-0 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-500"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

function MyClubCard({ club }: { club: UserClub }) {
  const accent = getClubAccentColor(club.name);
  const iconColor = getClubAccentIconColor(accent);
  const badgeColors = getClubRoleBadgeColors(accent);
  const iconKind = inferClubCoverIcon(club.name);
  const isOfficer = club.role === "officer";

  return (
    <li>
      <Link
        href={`/clubs/${club.id}`}
        className="my-clubs-card card-interactive flex h-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
      >
        <div className="relative flex h-20 items-center justify-center" style={{ backgroundColor: accent }}>
          <span style={{ color: iconColor }}>
            <CoverIcon kind={iconKind} />
          </span>
          <span
            className="absolute bottom-1.5 right-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
            style={badgeColors}
          >
            {isOfficer ? "OFFICER" : "MEMBER"}
          </span>
        </div>

        <div className="flex flex-1 flex-col px-3 py-2.5">
          <p className="truncate text-[13px] font-medium text-slate-900" title={club.name}>
            {club.name}
          </p>
          {isOfficer ? <MyClubJoinCode joinCode={club.joinCode} /> : null}
        </div>

        <span className="btn-primary mx-3 mb-3 block py-2.5 text-center text-sm font-semibold">
          Open workspace
        </span>
      </Link>
    </li>
  );
}

function JoinOrStartCard() {
  return (
    <li>
      <Link
        href="/clubs/join"
        className="my-clubs-join-card card-interactive flex h-full min-h-[11.5rem] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/50 px-4 py-8 text-center hover:border-slate-400 hover:bg-slate-50"
      >
        <svg
          width={28}
          height={28}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-slate-500"
          aria-hidden
        >
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </svg>
        <span className="text-sm font-medium text-slate-600">Join or start</span>
      </Link>
    </li>
  );
}

export function MyClubsGrid({ clubs }: MyClubsGridProps) {
  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" role="list">
      {clubs.map((club) => (
        <MyClubCard key={club.id} club={club} />
      ))}
      <JoinOrStartCard />
    </ul>
  );
}
