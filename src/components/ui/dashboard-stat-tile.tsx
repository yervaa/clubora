import Link from "next/link";
import type { SVGProps } from "react";

export type DashboardStatTileIcon =
  | "ti-users"
  | "ti-calendar-event"
  | "ti-checkbox"
  | "ti-bell";

export type DashboardStatTileProps = {
  icon: DashboardStatTileIcon;
  label: string;
  value: number | string;
  accent: string;
  href?: string;
};

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function StatTileIcon({ name, ...props }: { name: DashboardStatTileIcon } & SVGProps<SVGSVGElement>) {
  const common = { viewBox: "0 0 24 24", width: 20, height: 20, "aria-hidden": true as const, ...stroke, ...props };

  switch (name) {
    case "ti-calendar-event":
      return (
        <svg {...common}>
          <path d="M4 7a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-12z" />
          <path d="M16 3v4" />
          <path d="M8 3v4" />
          <path d="M4 11h16" />
          <path d="M8 15h2v2h-2z" />
        </svg>
      );
    case "ti-checkbox":
      return (
        <svg {...common}>
          <path d="M9 5h-2a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-12a2 2 0 0 0 -2 -2h-2" />
          <path d="M9 5a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2" />
          <path d="M9 12l2 2l4 -4" />
        </svg>
      );
    case "ti-bell":
      return (
        <svg {...common}>
          <path d="M10 5a2 2 0 1 1 4 0a7 7 0 0 1 4 6v3a2 2 0 0 0 2 2h-12a2 2 0 0 0 2 -2v-3a7 7 0 0 1 4 -6" />
          <path d="M9 17v1a3 3 0 0 0 6 0v-1" />
        </svg>
      );
    case "ti-users":
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

function DashboardStatTileContent({ icon, label, value, accent }: DashboardStatTileProps) {
  return (
    <>
      <span
        className="dashboard-stat-tile__icon-wrap"
        style={{
          backgroundColor: `color-mix(in srgb, ${accent} 15%, transparent)`,
          color: accent,
        }}
      >
        <StatTileIcon name={icon} />
      </span>
      <span className="dashboard-stat-tile__text">
        <span className="dashboard-stat-tile__value tabular-nums">{value}</span>
        <span className="dashboard-stat-tile__label">{label}</span>
      </span>
    </>
  );
}

export function DashboardStatTile({ icon, label, value, accent, href }: DashboardStatTileProps) {
  const className = "dashboard-stat-tile card-surface card-interactive";

  if (href) {
    return (
      <Link href={href} className={className}>
        <DashboardStatTileContent icon={icon} label={label} value={value} accent={accent} />
      </Link>
    );
  }

  return (
    <div className={className}>
      <DashboardStatTileContent icon={icon} label={label} value={value} accent={accent} />
    </div>
  );
}

export type DashboardStatTilesProps = {
  clubCount: number;
  eventsThisWeek: number;
  openTaskCount: number;
  unreadCount: number;
};

export function DashboardStatTiles({
  clubCount,
  eventsThisWeek,
  openTaskCount,
  unreadCount,
}: DashboardStatTilesProps) {
  return (
    <ul className="dashboard-stat-tiles" aria-label="Overview">
      <li className="min-w-0">
        <DashboardStatTile
          icon="ti-users"
          label="MY CLUBS"
          value={clubCount}
          accent="#378ADD"
          href="/my-clubs"
        />
      </li>
      <li className="min-w-0">
        <DashboardStatTile
          icon="ti-calendar-event"
          label="THIS WEEK"
          value={eventsThisWeek}
          accent="#7F77DD"
          href="/events"
        />
      </li>
      <li className="min-w-0">
        <DashboardStatTile
          icon="ti-checkbox"
          label="OPEN TASKS"
          value={openTaskCount}
          accent="#1D9E75"
          href="/activity"
        />
      </li>
      <li className="min-w-0">
        <DashboardStatTile
          icon="ti-bell"
          label="UNREAD"
          value={unreadCount}
          accent="#E24B4A"
          href="/notifications"
        />
      </li>
    </ul>
  );
}
