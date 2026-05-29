import type { ReactNode } from "react";

type ClubEventsPastAccordionProps = {
  count: number;
  children: ReactNode;
  footer?: ReactNode;
};

export function ClubEventsPastAccordion({ count, children, footer }: ClubEventsPastAccordionProps) {
  return (
    <section className="club-events-past-accordion" id="history">
      <details className="club-events-past-accordion__details">
        <summary className="club-events-past-accordion__summary cursor-pointer list-none [&::-webkit-details-marker]:hidden">
          <span className="club-events-past-accordion__label">Past events</span>
          <span className="badge-soft tabular-nums">{count}</span>
          <svg
            className="club-events-past-accordion__chevron h-4 w-4 shrink-0 text-slate-500"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden
          >
            <path
              fillRule="evenodd"
              d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
              clipRule="evenodd"
            />
          </svg>
        </summary>
        <div className="club-events-past-accordion__panel">
          <div className="club-events-past-accordion__panel-inner">{children}</div>
          {footer ? <div className="club-events-past-accordion__footer">{footer}</div> : null}
        </div>
      </details>
    </section>
  );
}
