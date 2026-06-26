import Link from "next/link";
import { ActivityFeed } from "@/components/ui/activity-feed";
import { ClubColorDot } from "@/components/ui/club-color-dot";
import { EmptyState } from "@/components/ui/empty-state";
import { DashboardCalendar } from "@/components/ui/dashboard-calendar";
import { DashboardClubsGrid } from "@/components/ui/dashboard-clubs-grid";
import { DashboardHeroCard } from "@/components/ui/dashboard-hero-card";
import { DashboardStatTiles } from "@/components/ui/dashboard-stat-tile";
import { DashboardTopbar, resolveDashboardGreetingName } from "@/components/layout/dashboard-topbar";
import { getGlobalActivityFeed } from "@/lib/activity/queries";
import { getClubAccentColor } from "@/lib/clubs/club-visual";
import { getDashboardData, type DashboardAnnouncement, type DashboardTaskPreview } from "@/lib/clubs/queries";
import { createClient } from "@/lib/supabase/server";
import { sanitizeInlineText } from "@/lib/sanitize";


const TASKS_PER_GROUP = 6;

function getDashboardAlertLabel(type: Awaited<ReturnType<typeof getDashboardData>>["needsAttentionAlerts"][number]["type"]) {
  switch (type) {
    case "upcoming_event_low_rsvp":
      return "RSVP";
    case "attendance_not_marked":
      return "Attendance";
    case "no_upcoming_events":
      return "Schedule";
    case "no_recent_announcement":
      return "Updates";
    default:
      return "Alert";
  }
}

type TaskTimeGroup = "overdue" | "this_week" | "later";

function classifyTaskGroup(task: DashboardTaskPreview, now: Date): TaskTimeGroup {
  if (task.isOverdue) return "overdue";
  if (!task.dueAtIso) return "later";
  const due = new Date(task.dueAtIso);
  if (due < now) return "overdue";
  const weekEnd = new Date(now);
  weekEnd.setDate(weekEnd.getDate() + 7);
  if (due <= weekEnd) return "this_week";
  return "later";
}

function groupDashboardTasks(tasks: DashboardTaskPreview[], now: Date) {
  const groups: Record<TaskTimeGroup, DashboardTaskPreview[]> = {
    overdue: [],
    this_week: [],
    later: [],
  };
  for (const task of tasks) {
    groups[classifyTaskGroup(task, now)].push(task);
  }
  return groups;
}

const TASK_GROUP_LABELS: Record<TaskTimeGroup, string> = {
  overdue: "Overdue",
  this_week: "This week",
  later: "Later",
};

