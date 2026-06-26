import type { ClubCoverIconKind } from "@/lib/clubs/club-visual";

type ClubCoverIconProps = {
  kind: ClubCoverIconKind;
  size?: number;
};

/**
 * Shared club cover glyph. Previously duplicated across club-cover-header,
 * dashboard-clubs-grid, and my-clubs-grid — keep a single source of truth so the
 * banner artwork stays consistent everywhere.
 */
export function ClubCoverIcon({ kind, size = 28 }: ClubCoverIconProps) {
  const common = {
    width: size,
    height: size,
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
