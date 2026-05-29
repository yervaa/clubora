import type { ReactNode } from "react";
import Link from "next/link";
import { createEventAction } from "@/app/(app)/clubs/actions";
import { ClubEventCardFull } from "@/components/ui/club-event-card-full";
import { ClubEventPastFoldable } from "@/components/ui/club-event-past-foldable";
import { EmptyState } from "@/components/ui/empty-state";
import { CardSection, PageEmptyState, SectionHeader } from "@/components/ui/page-patterns";
import { ScrollToInputButton } from "@/components/ui/scroll-to-input-button";
import { ActionFeedbackBanner } from "@/components/ui/action-feedback-banner";
import { FormDraftPersistence } from "@/components/ui/form-draft-persistence";
import { EVENT_TYPE_OPTIONS } from "@/lib/events";
import {
  eventNeedsOfficerReview,
  getEventReviewFlags,
  partitionEventsByLifecycle,
  RECENTLY_HAPPENED_DAYS,
} from "@/lib/clubs/event-lifecycle";
import type { ClubDetail } from "@/lib/clubs/queries";

export type ClubEventsPermissions = {
  canCreateEvents: boolean;
  canEditEvents: boolean;
  canDeleteEvents: boolean;
  canMarkAttendance: boolean;
  canManageReflections: boolean;
  /** RSVP/attendance aggregates on past events (operational roles). */
  canViewAggregatedStats: boolean;
  canViewInsights?: boolean;
};

type ClubEventsSectionProps = {
  club: ClubDetail;
  permissions?: ClubEventsPermissions;
  query: {
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
  };
  /** `needs-review` limits lists to items with open follow-ups (officers). */
  listFilter?: "all" | "needs-review";
};

