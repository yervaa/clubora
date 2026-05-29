import Link from "next/link";
import type { CSSProperties } from "react";

export type DashboardHeroState = "tasksDue" | "eventSoon" | "allClear" | "newUser";

export type DashboardHeroCardProps = {
  firstName: string;
  clubCount: number;
  openTaskCount: number;
  upcomingEventCount: number;
  hasUnread: boolean;
  /** Right-side gradient tint (first club accent or fallback). */
  accentColor?: string;
};

type HeroContent = {
  state: DashboardHeroState;
  headline: string;
  subtext: string;
  ctaLabel: string;
  ctaHref: string;
};

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return count === 1 ? singular : pluralForm;
}

export function resolveDashboardHeroState({
  clubCount,
  openTaskCount,
  upcomingEventCount,
}: Pick<DashboardHeroCardProps, "clubCount" | "openTaskCount" | "upcomingEventCount">): DashboardHeroState {
  if (clubCount === 0) return "newUser";
  if (openTaskCount > 0) return "tasksDue";
  if (upcomingEventCount > 0) return "eventSoon";
  return "allClear";
}

function getHeroContent(
  state: DashboardHeroState,
  openTaskCount: number,
  upcomingEventCount: number,
): HeroContent {
  switch (state) {
    case "tasksDue":
      return {
        state,
        headline: "You've got things to do",
        subtext: `${openTaskCount} ${plural(openTaskCount, "task")} waiting for you.`,
        ctaLabel: "See tasks",
        ctaHref: "/activity",
      };
    case "eventSoon":
      return {
        state,
        headline: "Something's coming up",
        subtext: `${upcomingEventCount} ${plural(upcomingEventCount, "event")} this week across your clubs.`,
        ctaLabel: "View events",
        ctaHref: "/events",
      };
    case "newUser":
      return {
        state,
        headline: "Welcome to ClubHub",
        subtext: "Join a club to get started.",
        ctaLabel: "Find a club",
        ctaHref: "/discover",
      };
    case "allClear":
    default:
      return {
        state: "allClear",
        headline: "You're all caught up",
        subtext: "Nothing urgent. Check your clubs for what's new.",
        ctaLabel: "My clubs",
        ctaHref: "/my-clubs",
      };
  }
}

const ILLU_WHITE = "#ffffff";
const ILLU_MAIN = 0.9;
const ILLU_BG = 0.4;

const ILLU_STROKE = {
  fill: "none",
  stroke: ILLU_WHITE,
  strokeOpacity: ILLU_MAIN,
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function HeroIllustration({ state }: { state: DashboardHeroState }) {
  const svgProps = {
    viewBox: "0 0 80 80",
    width: 80,
    height: 80,
    "aria-hidden": true as const,
    className: "dashboard-hero-card__illustration-svg",
  };

  switch (state) {
    case "tasksDue":
      return (
        <svg {...svgProps}>
          <circle
            cx="40"
            cy="38"
            r="22"
            fill={ILLU_WHITE}
            fillOpacity={ILLU_BG}
            stroke={ILLU_WHITE}
            strokeOpacity={ILLU_MAIN}
            strokeWidth={2}
          />
          <path {...ILLU_STROKE} d="M30 38l6 6 14-14" />
          <circle
            cx="58"
            cy="22"
            r="10"
            fill={ILLU_WHITE}
            fillOpacity={ILLU_BG}
            stroke={ILLU_WHITE}
            strokeOpacity={ILLU_MAIN}
            strokeWidth={1.75}
          />
          <path {...ILLU_STROKE} strokeWidth={1.5} d="M58 18v4M55 21h6" />
        </svg>
      );
    case "eventSoon":
      return (
        <svg {...svgProps}>
          <rect
            x="18"
            y="22"
            width="44"
            height="40"
            rx="6"
            fill={ILLU_WHITE}
            fillOpacity={ILLU_BG}
            stroke={ILLU_WHITE}
            strokeOpacity={ILLU_MAIN}
            strokeWidth={2}
          />
          <path {...ILLU_STROKE} d="M18 32h44M28 18v8M52 18v8" />
          <path
            fill={ILLU_WHITE}
            fillOpacity={ILLU_MAIN}
            stroke={ILLU_WHITE}
            strokeOpacity={ILLU_MAIN}
            strokeWidth={1.5}
            d="M52 14l4 8h-8l4-8z"
          />
        </svg>
      );
    case "newUser":
      return (
        <svg {...svgProps}>
          <circle
            cx="32"
            cy="36"
            r="14"
            fill={ILLU_WHITE}
            fillOpacity={ILLU_BG}
            stroke={ILLU_WHITE}
            strokeOpacity={ILLU_MAIN}
            strokeWidth={2}
          />
          <circle
            cx="50"
            cy="44"
            r="14"
            fill={ILLU_WHITE}
            fillOpacity={ILLU_MAIN}
            stroke={ILLU_WHITE}
            strokeOpacity={ILLU_MAIN}
            strokeWidth={2}
          />
          <path {...ILLU_STROKE} strokeWidth={1.75} d="M32 48v8M50 56v8" />
        </svg>
      );
    case "allClear":
    default:
      return (
        <svg {...svgProps}>
          <circle
            cx="40"
            cy="40"
            r="26"
            fill={ILLU_WHITE}
            fillOpacity={ILLU_BG}
            stroke={ILLU_WHITE}
            strokeOpacity={ILLU_MAIN}
            strokeWidth={2}
          />
          <path {...ILLU_STROKE} d="M28 40l8 8 16-18" />
        </svg>
      );
  }
}

export function DashboardHeroCard({
  firstName: _firstName,
  clubCount,
  openTaskCount,
  upcomingEventCount,
  hasUnread: _hasUnread,
  accentColor = "#1e1b4b",
}: DashboardHeroCardProps) {
  const state = resolveDashboardHeroState({ clubCount, openTaskCount, upcomingEventCount });
  const content = getHeroContent(state, openTaskCount, upcomingEventCount);

  return (
    <section
      className="dashboard-hero-card"
      style={{ "--dashboard-hero-accent": accentColor } as CSSProperties}
      aria-labelledby="dashboard-hero-heading"
    >
      <div className="dashboard-hero-card__body">
        <div className="dashboard-hero-card__text">
          <h2 id="dashboard-hero-heading" className="dashboard-hero-card__headline">
            {content.headline}
          </h2>
          <p className="dashboard-hero-card__subtext">{content.subtext}</p>
          <Link href={content.ctaHref} className="dashboard-hero-card__cta">
            {content.ctaLabel}
          </Link>
        </div>
        <div className="dashboard-hero-card__art" aria-hidden>
          <HeroIllustration state={state} />
        </div>
      </div>
    </section>
  );
}
