import Link from "next/link";
import { formatEventDateAndTime, parseEventInstant } from "@/lib/events/format-event-display";
import type { PublicClubPagePayload } from "@/lib/clubs/public-club-page";

type PublicClubPageViewProps = {
  data: PublicClubPagePayload;
  viewerIsAuthenticated: boolean;
};

const sectionHeadingClass =
  "text-sm font-semibold uppercase tracking-wide text-slate-800";

function clubInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  }
  return name.trim().slice(0, 2).toUpperCase() || "CL";
}

export function PublicClubPageView({ data, viewerIsAuthenticated }: PublicClubPageViewProps) {
  const { clubId, name, description, requireJoinApproval, status, upcomingEvents } = data;
  const isArchived = status === "archived";
  const joinTarget = `/clubs/join?clubId=${encodeURIComponent(clubId)}`;

  const nextMeeting = upcomingEvents.find((e) => e.eventType === "Meeting");
  const hasDescription = Boolean(description.trim());

  const primaryCtaLabel = viewerIsAuthenticated
    ? requireJoinApproval
      ? "Request to join"
      : "Join this club"
    : requireJoinApproval
      ? "Sign in to request access"
      : "Sign in to join";

  return (
    <article className="space-y-6 sm:space-y-8">
      <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm">
        <header
          className="relative flex min-h-[11rem] items-end bg-gradient-to-br from-indigo-600 via-violet-600 to-emerald-600 px-4 pb-6 pt-12 sm:min-h-[13rem] sm:px-8 sm:pb-8 sm:pt-14"
          aria-labelledby="public-club-title"
        >
          <div
            className="pointer-events-none absolute inset-0 opacity-25 bg-[radial-gradient(800px_220px_at_15%_-10%,rgb(255_255_255/0.35),transparent_55%)]"
            aria-hidden
          />
          <div className="relative flex w-full flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex min-w-0 items-end gap-3 sm:gap-4">
              <div
                className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-white/25 bg-white/15 text-xl font-bold text-white shadow-lg backdrop-blur-sm sm:h-20 sm:w-20 sm:text-2xl"
                aria-hidden
              >
                {clubInitials(name)}
              </div>
              <div className="min-w-0 pb-0.5">
                <p className="text-xs font-semibold uppercase tracking-wider text-white/85">Club on Clubora</p>
                <h1 id="public-club-title" className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl md:text-4xl">
                  {name}
                </h1>
              </div>
            </div>
          </div>
        </header>

        <div className="space-y-7 px-4 py-7 sm:space-y-8 sm:px-8 sm:py-9">
          {isArchived ? (
            <div
              className="rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-4 text-sm text-amber-950 sm:px-5"
              role="status"
            >
              <p className="font-semibold text-amber-950">This club is archived.</p>
              <p className="mt-1.5 leading-relaxed text-amber-950/90">
                It is not accepting new members on Clubora. If you think this is a mistake, contact your school or club
                officers.
              </p>
              <p className="mt-4">
                <Link
                  href="/"
                  className="inline-flex min-h-10 items-center justify-center rounded-lg border border-amber-300/80 bg-white px-4 text-sm font-semibold text-amber-950 shadow-sm transition hover:bg-amber-50"
                >
                  Clubora home
                </Link>
              </p>
            </div>
          ) : null}

          <section aria-labelledby="public-club-about-heading">
            <h2 id="public-club-about-heading" className={sectionHeadingClass}>
              About
            </h2>
            {hasDescription ? (
              <div className="mt-3 whitespace-pre-wrap text-base leading-relaxed text-slate-700">{description}</div>
            ) : (
              <div
                className="mt-3 rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-4 text-sm leading-relaxed text-slate-600 sm:px-5"
                role="status"
              >
                <p className="font-medium text-slate-800">No description yet</p>
                <p className="mt-1">
                  Officers can add one in club settings so visitors know what this club is about before they join.
                </p>
              </div>
            )}
          </section>

          {!isArchived && nextMeeting ? (
            <section
              aria-labelledby="public-club-meeting-heading"
              className="rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-4 sm:px-5 sm:py-5"
            >
              <h2 id="public-club-meeting-heading" className={sectionHeadingClass}>
                Next meeting
              </h2>
              <h3 className="mt-3 text-base font-semibold text-slate-900">{nextMeeting.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
                {(() => {
                  const when = parseEventInstant(nextMeeting.eventDateIso);
                  const { date, time } = formatEventDateAndTime(when);
                  return (
                    <>
                      <span className="sr-only">When and where: </span>
                      {date}
                      {time ? ` · ${time}` : null}
                      {nextMeeting.location?.trim() ? ` · ${nextMeeting.location.trim()}` : null}
                    </>
                  );
                })()}
              </p>
            </section>
          ) : null}

          {!isArchived ? (
            <section aria-labelledby="public-club-events-heading">
              <h2 id="public-club-events-heading" className={sectionHeadingClass}>
                Upcoming events
              </h2>
              {upcomingEvents.length > 0 ? (
                <>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">
                    Dates and titles shown here are a public snapshot. Full details may be available inside the club
                    after you join.
                  </p>
                  <ul className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-100 bg-white">
                    {upcomingEvents.map((ev) => {
                      const when = parseEventInstant(ev.eventDateIso);
                      const { date, time } = formatEventDateAndTime(when);
                      return (
                        <li
                          key={ev.id}
                          className="flex flex-col gap-1.5 px-4 py-3.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4 sm:px-5 sm:py-4"
                        >
                          <div className="min-w-0">
                            <h3 className="text-base font-semibold text-slate-900">{ev.title}</h3>
                            <p className="mt-1 text-sm leading-relaxed text-slate-600">
                              <span className="sr-only">When and where: </span>
                              {date}
                              {time ? ` · ${time}` : null}
                              {ev.location?.trim() ? ` · ${ev.location.trim()}` : null}
                            </p>
                          </div>
                          <span className="shrink-0 self-start rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold leading-none text-slate-700">
                            {ev.eventType}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </>
              ) : (
                <div
                  className="mt-3 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-4 text-sm leading-relaxed text-slate-600 sm:px-5"
                  role="status"
                >
                  <p className="font-medium text-slate-800">Nothing on the calendar yet</p>
                  <p className="mt-1">
                    When officers add future events in Clubora, the next ones will show up here for people browsing this
                    page.
                  </p>
                </div>
              )}
            </section>
          ) : null}

          {!isArchived ? (
            <section
              className="rounded-2xl border border-emerald-200/90 bg-gradient-to-br from-emerald-50/90 to-white px-4 py-6 sm:px-7 sm:py-7"
              aria-labelledby="public-club-join-heading"
              aria-describedby="public-club-join-summary"
            >
              <h2 id="public-club-join-heading" className="text-lg font-semibold tracking-tight text-slate-900 sm:text-xl">
                Join on Clubora
              </h2>
              <p id="public-club-join-summary" className="mt-2 text-sm leading-relaxed text-slate-700">
                {requireJoinApproval ? (
                  <>
                    <span className="font-semibold text-slate-900">Approval required.</span> Sign in with your school
                    email, submit a request, and wait for an officer to approve you before you appear on the member list.
                  </>
                ) : (
                  <>
                    <span className="font-semibold text-slate-900">Open join.</span> Sign in with your school email,
                    confirm on the join screen, and you become a member right away.
                  </>
                )}
              </p>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                {viewerIsAuthenticated ? (
                  <>
                    <Link
                      href={joinTarget}
                      className="btn-primary inline-flex min-h-11 w-full items-center justify-center px-6 text-center text-base font-semibold sm:w-auto"
                    >
                      {primaryCtaLabel}
                    </Link>
                    <Link
                      href="/clubs"
                      className="btn-secondary inline-flex min-h-11 w-full items-center justify-center px-6 text-center text-base font-semibold sm:w-auto"
                    >
                      Your clubs
                    </Link>
                  </>
                ) : (
                  <>
                    <Link
                      href={`/login?next=${encodeURIComponent(joinTarget)}`}
                      className="btn-primary inline-flex min-h-11 w-full items-center justify-center px-6 text-center text-base font-semibold sm:w-auto"
                    >
                      {primaryCtaLabel}
                    </Link>
                    <Link
                      href={`/signup?next=${encodeURIComponent(joinTarget)}`}
                      className="btn-secondary inline-flex min-h-11 w-full items-center justify-center px-6 text-center text-base font-semibold sm:w-auto"
                    >
                      Create account
                    </Link>
                  </>
                )}
              </div>
              <p className="mt-5 text-xs leading-relaxed text-slate-500">
                Use the school email your club expects. On the join screen, enter the join code your club shared with
                you to become a member.
              </p>
            </section>
          ) : null}
        </div>
      </div>
    </article>
  );
}