export function ClubEventsSection({ club, query, permissions, listFilter = "all" }: ClubEventsSectionProps) {
  const legacyIsOfficer = club.currentUserRole === "officer";
  const canCreateEvents = permissions?.canCreateEvents ?? legacyIsOfficer;
  const canEditEvents = permissions?.canEditEvents ?? legacyIsOfficer;
  const canDeleteEvents = permissions?.canDeleteEvents ?? legacyIsOfficer;
  const canMarkAttendance = permissions?.canMarkAttendance ?? legacyIsOfficer;
  const canManageReflections = permissions?.canManageReflections ?? legacyIsOfficer;
  const canViewAggregatedStats =
    permissions?.canViewAggregatedStats ??
    (canMarkAttendance || canManageReflections || canCreateEvents);
  const canViewInsights = permissions?.canViewInsights ?? false;

  const memberCount = club.memberCount;
  const duplicateEvent = canCreateEvents && query.duplicateEventId
    ? club.events.find((event) => event.id === query.duplicateEventId) ?? null
    : null;

  const now = new Date();
  const { upcoming, recentlyHappened, past } = partitionEventsByLifecycle(club.events, now);

  const showReviewCues = canViewAggregatedStats && (canMarkAttendance || canManageReflections);

  const cardQuery = {
    reflectionError: query.reflectionError,
    reflectionSuccess: query.reflectionSuccess,
    reflectionEventId: query.reflectionEventId,
    rsvpSuccess: query.rsvpSuccess,
    rsvpEventId: query.rsvpEventId,
    attendanceSuccess: query.attendanceSuccess,
    attendanceEventId: query.attendanceEventId,
    attendanceUserId: query.attendanceUserId,
    attendancePresent: query.attendancePresent,
  };

  const cardPropsBase = {
    club,
    query: cardQuery,
    memberCount,
    now,
    canCreateEvents,
    canEditEvents,
    canDeleteEvents,
    canMarkAttendance,
    canManageReflections,
    canViewAggregatedStats,
  };

  const filterNeedsReview = listFilter === "needs-review" && showReviewCues;

  const passesNeedsReview = (event: (typeof club.events)[number]) => {
    if (!filterNeedsReview) return true;
    const flags = getEventReviewFlags(event, now, {
      canMarkAttendance,
      canManageReflections,
      memberCount,
    });
    return eventNeedsOfficerReview(flags);
  };

  const upcomingFiltered = upcoming.filter(passesNeedsReview);
  const recentFiltered = recentlyHappened.filter(passesNeedsReview);
  const pastFiltered = past.filter(passesNeedsReview);

  const recentReviewStats = recentlyHappened.reduce(
    (acc, event) => {
      const flags = getEventReviewFlags(event, now, {
        canMarkAttendance,
        canManageReflections,
        memberCount,
      });
      if (flags.needsAttendanceFollowUp) acc.attendance += 1;
      if (flags.needsReflectionFollowUp) acc.reflection += 1;
      if (flags.hasLowRsvpTurnout) acc.lowRsvp += 1;
      return acc;
    },
    { attendance: 0, reflection: 0, lowRsvp: 0 },
  );
  const recentNeedingReview = recentlyHappened.filter((event) =>
    eventNeedsOfficerReview(
      getEventReviewFlags(event, now, {
        canMarkAttendance,
        canManageReflections,
        memberCount,
      }),
    ),
  ).length;

  const sectionShell = (id: string, title: string, subtitle: string, children: ReactNode) => (
    <CardSection>
      <section id={id} className="scroll-mt-24 space-y-3 lg:space-y-4">
        <SectionHeader title={title} description={subtitle} />
        {children}
      </section>
    </CardSection>
  );

  return (
    <div id="events">
      {query.eventSuccess ? (
        <ActionFeedbackBanner
          variant="success"
          title="Event saved"
          message={query.eventSuccess}
          className="mt-4"
          actions={
            <>
              <a href="#upcoming" className="btn-secondary text-xs">
                View upcoming events
              </a>
              <Link href={`/clubs/${club.id}/members#invite-members`} className="btn-secondary text-xs">
                Invite members
              </Link>
            </>
          }
        />
      ) : null}
      {query.eventError ? (
        <ActionFeedbackBanner
          variant="error"
          title="Event update failed"
          message={query.eventError}
          className="mt-3"
        />
      ) : null}
      {query.rsvpSuccess ? <p className="alert-success mt-3">{query.rsvpSuccess}</p> : null}
      {query.rsvpError ? <p className="alert-error mt-3">{query.rsvpError}</p> : null}
      {query.attendanceSuccess ? <p className="alert-success mt-3">{query.attendanceSuccess}</p> : null}
      {query.attendanceError ? <p className="alert-error mt-3">{query.attendanceError}</p> : null}

      {filterNeedsReview ? (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm text-amber-950">
          <p className="font-semibold">Filtered: needs follow-up</p>
          <p className="mt-1 text-amber-900/90">Showing events that still need attendance, reflection, or had low RSVP uptake.</p>
          <Link href={`/clubs/${club.id}/events`} className="mt-2 inline-block text-sm font-semibold text-amber-900 underline">
            Clear filter
          </Link>
        </div>
      ) : null}

      {canCreateEvents ? (
        <details className="mt-4 rounded-xl border border-slate-200 bg-slate-50/70 open:bg-slate-50/90">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-slate-900 [&::-webkit-details-marker]:hidden sm:px-5">
            Quick create event
            <span className="ml-2 text-xs font-medium text-slate-500">Title + date first, details optional</span>
          </summary>
          <form id="create-event" action={createEventAction} className="space-y-4 border-t border-slate-200 px-4 py-4 sm:px-5">
            <input type="hidden" name="club_id" value={club.id} />
            {duplicateEvent ? <input type="hidden" name="duplicate_event_id" value={duplicateEvent.id} /> : null}

            <div>
              <p className="text-sm font-semibold text-slate-900">
                {duplicateEvent ? "Create a duplicated draft" : "Schedule a new event"}
              </p>
              <p className="mt-1 text-sm text-slate-600">
                {duplicateEvent
                  ? "The basic details are prefilled from the event you selected. Pick the new date and publish."
                  : "Fast path: add a title and date. You can add location, type, and description only if needed."}
              </p>
            </div>

            {duplicateEvent ? (
              <div className="rounded-xl border border-blue-200 bg-blue-50/80 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Duplicating: {duplicateEvent.title}</p>
                    <p className="mt-1 text-sm text-slate-600">
                      Choose a fresh date and publish. Advanced details can be adjusted below.
                    </p>
                  </div>
                  <Link
                    href={`/clubs/${club.id}/events`}
                    className="btn-secondary flex min-h-11 w-full items-center justify-center whitespace-nowrap text-xs sm:min-h-0 sm:w-auto"
                  >
                    Clear draft
                  </Link>
                </div>
              </div>
            ) : null}

            <div>
              <label htmlFor="event_title" className="mb-1.5 block text-sm font-medium text-slate-700">
                Event title *
              </label>
              <input
                id="event_title"
                name="title"
                type="text"
                required
                minLength={3}
                maxLength={160}
                defaultValue={duplicateEvent?.title ?? ""}
                className="input-control min-h-11 sm:min-h-0"
                placeholder="e.g. Weekly planning meeting"
                aria-describedby="event-title-hint"
              />
              <p id="event-title-hint" className="mt-1 text-xs text-slate-500">
                Use a specific title members can recognize quickly.
              </p>
            </div>

            <div>
              <label htmlFor="event_date" className="mb-1.5 block text-sm font-medium text-slate-700">
                Event date & time *
              </label>
              <input id="event_date" name="event_date" type="datetime-local" required className="input-control" />
              <p className="mt-1 text-xs text-slate-500">
                {duplicateEvent
                  ? "Choose a new date and time for this duplicate."
                  : "Members can RSVP as soon as this is published."}
              </p>
            </div>

            <details className="rounded-xl border border-slate-200 bg-white/80">
              <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-slate-900 [&::-webkit-details-marker]:hidden">
                Recurring schedule (optional)
                <span className="ml-2 text-xs font-medium text-slate-500">Weekly, every 2 weeks, or monthly</span>
              </summary>
              <div className="space-y-4 border-t border-slate-200 px-4 py-4">
                <div>
                  <label htmlFor="recurrence_mode" className="mb-1.5 block text-sm font-medium text-slate-700">
                    Event pattern
                  </label>
                  <select id="recurrence_mode" name="recurrence_mode" defaultValue="one_time" className="input-control min-h-11 sm:min-h-0">
                    <option value="one_time">One-time event</option>
                    <option value="recurring">Recurring series</option>
                  </select>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="recurrence_frequency" className="mb-1.5 block text-sm font-medium text-slate-700">
                      Frequency
                    </label>
                    <select
                      id="recurrence_frequency"
                      name="recurrence_frequency"
                      defaultValue="weekly"
                      className="input-control min-h-11 sm:min-h-0"
                    >
                      <option value="weekly">Every week</option>
                      <option value="biweekly">Every 2 weeks</option>
                      <option value="monthly">Monthly</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="recurrence_end_time" className="mb-1.5 block text-sm font-medium text-slate-700">
                      End time
                    </label>
                    <input
                      id="recurrence_end_time"
                      name="recurrence_end_time"
                      type="time"
                      className="input-control min-h-11 sm:min-h-0"
                      defaultValue="19:00"
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <label htmlFor="recurrence_end_type" className="mb-1.5 block text-sm font-medium text-slate-700">
                      End condition
                    </label>
                    <select
                      id="recurrence_end_type"
                      name="recurrence_end_type"
                      defaultValue="after_count"
                      className="input-control min-h-11 sm:min-h-0"
                    >
                      <option value="after_count">After number of events</option>
                      <option value="until_date">On a date</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="recurrence_count" className="mb-1.5 block text-sm font-medium text-slate-700">
                      Occurrence count
                    </label>
                    <input
                      id="recurrence_count"
                      name="recurrence_count"
                      type="number"
                      min={1}
                      max={52}
                      defaultValue={8}
                      className="input-control min-h-11 sm:min-h-0"
                    />
                  </div>
                  <div>
                    <label htmlFor="recurrence_until_date" className="mb-1.5 block text-sm font-medium text-slate-700">
                      End date
                    </label>
                    <input
                      id="recurrence_until_date"
                      name="recurrence_until_date"
                      type="date"
                      className="input-control min-h-11 sm:min-h-0"
                    />
                  </div>
                </div>
                <p className="text-xs text-slate-500">
                  For monthly events on dates like 29/30/31, shorter months use the last day of that month.
                </p>
              </div>
            </details>

            <details className="rounded-xl border border-slate-200 bg-white/80">
              <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-slate-900 [&::-webkit-details-marker]:hidden">
                Optional details
                <span className="ml-2 text-xs font-medium text-slate-500">Type, location, and description</span>
              </summary>
              <div className="space-y-4 border-t border-slate-200 px-4 py-4">
                <div>
                  <label htmlFor="event_type" className="mb-1.5 block text-sm font-medium text-slate-700">
                    Event type
                  </label>
                  <select
                    id="event_type"
                    name="event_type"
                    defaultValue={duplicateEvent?.eventType ?? "Meeting"}
                    className="input-control min-h-11 sm:min-h-0"
                  >
                    {EVENT_TYPE_OPTIONS.map((eventType) => (
                      <option key={eventType} value={eventType}>
                        {eventType}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="event_location" className="mb-1.5 block text-sm font-medium text-slate-700">
                    Location
                  </label>
                  <input
                    id="event_location"
                    name="location"
                    type="text"
                    defaultValue={duplicateEvent?.location ?? ""}
                    className="input-control min-h-11 sm:min-h-0"
                    placeholder="Leave blank to use TBD"
                    maxLength={160}
                  />
                </div>

                <div>
                  <label htmlFor="event_capacity" className="mb-1.5 block text-sm font-medium text-slate-700">
                    Capacity (optional)
                  </label>
                  <input
                    id="event_capacity"
                    name="capacity"
                    type="number"
                    min={1}
                    max={5000}
                    defaultValue={duplicateEvent?.capacity ?? ""}
                    className="input-control min-h-11 sm:min-h-0"
                    placeholder="Leave blank for unlimited"
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    When full, new “Yes” RSVPs are placed on a waitlist automatically.
                  </p>
                </div>

                <div>
                  <label htmlFor="event_description" className="mb-1.5 block text-sm font-medium text-slate-700">
                    Description
                  </label>
                  <textarea
                    id="event_description"
                    name="description"
                    rows={3}
                    defaultValue={duplicateEvent?.description ?? ""}
                    className="textarea-control min-h-[5.5rem] text-base sm:text-sm"
                    placeholder="Optional context for members"
                    maxLength={2000}
                  />
                </div>
              </div>
            </details>

            <FormDraftPersistence
              formId="create-event"
              storageKey={`clubhub:draft:event:${club.id}`}
              fields={[
                "title",
                "event_date",
                "event_type",
                "location",
                "capacity",
                "description",
                "recurrence_mode",
                "recurrence_frequency",
                "recurrence_end_type",
                "recurrence_count",
                "recurrence_until_date",
                "recurrence_end_time",
              ]}
              successSignal={query.eventSuccess}
            />

            <button type="submit" className="btn-primary min-h-11 w-full sm:min-h-0 sm:w-auto">
              {duplicateEvent ? "Publish duplicated event" : "Publish event"}
            </button>
          </form>
        </details>
      ) : null}

      {club.events.length === 0 ? (
        <div className="mt-4 rounded-lg border border-slate-200 bg-gradient-to-br from-indigo-50 to-slate-50 p-6">
          <p className="font-semibold text-slate-900">Schedule your first meeting</p>
          <p className="mt-1 text-sm text-slate-600">Create an event so members know when you&#39;re meeting and can RSVP.</p>
          {canCreateEvents && (
            <ScrollToInputButton inputSelector='input[id="event_title"]' className="btn-secondary mt-3">
              Create First Event
            </ScrollToInputButton>
          )}
        </div>
      ) : (
        <div className="list-stack mt-8 space-y-12">
          {showReviewCues && recentNeedingReview > 0 && !filterNeedsReview ? (
            <div className="rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50/60 p-5 shadow-sm">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-bold uppercase tracking-wider text-amber-900">Recently happened — follow-up</p>
                  <p className="mt-1 text-sm text-amber-950/90">
                    {recentNeedingReview} event{recentNeedingReview === 1 ? "" : "s"} in the last {RECENTLY_HAPPENED_DAYS} days may need your attention.
                  </p>
                  <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-medium text-amber-900/85">
                    {recentReviewStats.attendance > 0 ? <li>{recentReviewStats.attendance} without attendance recorded</li> : null}
                    {recentReviewStats.reflection > 0 ? <li>{recentReviewStats.reflection} without a reflection</li> : null}
                    {recentReviewStats.lowRsvp > 0 ? <li>{recentReviewStats.lowRsvp} with low RSVP turnout</li> : null}
                  </ul>
                </div>
                <Link
                  href={`/clubs/${club.id}/events?filter=needs-review#recent`}
                  className="btn-secondary flex min-h-11 w-full shrink-0 items-center justify-center border-amber-300 bg-white text-amber-950 hover:bg-amber-50 sm:min-h-0 sm:w-auto"
                >
                  View needs review
                </Link>
              </div>
            </div>
          ) : null}

          {sectionShell(
            "upcoming",
            "Upcoming",
            "Events scheduled in the future — RSVP and prepare ahead of time.",
            upcomingFiltered.length === 0 ? (
              <EmptyState
                icon="ti-calendar-event"
                title="Nothing scheduled"
                description={
                  canCreateEvents
                    ? "Schedule your first meeting so members can RSVP."
                    : "No upcoming events. Officers can create one anytime."
                }
                action={
                  canCreateEvents
                    ? { label: "Create event", href: `#create-event` }
                    : undefined
                }
              />
            ) : (
              <div className="space-y-4">
                {upcomingFiltered.map((event) => (
                  <ClubEventCardFull key={event.id} {...cardPropsBase} event={event} />
                ))}
              </div>
            ),
          )}

          {sectionShell(
            "recent",
            "Recently happened",
            `Ended in the last ${RECENTLY_HAPPENED_DAYS} days — finish attendance, reflections, and quick review while it is fresh.`,
            recentFiltered.length === 0 ? (
              <PageEmptyState
                title={filterNeedsReview ? "No recent events match this filter" : "No events in the recent window"}
                copy={filterNeedsReview
                  ? "Try clearing the needs-review filter."
                  : "Past events move here right after they end."}
                action={
                  filterNeedsReview ? (
                    <Link href={`/clubs/${club.id}/events#recent`} className="btn-secondary">
                      Clear filter
                    </Link>
                  ) : (
                    <Link href={`/clubs/${club.id}/events#upcoming`} className="btn-secondary">
                      View upcoming events
                    </Link>
                  )
                }
              />
            ) : (
              <div className="space-y-4">
                {recentFiltered.map((event) => {
                  const flags = getEventReviewFlags(event, now, {
                    canMarkAttendance,
                    canManageReflections,
                    memberCount,
                  });
                  return (
                    <div key={event.id} className="space-y-2">
                      {showReviewCues && eventNeedsOfficerReview(flags) ? (
                        <div className="rounded-lg border border-amber-200/70 bg-amber-50/40 px-3 py-2 text-xs text-amber-950/95">
                          <span className="font-medium text-amber-900">Follow-up: </span>
                          <span className="text-amber-900/90">
                            {[
                              flags.needsAttendanceFollowUp ? "attendance not recorded" : null,
                              flags.needsReflectionFollowUp ? "no reflection yet" : null,
                              flags.hasLowRsvpTurnout ? "low RSVP turnout" : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </div>
                      ) : null}
                      <ClubEventCardFull {...cardPropsBase} event={event} />
                    </div>
                  );
                })}
              </div>
            ),
          )}

          {sectionShell(
            "history",
            "Past events",
            "Older completed events — expand a row for full detail, RSVP context, and officer tools.",
            pastFiltered.length === 0 ? (
              <PageEmptyState
                title={filterNeedsReview ? "No older past events match this filter" : "No older events yet"}
                copy={filterNeedsReview ? "Try clearing the needs-review filter." : "Completed events will appear here as your history grows."}
                action={
                  <Link href={`/clubs/${club.id}/events/history`} className="btn-secondary">
                    Open event history
                  </Link>
                }
              />
            ) : (
              <div className="space-y-3">
                {pastFiltered.slice(0, 25).map((event) => (
                  <ClubEventPastFoldable key={event.id} {...cardPropsBase} event={event} />
                ))}
                {pastFiltered.length > 25 ? (
                  <p className="text-center text-sm text-slate-600">
                    Showing 25 of {pastFiltered.length} past events.{" "}
                    <Link href={`/clubs/${club.id}/events/history`} className="font-semibold text-blue-700 underline">
                      Open full event history
                    </Link>
                    {canViewInsights ? (
                      <>
                        {" "}
                        ·{" "}
                        <Link href={`/clubs/${club.id}/insights`} className="font-semibold text-blue-700 underline">
                          Club insights
                        </Link>
                      </>
                    ) : null}
                  </p>
                ) : (
                  <p className="text-center text-sm text-slate-500">
                    <Link href={`/clubs/${club.id}/events/history`} className="font-semibold text-blue-700 underline">
                      Full event history
                    </Link>
                    {canViewInsights ? (
                      <>
                        {" "}
                        ·{" "}
                        <Link href={`/clubs/${club.id}/insights`} className="font-semibold text-blue-700 underline">
                          Club insights
                        </Link>
                      </>
                    ) : null}
                  </p>
                )}
              </div>
            ),
          )}
        </div>
      )}
    </div>
  );
}