function DashboardAnnouncementRow({ item }: { item: DashboardAnnouncement }) {
  const accent = getClubAccentColor(item.clubName);
  return (
    <div className="flex gap-3 px-3 py-3 sm:px-4">
      <ClubColorDot clubName={item.clubName} size="sm" className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <Link href={`/clubs/${item.clubId}/announcements`} className="group block">
          <p className="text-sm font-semibold text-slate-900 group-hover:text-slate-700">{item.title}</p>
          <p className="mt-0.5 text-xs font-medium" style={{ color: accent }}>
            {item.clubName}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {new Date(item.createdAtRaw).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })}
          </p>
        </Link>
      </div>
    </div>
  );
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [
    {
      clubs,
      upcomingEvents,
      recentAnnouncements,
      needsAttentionAlerts,
      myOpenTasks,
      unreadNotificationCount,
    },
    activityItems,
    profileResult,
  ] = await Promise.all([
    getDashboardData(),
    getGlobalActivityFeed(12),
    user
      ? supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const metaName =
    typeof user?.user_metadata?.full_name === "string"
      ? sanitizeInlineText(user.user_metadata.full_name).slice(0, 80)
      : "";
  const profileName = profileResult.data?.full_name?.trim() || metaName;
  const greetingName = resolveDashboardGreetingName(profileName, user?.email);
  const userDisplayLabel = profileName || user?.email || "Account";
  const firstName = greetingName.trim().split(/\s+/)[0] ?? greetingName;
  const heroAccentColor = clubs[0] ? getClubAccentColor(clubs[0].name) : "#1e1b4b";

  const officerClubIds = new Set(clubs.filter((c) => c.role === "officer").map((c) => c.id));
  const leadershipAlerts = needsAttentionAlerts.filter((a) => officerClubIds.has(a.clubId));
  const officerClubs = officerClubIds.size;

  const now = new Date();
  const hasClubs = clubs.length > 0;
  const taskGroups = groupDashboardTasks(myOpenTasks, now);
  const viewAllTasksHref = myOpenTasks[0] ? `/clubs/${myOpenTasks[0].clubId}/tasks` : "/clubs";

  const calendarEvents = upcomingEvents.map((event) => ({
    id: event.id,
    title: event.title,
    starts_at: event.eventDateRaw,
    club_name: event.clubName,
    club_id: event.clubId,
  }));

  // TODO: getDashboardData() only returns the next 8 upcoming events; count may under-report.
  const weekEnd = new Date(now);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const eventsThisWeek = upcomingEvents.filter((event) => new Date(event.eventDateRaw) <= weekEnd).length;

  const latestUpdatesAnnouncements = recentAnnouncements.slice(0, 8);

  return (
    <>
      <DashboardTopbar
        greetingName={greetingName}
        unreadNotificationCount={unreadNotificationCount}
        userDisplayLabel={userDisplayLabel}
      />

      {user ? (
        <div className="page-sections page-sections--loose">
          <DashboardHeroCard
            firstName={firstName}
            clubCount={clubs.length}
            openTaskCount={myOpenTasks.length}
            upcomingEventCount={eventsThisWeek}
            hasUnread={unreadNotificationCount > 0}
            accentColor={heroAccentColor}
          />

          {!hasClubs ? (
            <EmptyState
              icon="ti-users"
              title="Join a club to see your schedule and updates"
              description="Most people start with an invite or join code. Starting something new is one step away when you need it."
              action={{ label: "Join with a code", href: "/clubs/join" }}
              footer={
                <>
                  <Link href="/clubs/create" className="text-sm font-medium text-slate-500 hover:text-slate-800">
                    Or start a new club →
                  </Link>
                  <Link href="/discover" className="text-sm font-medium text-slate-500 hover:text-slate-800">
                    Browse clubs first →
                  </Link>
                </>
              }
            />
          ) : (
            <>
          <DashboardStatTiles
            clubCount={clubs.length}
            eventsThisWeek={eventsThisWeek}
            openTaskCount={myOpenTasks.length}
            unreadCount={unreadNotificationCount}
          />
          <DashboardClubsGrid clubs={clubs} />

          <ActivityFeed
            items={activityItems.slice(0, 8)}
            title="Recent activity"
            description="Across all your clubs."
            viewMoreHref="/activity"
            variant="primary"
            showClubDots
            emptyIcon="ti-activity"
            emptyTitle="No activity yet"
            emptyDescription="Post an announcement or schedule an event and it'll show up here."
            emptyAction={{ label: "Open a club", href: "/my-clubs" }}
          />

          <section id="important-now" aria-labelledby="dash-priority-heading" className="flex flex-col gap-4">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 id="dash-priority-heading" className="text-lg font-semibold tracking-tight text-slate-900 sm:text-xl">
                  Important now
                </h2>
              </div>
              {myOpenTasks.length > 0 ? (
                <span className="text-xs font-medium text-slate-500 tabular-nums sm:text-sm">
                  {myOpenTasks.length} open task{myOpenTasks.length === 1 ? "" : "s"}
                </span>
              ) : null}
            </div>

            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 min-w-0 flex flex-col gap-4">
                <div className="card-surface">
                  <p className="text-sm font-semibold text-slate-900">My tasks</p>
                  {myOpenTasks.length === 0 ? (
                    <p className="mt-3 text-sm leading-relaxed text-slate-600">
                      No open tasks assigned to you. When officers assign work, it&apos;ll appear here.
                    </p>
                  ) : (
                    <div className="mt-3 space-y-4">
                      {(["overdue", "this_week", "later"] as const).map((groupKey) => {
                        const items = taskGroups[groupKey].slice(0, TASKS_PER_GROUP);
                        if (items.length === 0) return null;
                        return (
                          <div key={groupKey}>
                            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                              {TASK_GROUP_LABELS[groupKey]}
                            </p>
                            <ul className="mt-2 space-y-2">
                              {items.map((task) => (
                                <li key={task.id}>
                                  <Link
                                    href={`/clubs/${task.clubId}/tasks`}
                                    className="block rounded-xl border border-slate-100 bg-slate-50/50 p-3 transition hover:border-slate-200 hover:bg-slate-50"
                                  >
                                    <p
                                      className={`text-sm font-semibold ${groupKey === "overdue" ? "text-red-600" : "text-slate-900"}`}
                                    >
                                      {task.title}
                                    </p>
                                    <p className="mt-1 text-xs text-slate-500">{task.clubName}</p>
                                    {task.dueAt ? (
                                      <p className={`mt-0.5 text-xs ${groupKey === "overdue" ? "text-red-600/90" : "text-slate-600"}`}>
                                        Due {task.dueAt}
                                      </p>
                                    ) : null}
                                  </Link>
                                </li>
                              ))}
                            </ul>
                          </div>
                        );
                      })}
                      {myOpenTasks.length > TASKS_PER_GROUP * 3 ? (
                        <Link href={viewAllTasksHref} className="action-link inline-block text-sm font-semibold text-slate-800">
                          View all tasks →
                        </Link>
                      ) : null}
                    </div>
                  )}
                </div>
              </div>

              <div className="w-full md:w-[280px] md:flex-shrink-0">
                <DashboardCalendar events={calendarEvents} today={now} />
              </div>
            </div>
          </section>

          {latestUpdatesAnnouncements.length > 0 ? (
            <section id="latest-updates" aria-labelledby="dash-feed-heading" className="flex flex-col gap-3">
              <h2 id="dash-feed-heading" className="text-lg font-semibold tracking-tight text-slate-900 sm:text-xl">
                Latest updates
              </h2>
              <div className="overflow-hidden rounded-xl border border-slate-200/95 bg-white shadow-[0_1px_2px_rgb(15_23_42/0.04)]">
                <ul className="divide-y divide-slate-100" role="list">
                  {latestUpdatesAnnouncements.map((announcement) => (
                    <li key={announcement.id}>
                      <DashboardAnnouncementRow item={announcement} />
                    </li>
                  ))}
                </ul>
                <div className="flex justify-end border-t border-slate-100 px-4 py-3 sm:px-5">
                  <Link href="/announcements" className="dashboard-latest-updates-link">
                    View all announcements →
                  </Link>
                </div>
              </div>
            </section>
          ) : null}

          {officerClubs > 0 ? (
            <details className="card-surface overflow-hidden p-0 open:shadow-md" open={leadershipAlerts.length > 0}>
              <summary className="section-card-header m-0 cursor-pointer list-none p-5 sm:p-6 [&::-webkit-details-marker]:hidden">
                <div className="min-w-0 pr-8">
                  <h2 className="text-lg font-semibold tracking-tight text-slate-900">Leadership & club health</h2>
                  <p className="mt-1 text-sm text-slate-600">Clubs you help run.</p>
                </div>
                <span className="badge-soft shrink-0 tabular-nums">{leadershipAlerts.length}</span>
              </summary>
              <div className="border-t border-slate-100 px-5 pb-5 pt-4 sm:px-6 sm:pb-6">
                {leadershipAlerts.length === 0 ? (
                  <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/50 p-4 sm:p-5">
                    <p className="font-semibold text-slate-900">Nothing urgent right now.</p>
                    <p className="mt-1 text-sm text-slate-600">Check back after events or when you schedule new meetings.</p>
                  </div>
                ) : (
                  <div className="list-stack space-y-3">
                    {leadershipAlerts.map((alert) => (
                      <article key={alert.id} className="surface-subcard p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="max-w-2xl min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="badge-soft">{alert.clubName}</span>
                              <span className="badge-soft">{getDashboardAlertLabel(alert.type)}</span>
                              <h3 className="text-sm font-semibold text-slate-900">{alert.title}</h3>
                            </div>
                            <p className="mt-2 text-sm leading-relaxed text-slate-600">{alert.description}</p>
                          </div>
                          <Link href={alert.ctaHref} className="btn-secondary w-full shrink-0 whitespace-nowrap sm:w-auto">
                            {alert.ctaLabel}
                          </Link>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            </details>
          ) : null}
            </>
          )}
        </div>
      ) : null}
    </>
  );
}
