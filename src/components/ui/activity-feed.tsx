import Link from "next/link";
import type { ActivityFeedItem } from "@/lib/activity/types";
import { ClubColorDot } from "@/components/ui/club-color-dot";
import { EmptyState, type EmptyStateIcon } from "@/components/ui/empty-state";
import { CardSection, SectionHeader } from "@/components/ui/page-patterns";

type ActivityFeedProps = {
  items: ActivityFeedItem[];
  title?: string;
  description?: string;
  viewMoreHref?: string;
  variant?: "primary" | "secondary";
  emptyIcon?: EmptyStateIcon;
  emptyTitle?: string;
  emptyDescription?: string;
  /** Optional CTA shown in the empty state so it isn't a dead end */
  emptyAction?: { label: string; href: string };
  /** Dashboard: club-colored initials on each row; omit section kicker */
  showClubDots?: boolean;
};

function formatTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const mins = Math.floor((now - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function typeBadge(type: ActivityFeedItem["type"]) {
  switch (type) {
    case "announcement.created":
      return "Announcement";
    case "event.created":
      return "Event";
    case "rsvp.submitted":
      return "RSVP";
    case "attendance.marked":
      return "Attendance";
    case "role.assigned":
      return "Role assigned";
    case "role.removed":
      return "Role removed";
    default:
      return "Activity";
  }
}

export function ActivityFeed({
  items,
  title = "Activity Feed",
  description = "Recent actions across your clubs.",
  viewMoreHref,
  variant = "secondary",
  emptyIcon = "ti-activity",
  emptyTitle = "No activity yet",
  emptyDescription = "Actions across your clubs will show up here.",
  emptyAction,
  showClubDots = false,
}: ActivityFeedProps) {
  return (
    <CardSection>
      <SectionHeader
        kicker={showClubDots ? undefined : "Activity"}
        title={title}
        description={description}
        action={viewMoreHref ? <Link href={viewMoreHref} className="text-sm font-semibold text-slate-700 hover:text-slate-900">View more</Link> : null}
      />

      {items.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            icon={emptyIcon}
            title={emptyTitle}
            description={emptyDescription}
            action={emptyAction ? { label: emptyAction.label, href: emptyAction.href } : undefined}
            embedded
          />
        </div>
      ) : (
        <ul className="mt-4 space-y-2">
          {items.map((item, index) => {
            const clubLabel = item.clubName ?? "Club";
            const body = (
              <>
                <p className="text-sm text-slate-800">
                  <span className="font-semibold text-slate-900">{item.actorName}</span> {item.actionLabel}{" "}
                  <span className="font-semibold text-slate-900">{item.targetLabel}</span>
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600">
                    {typeBadge(item.type)}
                  </span>
                  {!showClubDots ? <span>{clubLabel}</span> : null}
                  {!showClubDots ? <span>·</span> : null}
                  <span>{formatTime(item.timestamp)}</span>
                </div>
              </>
            );

            return (
              <li
                key={item.id}
                className={`activity-feed-item rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2.5 ${index === 0 ? "activity-feed-item--fresh" : ""}`}
                style={{ ["--activity-index" as string]: index }}
              >
                {showClubDots ? (
                  <div className="flex gap-3">
                    <ClubColorDot clubName={clubLabel} size="sm" className="mt-0.5" />
                    <div className="min-w-0 flex-1">
                      {item.href ? (
                        <Link href={item.href} className="block">
                          {body}
                        </Link>
                      ) : (
                        body
                      )}
                    </div>
                  </div>
                ) : item.href ? (
                  <Link href={item.href} className="block">
                    {body}
                  </Link>
                ) : (
                  body
                )}
              </li>
            );
          })}
        </ul>
      )}
    </CardSection>
  );
}
