import Link from "next/link";
import { CardSection, SectionHeader } from "@/components/ui/page-patterns";
import { ActivityFeed } from "@/components/ui/activity-feed";
import { getDashboardData } from "@/lib/clubs/queries";
import { getGlobalActivityFeed } from "@/lib/activity/queries";

export default async function ActivityPage() {
  const [{ needsAttentionAlerts, myOpenTasks, unreadNotificationCount }, activityItems] = await Promise.all([
    getDashboardData(),
    getGlobalActivityFeed(40),
  ]);

  return (
    <>
      <h1 className="app-page-title">Activity</h1>
      <div className="page-sections">
        <ActivityFeed
          items={activityItems}
          title="Recent activity"
          description="Announcements, events, RSVPs, attendance, and role updates across your clubs."
          showClubDots
          emptyIcon="ti-activity"
          emptyTitle="No activity yet"
          emptyDescription="Actions across your clubs will show up here."
        />

        <div className="grid gap-4 xl:grid-cols-2">
          <CardSection>
          <SectionHeader
            title="Open assignments"
            action={<span className="badge-soft">{myOpenTasks.length}</span>}
          />
          {myOpenTasks.length === 0 ? (
            <div className="mt-3 rounded-lg border border-dashed border-slate-200 bg-slate-50/70 p-4">
              <p className="text-sm font-semibold text-slate-900">No open tasks assigned</p>
              <p className="mt-1 text-sm text-slate-600">
                Once officers assign work, it will appear here with due dates and priority.
              </p>
              <Link href="/my-clubs" className="btn-secondary mt-3 inline-flex">
                Open a club workspace
              </Link>
            </div>
          ) : (
            <ul className="mt-3 space-y-2">
              {myOpenTasks.slice(0, 8).map((task) => (
                <li key={task.id}>
                  <Link
                    href={`/clubs/${task.clubId}/tasks`}
                    className="block rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2.5 text-sm text-slate-800 transition hover:bg-slate-100"
                  >
                    <p className="font-semibold text-slate-900">{task.title}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{task.clubName}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          </CardSection>

          <CardSection>
            <SectionHeader
              title="Attention needed"
            action={<span className="badge-soft">{needsAttentionAlerts.length}</span>}
          />
          {needsAttentionAlerts.length === 0 ? (
            <div className="mt-3 rounded-lg border border-dashed border-slate-200 bg-slate-50/70 p-4">
              <p className="text-sm font-semibold text-slate-900">No urgent follow-ups</p>
              <p className="mt-1 text-sm text-slate-600">
                You are caught up. As your clubs grow, this panel highlights what needs leadership attention.
              </p>
              <Link href="/notifications" className="btn-secondary mt-3 inline-flex">
                Check notifications
                {unreadNotificationCount > 0 ? ` (${unreadNotificationCount})` : ""}
              </Link>
            </div>
          ) : (
            <ul className="mt-3 space-y-2">
              {needsAttentionAlerts.slice(0, 8).map((alert) => (
                <li key={alert.id}>
                  <Link
                    href={alert.ctaHref}
                    className="block rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2.5 text-sm text-slate-800 transition hover:bg-slate-100"
                  >
                    <p className="font-semibold text-slate-900">{alert.title}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{alert.clubName}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          </CardSection>
        </div>
      </div>
    </>
  );
}
