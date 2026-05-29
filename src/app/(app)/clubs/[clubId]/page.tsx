import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserPermissions } from "@/lib/rbac/permissions";
import { ClubAttentionNeededSection } from "@/components/ui/club-attention-needed-section";
import { ActivityFeed } from "@/components/ui/activity-feed";
import { EventMetaRow } from "@/components/ui/event-summary";
import { getClubDetailForOverviewForCurrentUser } from "@/lib/clubs/queries";
import { getMyClubTasks } from "@/lib/tasks/queries";
import { CardSection, PageEmptyState, SectionHeader } from "@/components/ui/page-patterns";
import { getClubActivityFeed } from "@/lib/activity/queries";
import { ActionFeedbackBanner } from "@/components/ui/action-feedback-banner";

type ClubOverviewPageProps = {
  params: Promise<{ clubId: string }>;
  searchParams: Promise<{ setupSuccess?: string }>;
};

type SetupStep = {
  id: string;
  phase: "activation" | "optimization";
  title: string;
  description: string;
  done: boolean;
  href: string;
  cta: string;
  optional?: boolean;
};

export default async function ClubOverviewPage({ params, searchParams }: ClubOverviewPageProps) {
  const { clubId } = await params;
  const query = await searchParams;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [club, userPermissions, myTasks, activityItems, roleRowsResult, memberRoleRowsResult] = await Promise.all([
    getClubDetailForOverviewForCurrentUser(clubId),
    getUserPermissions(user.id, clubId),
    getMyClubTasks(clubId, user.id),
    getClubActivityFeed(clubId, 10),
    supabase.from("club_roles").select("id, name, is_system").eq("club_id", clubId),
    supabase.from("member_roles").select("role_id").eq("club_id", clubId),
  ]);

  if (!club) {
    notFound();
  }

  // Derive permission booleans for UI control visibility.
  const canInviteMembers = userPermissions.has("members.invite");
  const canCreateEvents = userPermissions.has("events.create");
  const canPostAnnouncements = userPermissions.has("announcements.create");
  const canMarkAttendance = userPermissions.has("attendance.mark");
  // Show management alerts when the user has at least one management-facing permission.
  const showManagementAlerts = canCreateEvents || canPostAnnouncements || canMarkAttendance;

  const memberCount = club.memberCount;
  const now = new Date();
  const nextEvent = [...club.events]
    .filter((event) => event.eventDateRaw.getTime() > now.getTime())
    .sort((a, b) => a.eventDateRaw.getTime() - b.eventDateRaw.getTime())[0] ?? null;
  const latestAnnouncement = club.announcements[0] ?? null;
  const hasClubDescription = club.description.trim().length > 0 && club.description !== "A student club on ClubHub.";
  const hasMeetingDetails = club.events.some(
    (event) => event.location.trim().length > 0 && event.location.trim().toLowerCase() !== "tbd",
  );
  const hasInterestsConfigured =
    club.memberTagDefinitions.length > 0
    || club.members.some((member) => member.skillInterestEntries.some((entry) => entry.kind === "interest"));
  const roleRows = (roleRowsResult.data ?? []) as Array<{ id: string; name: string; is_system: boolean }>;
  const memberRoleRows = (memberRoleRowsResult.data ?? []) as Array<{ role_id: string }>;
  const rolesById = new Map(roleRows.map((role) => [role.id, role]));
  const hasLeadershipRolesAssigned = memberRoleRows.some((assignment) => {
    const role = rolesById.get(assignment.role_id);
    if (!role) return false;
    return role.name.trim().toLowerCase() !== "president";
  });
  const hasAdvisorAssigned = memberRoleRows.some((assignment) => {
    const role = rolesById.get(assignment.role_id);
    if (!role) return false;
    return role.name.trim().toLowerCase() === "advisor";
  });

  const setupSteps: SetupStep[] = [
    {
      id: "invite-members",
      phase: "activation",
      title: "Invite your first members",
      description: "Bring in your first members so the club immediately feels real and social.",
      done: memberCount > 1,
      href: `/clubs/${club.id}/members#invite-members`,
      cta: "Invite members",
    },
    {
      id: "create-event",
      phase: "activation",
      title: "Create your first event",
      description: "Schedule your first meeting to kick off RSVPs and momentum.",
      done: club.events.length > 0,
      href: `/clubs/${club.id}/events#create-event`,
      cta: "Create event",
    },
    {
      id: "post-announcement",
      phase: "activation",
      title: "Post your first announcement",
      description: "Share a welcome update so members know what happens next.",
      done: club.announcements.length > 0,
      href: `/clubs/${club.id}/announcements#post-announcement`,
      cta: "Post announcement",
    },
    {
      id: "meeting-info",
      phase: "optimization",
      title: "Set meeting time and location",
      description: "Add reliable meeting details so members know when and where to show up.",
      done: hasMeetingDetails,
      href: `/clubs/${club.id}/events#create-event`,
      cta: "Set meeting info",
    },
    {
      id: "join-policy",
      phase: "optimization",
      title: "Define how members can join",
      description: `Join mode is currently ${club.requireJoinApproval ? "approval required" : "open via join code"}.`,
      done: typeof club.requireJoinApproval === "boolean",
      href: `/clubs/${club.id}/settings/club`,
      cta: "Review join policy",
    },
    {
      id: "description",
      phase: "optimization",
      title: "Add club purpose and description",
      description: "Write a clear summary so students understand your club at a glance.",
      done: hasClubDescription,
      href: `/clubs/${club.id}/settings/club`,
      cta: "Edit description",
    },
    {
      id: "tags",
      phase: "optimization",
      title: "Add interests and tags",
      description: "Label interests or tags to better organize and match members.",
      done: hasInterestsConfigured,
      href: `/clubs/${club.id}/members`,
      cta: "Manage tags",
    },
    {
      id: "leadership-roles",
      phase: "optimization",
      title: "Assign leadership roles",
      description: "Delegate responsibilities by assigning at least one non-president role.",
      done: hasLeadershipRolesAssigned,
      href: `/clubs/${club.id}/settings`,
      cta: "Assign roles",
    },
    {
      id: "advisor",
      phase: "optimization",
      title: "Add a faculty advisor",
      description: "Assign an advisor role once your faculty advisor joins your roster.",
      done: hasAdvisorAssigned,
      href: `/clubs/${club.id}/settings`,
      cta: "Set advisor",
      optional: true,
    },
  ];
  const activationSteps = setupSteps.filter((step) => step.phase === "activation");
  const optimizationSteps = setupSteps.filter((step) => step.phase === "optimization");
  const coreSetupSteps = setupSteps.filter((step) => !step.optional);
  const setupDone = coreSetupSteps.filter((step) => step.done).length;
  const setupPercent = coreSetupSteps.length > 0 ? Math.round((setupDone / coreSetupSteps.length) * 100) : 0;
  const showSetupChecklist = query.setupSuccess || setupDone < coreSetupSteps.length;
  const nextRecommendedStep = setupSteps.find((step) => !step.done);

  if (query.setupSuccess) {
    console.info("[analytics:club-onboarding:landing]", {
      clubId: club.id,
      userId: user.id,
      setupDone,
      setupTrackableTotal: coreSetupSteps.length,
      setupPercent,
      activationDone: activationSteps.filter((step) => step.done).length,
      activationTotal: activationSteps.length,
      optimizationDone: optimizationSteps.filter((step) => step.done).length,
      optimizationTotal: optimizationSteps.length,
      memberCount,
      announcementsCount: club.announcements.length,
      eventsCount: club.events.length,
      requireJoinApproval: club.requireJoinApproval,
      stepStatus: Object.fromEntries(setupSteps.map((step) => [step.id, step.done])),
    });
  }

  return (
    <div className="page-sections page-sections--loose">
      {canInviteMembers || canCreateEvents ? (
        <div className="flex flex-wrap gap-2">
          {canInviteMembers ? (
            <Link href={`/clubs/${club.id}/members#invite-members`} className="btn-primary">
              Invite Members
            </Link>
          ) : null}
          {canCreateEvents ? (
            <Link href={`/clubs/${club.id}/events#create-event`} className="btn-secondary">
              Create Event
            </Link>
          ) : null}
        </div>
      ) : null}

      {query.setupSuccess ? (
        <ActionFeedbackBanner
          variant="success"
          title="Club created successfully"
          message="Next step: complete your setup checklist so students can find, join, and understand your club quickly."
          actions={
            <>
              {canInviteMembers ? (
                <Link href={`/clubs/${club.id}/members#invite-members`} className="btn-primary text-xs">
                  Invite members
                </Link>
              ) : null}
              {canPostAnnouncements ? (
                <Link href={`/clubs/${club.id}/announcements#post-announcement`} className="btn-secondary text-xs">
                  Post announcement
                </Link>
              ) : null}
              {canCreateEvents ? (
                <Link href={`/clubs/${club.id}/events#create-event`} className="btn-secondary text-xs">
                  Create event
                </Link>
              ) : null}
            </>
          }
        />
      ) : null}

      <CardSection className="bg-gradient-to-br from-slate-50 to-blue-50/40">
        <SectionHeader
          kicker="Snapshot"
          title="Club status at a glance"
          description="Members, your role, and activity state."
        />
        <div className="mt-4 grid grid-cols-3 gap-2 sm:mt-6 sm:grid-cols-3 sm:gap-4 md:gap-6">
            <div className="flex items-center gap-2 rounded-lg border border-white/60 bg-white/50 px-2 py-2 sm:gap-3 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 sm:h-12 sm:w-12">
                <svg className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                </svg>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 sm:text-sm sm:normal-case sm:tracking-normal">Members</p>
                <p className="text-lg font-bold tabular-nums text-slate-900 sm:text-xl">{memberCount}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 rounded-lg border border-white/60 bg-white/50 px-2 py-2 sm:gap-3 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-100 sm:h-12 sm:w-12">
                <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 sm:text-sm sm:normal-case sm:tracking-normal">Role</p>
                <p className="truncate text-lg font-bold capitalize text-slate-900 sm:text-xl">{club.currentUserRole}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 rounded-lg border border-white/60 bg-white/50 px-2 py-2 sm:gap-3 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-purple-100 sm:h-12 sm:w-12">
                <svg className="h-6 w-6 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 sm:text-sm sm:normal-case sm:tracking-normal">Status</p>
                <p className="text-lg font-bold text-slate-900 sm:text-xl">
                  {club.events.length > 0 ? "Active" : "Starting"}
                </p>
              </div>
            </div>
          </div>
      </CardSection>

      {showSetupChecklist ? (
        <CardSection>
          <SectionHeader
            kicker="Getting started"
            title="Set up your club"
            description="Complete these steps to get your club running smoothly."
            action={<span className="badge-soft">{setupDone}/{coreSetupSteps.length} complete</span>}
          />
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-[width] duration-300"
              style={{ width: `${setupPercent}%` }}
            />
          </div>
          <div className="mt-4 rounded-xl border border-violet-200 bg-violet-50/40 p-3 sm:p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-violet-700">Phase 1 - Activation</p>
            <p className="mt-1 text-sm text-slate-700">Most important first: activate your club with members, events, and communication.</p>
            <ul className="mt-3 space-y-2">
              {activationSteps.map((step) => {
                const isNext = nextRecommendedStep?.id === step.id;
                return (
                  <li
                    key={step.id}
                    className={`flex items-start justify-between gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
                      isNext ? "border-violet-300 bg-white" : "border-slate-200 bg-white/90"
                    }`}
                  >
                    <div className="min-w-0">
                      <p className={`text-sm font-semibold ${step.done ? "text-slate-500 line-through" : "text-slate-900"}`}>
                        {step.title}
                        {isNext && !step.done ? (
                          <span className="ml-2 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-700">
                            Next
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-600">{step.description}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {step.done ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">Done</span>
                      ) : null}
                      <Link href={step.href} className={step.done ? "btn-secondary text-xs" : "btn-primary text-xs"}>
                        {step.done ? "Review" : step.cta}
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          <details className="mt-3 rounded-xl border border-slate-200 bg-slate-50/60">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-slate-900 [&::-webkit-details-marker]:hidden">
              <span>Phase 2 - Optimization (optional depth)</span>
              <span className="text-xs font-medium text-slate-500">Skip for now</span>
            </summary>
            <div className="border-t border-slate-200 px-3 py-3 sm:px-4">
              <ul className="space-y-2">
                {optimizationSteps.map((step) => {
                  const isNext = nextRecommendedStep?.id === step.id;
                  return (
                    <li
                      key={step.id}
                      className={`flex items-start justify-between gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
                        isNext ? "border-blue-300 bg-white" : "border-slate-200 bg-white/80"
                      }`}
                    >
                      <div className="min-w-0">
                        <p className={`text-sm font-semibold ${step.done ? "text-slate-500 line-through" : "text-slate-900"}`}>
                          {step.title}
                          {step.optional ? (
                            <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                              Optional
                            </span>
                          ) : null}
                          {isNext && !step.done ? (
                            <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-blue-700">
                              Next
                            </span>
                          ) : null}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-600">{step.description}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {step.done ? (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">Done</span>
                        ) : null}
                        <Link href={step.href} className="btn-secondary text-xs">
                          {step.done ? "Edit" : step.cta}
                        </Link>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </details>
        </CardSection>
      ) : null}

      {/* Important now — lighter tiles on mobile */}
      <CardSection className="shadow-sm lg:shadow-[var(--shadow-soft)]">
        <SectionHeader
          kicker="Now"
          title="What matters"
          description="Next event, latest announcement, task load, and quick health signals."
        />

        <div className="mt-3 grid grid-cols-1 gap-2 sm:mt-4 sm:grid-cols-2 sm:gap-3 lg:grid-cols-4 lg:gap-4">
          <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-3 sm:surface-subcard sm:border-l-4 sm:border-blue-500 sm:bg-white sm:p-4">
            <div className="flex items-start gap-2.5 sm:gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-100 sm:h-9 sm:w-9">
                <svg className="h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Next Event</p>
                <p className="mt-1 text-base font-semibold leading-snug text-slate-900">
                  {nextEvent ? nextEvent.title : "No upcoming events"}
                </p>
                {nextEvent ? (
                  <>
                    <p className="mt-0.5 text-xs text-slate-500">{nextEvent.eventType}</p>
                    <div className="mt-2">
                      <EventMetaRow at={nextEvent.eventDateRaw} location={nextEvent.location} compact />
                    </div>
                  </>
                ) : (
                  <p className="mt-1 text-xs text-slate-500">Schedule one on the Events page.</p>
                )}
              </div>
            </div>
          </div>

          {/* Latest announcement */}
          <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-3 sm:surface-subcard sm:border-l-4 sm:border-amber-500 sm:bg-white sm:p-4">
            <div className="flex items-start gap-2.5 sm:gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 sm:h-9 sm:w-9">
                <svg className="h-5 w-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Latest Announcement</p>
                <p className="mt-1 text-sm font-semibold text-slate-900 leading-snug">
                  {latestAnnouncement ? latestAnnouncement.title : "No announcements yet"}
                </p>
                {latestAnnouncement ? (
                  <p className="mt-1 text-xs text-slate-500 line-clamp-2">{latestAnnouncement.content}</p>
                ) : (
                  <p className="mt-1 text-xs text-slate-500">Post one on the Announcements page.</p>
                )}
              </div>
            </div>
          </div>

          {/* My Tasks */}
          <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-3 sm:surface-subcard sm:border-l-4 sm:border-emerald-500 sm:bg-white sm:p-4">
            <div className="flex items-start gap-2.5 sm:gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100 sm:h-9 sm:w-9">
                <svg className="h-5 w-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">My Tasks</p>
                {myTasks.length > 0 ? (
                  <>
                    <p className="mt-1 text-sm font-semibold text-slate-900 leading-snug">
                      {myTasks.length} open task{myTasks.length !== 1 ? "s" : ""}
                    </p>
                    <p className="mt-1 text-xs text-slate-500 truncate">
                      {myTasks.filter((t) => t.isOverdue).length > 0
                        ? `${myTasks.filter((t) => t.isOverdue).length} overdue`
                        : myTasks[0]?.title}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="mt-1 text-sm font-semibold text-slate-900 leading-snug">All caught up</p>
                    <p className="mt-1 text-xs text-slate-500">No tasks assigned to you.</p>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Key stats */}
          <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-3 sm:surface-subcard sm:border-l-4 sm:border-purple-500 sm:bg-white sm:p-4">
            <div className="flex items-start gap-2.5 sm:gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100 sm:h-9 sm:w-9">
                <svg className="h-5 w-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Key Stats</p>
                <p className="mt-1 text-sm font-semibold text-slate-900 leading-snug">
                  {club.events.length} events · {club.announcements.length} updates
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {club.totalTrackedEvents} tracked · {club.clubAverageAttendance}% avg attendance
                </p>
              </div>
            </div>
          </div>
        </div>
      </CardSection>

      <CardSection>
        <SectionHeader
          kicker="Tools"
          title="Secondary workspace tools"
          description="Power features stay available without crowding the main overview."
        />
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <Link
            href={`/clubs/${club.id}/tasks`}
            className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2.5 text-sm font-medium text-slate-800 transition hover:bg-slate-100"
          >
            Tasks {myTasks.length > 0 ? `(${myTasks.length} open)` : ""}
          </Link>
          <Link
            href={`/clubs/${club.id}/members/volunteer-hours`}
            className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2.5 text-sm font-medium text-slate-800 transition hover:bg-slate-100"
          >
            Volunteer hours
          </Link>
        </div>
        {myTasks.length === 0 ? (
          <div className="mt-3">
            <PageEmptyState title="No open tasks" copy="You can still open Tasks to create or review assignments." />
          </div>
        ) : null}
      </CardSection>

      {/* Attention Needed — shown to users with management permissions */}
      {showManagementAlerts && (
        <ClubAttentionNeededSection clubId={club.id} alerts={club.attentionAlerts} />
      )}

      {/* Recent Activity — visible to all members */}
      <ActivityFeed
        items={activityItems.slice(0, 8)}
        title="Recent activity"
        description="Latest actions in this club."
        viewMoreHref="/activity"
        emptyIcon="ti-activity"
        emptyTitle="No activity yet"
        emptyDescription="As members RSVP and officers post updates, activity shows up here."
      />
    </div>
  );
}
