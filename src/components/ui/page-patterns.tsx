import type { ComponentPropsWithoutRef, ReactNode } from "react";

type SectionHeaderProps = {
  kicker?: string;
  title: string;
  description?: string;
  action?: ReactNode;
};

export function SectionHeader({ kicker, title, description, action }: SectionHeaderProps) {
  return (
    <div className="section-card-header">
      <div>
        {kicker ? <p className="section-kicker">{kicker}</p> : null}
        <h2 className="mt-1 text-base font-semibold tracking-tight text-slate-900 sm:text-lg">{title}</h2>
        {description ? <p className="mt-1 text-sm text-slate-600">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

type PageEmptyStateProps = {
  title: string;
  copy: string;
  action?: ReactNode;
};

export function PageEmptyState({ title, copy, action }: PageEmptyStateProps) {
  return (
    <div className="empty-state">
      <p className="empty-state-title">{title}</p>
      <p className="empty-state-copy">{copy}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

type CardSectionProps = {
  children: ReactNode;
  className?: string;
} & ComponentPropsWithoutRef<"section">;

export function CardSection({ children, className = "", ...props }: CardSectionProps) {
  return (
    <section className={`card-surface ${className}`.trim()} {...props}>
      {children}
    </section>
  );
}
