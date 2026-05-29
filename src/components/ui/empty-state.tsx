"use client";

import Link from "next/link";
import type { SVGProps } from "react";

/** Tabler-style icon names (matches product vocabulary; rendered as inline SVG). */
export type EmptyStateIcon =
  | "ti-calendar-event"
  | "ti-speakerphone"
  | "ti-activity"
  | "ti-checkbox"
  | "ti-users";

type EmptyStateAction = {
  label: string;
  href?: string;
  onClick?: () => void;
};

export type EmptyStateProps = {
  icon: EmptyStateIcon;
  title: string;
  description: string;
  action?: EmptyStateAction;
  /** Tighter padding when nested inside a card widget */
  embedded?: boolean;
  className?: string;
};

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function IconSvg({ name, ...props }: { name: EmptyStateIcon } & SVGProps<SVGSVGElement>) {
  const common = { viewBox: "0 0 24 24", width: 40, height: 40, "aria-hidden": true as const, ...stroke, ...props };

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
    case "ti-speakerphone":
      return (
        <svg {...common}>
          <path d="M18 8a3 3 0 0 1 0 6" />
          <path d="M10 8v6a2 2 0 0 0 2 2h1l4 4v-16l-4 4h-1a2 2 0 0 0 -2 2z" />
        </svg>
      );
    case "ti-activity":
      return (
        <svg {...common}>
          <path d="M3 12h4l3 8l4 -16l3 8h4" />
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
    case "ti-users":
      return (
        <svg {...common}>
          <path d="M9 7m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0" />
          <path d="M3 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          <path d="M21 21v-2a4 4 0 0 0 -3 -3.85" />
        </svg>
      );
    default:
      return null;
  }
}

function EmptyStateActionButton({ action }: { action: EmptyStateAction }) {
  if (action.href) {
    return (
      <Link href={action.href} className="btn-primary">
        {action.label}
      </Link>
    );
  }

  return (
    <button type="button" className="btn-primary" onClick={action.onClick}>
      {action.label}
    </button>
  );
}

export function EmptyState({ icon, title, description, action, embedded = false, className = "" }: EmptyStateProps) {
  return (
    <div
      className={`ui-empty-state${embedded ? " ui-empty-state--embedded" : ""}${className ? ` ${className}` : ""}`.trim()}
      role="status"
    >
      <div className="ui-empty-state__icon-wrap">
        <IconSvg name={icon} className="ui-empty-state__icon" />
      </div>
      <p className="ui-empty-state__title">{title}</p>
      <p className="ui-empty-state__description">{description}</p>
      {action ? (
        <div className="ui-empty-state__action">
          <EmptyStateActionButton action={action} />
        </div>
      ) : null}
    </div>
  );
}
