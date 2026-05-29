import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserPermissions } from "@/lib/rbac/permissions";
import { ClubEventsSection } from "@/components/ui/club-events-section";
import { EventCalendarView } from "@/components/ui/event-calendar-view";
import { CardSection } from "@/components/ui/page-patterns";
import { partitionEventsByLifecycle } from "@/lib/clubs/event-lifecycle";
import { getClubDetailForEventsForCurrentUser } from "@/lib/clubs/queries";

type ClubEventsPageProps = {
  params: Promise<{ clubId: string }>;
  searchParams: Promise<{
    view?: string;
    filter?: string;
    eventError?: string;
    eventSuccess?: string;
    duplicateEventId?: string;
    reflectionError?: string;
    reflectionSuccess?: string;
    reflectionEventId?: string;
    rsvpError?: string;
    rsvpSuccess?: string;
    rsvpEventId?: string;
    attendanceError?: string;
    attendanceSuccess?: string;
    attendanceEventId?: string;
    attendanceUserId?: string;
    attendancePresent?: string;
  }>;
};

export default async function ClubEventsPage({ params, searchParams }: ClubEventsPageProps) {
  const { clubId } = await params;
  const query = await searchParams;
  const viewMode = query.view === "calendar" ? "calendar" : "list";
  const listFilter = query.filter === "needs-review" ? "needs-review" : "all";

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [club, userPermissions] = await Promise.all([
    getClubDetailForEventsForCurrentUser(clubId),
    getUserPermissions(user.id, clubId),
  ]);

  if (!club) {
    notFound();
  }

  const permissions = {
    canCreateEvents: userPermissions.has("events.create"),
    canEditEvents: userPermissions.has("events.edit"),
    canDeleteEvents: userPermissions.has("events.delete"),
    canMarkAttendance: userPermissions.has("attendance.mark"),
    canManageReflections: userPermissions.has("reflections.create"),
    canViewAggregatedStats:
      userPermissions.has("attendance.mark") ||
      userPermissions.has("attendance.edit") ||
      userPermissions.has("reflections.create") ||
      userPermissions.has("reflections.edit") ||
      userPermissions.has("events.edit"),
    canViewInsights: userPermissions.has("insights.view"),
  };

  const now = new Date();
  const { upcoming, recentlyHappened, past } = partitionEventsByLifecycle(club.events, now);
  const upcomingCount = upcoming.length;
  const recentCount = recentlyHappened.length;
  const pastCount = past.length;

  const calendarEvents = club.events.map((e) => ({
    id: e.id,
    title: e.title,
    eventType: e.eventType,
    eventDateIso: e.eventDateRaw.toISOString(),
    rsvpStatus: e.userRsvpStatus,
  }));

  const statsLine = [
    `${club.events.length} total`,
    upcomingCount > 0 ? `${upcomingCount} upcoming` : null,
    recentCount > 0 ? `${recentCount} recent` : null,
    pastCount > 0 ? `${pastCount} past` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const filterToolbar = (
    <div className="club-events-toolbar">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        {viewMode === "list" ? (
          <nav
            className="flex min-w-0 flex-wrap items-center gap-2 text-sm font-semibold"
            aria-label="Event sections"
          >
            <a
              href="#upcoming"
              className="inline-flex min-h-10 items-center rounded-full border border-slate-200 bg-white px-3.5 py-2 text-slate-700 hover:border-slate-300"
            >
              Upcoming
            </a>
            <a
              href="#recent"
              className="inline-flex min-h-10 items-center rounded-full border border-slate-200 bg-white px-3.5 py-2 text-slate-700 hover:border-slate-300"
            >
              Recently happened
            </a>
            <a
              href="#history"
              className="inline-flex min-h-10 items-center rounded-full border border-slate-200 bg-white px-3.5 py-2 text-slate-700 hover:border-slate-300"
            >
              Past events
            </a>
            <Link
              href={`/clubs/${clubId}/events/history`}
              className="inline-flex min-h-10 items-center rounded-full border border-slate-200 bg-white px-3.5 py-2 text-slate-700 hover:border-slate-300"
            >
              Full history
            </Link>
            {permissions.canViewAggregatedStats ? (
              <Link
                href={`/clubs/${clubId}/events?filter=needs-review#recent`}
                className="inline-flex min-h-10 items-center rounded-full border border-amber-200 bg-amber-50 px-3.5 py-2 text-amber-950 hover:bg-amber-100"
              >
                Needs review
              </Link>
            ) : null}
            <span className="w-full text-xs font-medium text-slate-500 sm:w-auto sm:pl-1">{statsLine}</span>
          </nav>
        ) : (
          <p className="text-xs font-medium text-slate-500">{statsLine}</p>
        )}

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3 lg:shrink-0">
          <a
            href={`/clubs/${clubId}/events/export`}
            download
            className="btn-secondary flex w-full items-center justify-center gap-1.5 px-4 py-2.5 text-sm sm:w-auto"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export .ics
          </a>
          <div className="flex w-full rounded-lg border border-slate-200 bg-white p-0.5 sm:w-auto">
            <a
              href={`/clubs/${clubId}/events?view=list`}
              className={`flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold transition sm:flex-none sm:py-1.5 ${
                viewMode === "list" ? "bg-slate-900 text-white" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
              List
            </a>
            <a
              href={`/clubs/${clubId}/events?view=calendar`}
              className={`flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold transition sm:flex-none sm:py-1.5 ${
                viewMode === "calendar" ? "bg-slate-900 text-white" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Calendar
            </a>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="page-sections">
      {viewMode === "calendar" ? (
        <>
          <CardSection className="space-y-3">{filterToolbar}</CardSection>
          <EventCalendarView events={calendarEvents} clubId={clubId} />
        </>
      ) : (
        <div className="club-events-unified-card card-surface overflow-hidden" id="events">
          {filterToolbar}
          <ClubEventsSection club={club} query={query} permissions={permissions} listFilter={listFilter} layout="unified" />
        </div>
      )}
    </div>
  );
}
