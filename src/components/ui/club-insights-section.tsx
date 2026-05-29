import Link from "next/link";
import type { ClubDetail } from "@/lib/clubs/queries";
import { DisclosurePanel } from "@/components/ui/disclosure-panel";
import { InsightsExportButton } from "@/components/ui/insights-export-button";
import { CardSection, PageEmptyState, SectionHeader } from "@/components/ui/page-patterns";
import { getMemberRosterDisplayName, getMemberRosterInitials } from "@/lib/member-display";
import { computeClubInsights } from "@/lib/clubs/insights";
import type { InsightsExportPayload } from "@/lib/clubs/insights-export";
import type { TrendDirection, EngagementTier } from "@/lib/clubs/insights";

type ClubInsightsSectionProps = {
  club: ClubDetail;
  canExportInsights?: boolean;
  exportPayload?: InsightsExportPayload | null;
};

// ─── Small helpers ────────────────────────────────────────────────────────────

function trendBadgeClass(dir: TrendDirection): string {
  if (dir === "improving") return "feedback-pill feedback-pill-success";
  if (dir === "declining") return "feedback-pill feedback-pill-urgent";
  return "badge-soft";
}

function trendLabel(dir: TrendDirection, delta: number): string {
  if (dir === "improving") return `↑ Improving (+${delta}pp)`;
  if (dir === "declining") return `↓ Declining (${delta}pp)`;
  if (dir === "stable") return "→ Stable";
  return "Need more data";
}

function trendNarrative(dir: TrendDirection, delta: number): string {
  if (dir === "improving") return `Recent events average about ${Math.abs(delta)} points higher than earlier ones — momentum is building.`;
  if (dir === "declining") return `Later events are averaging lower turnout than earlier ones — worth revisiting timing or reminders.`;
  if (dir === "stable") return "Turnout has held in a similar band across tracked events.";
  return "Track a few more past events to compare early vs recent turnout.";
}

function averageAttendanceMeaning(rate: number): string {
  if (rate >= 70) return "Members are showing up consistently — a healthy signal for the club.";
  if (rate >= 40) return "Typical for many clubs; small nudges (reminders, format) often move this up.";
  return "Turnout is on the low side — good moment to experiment with format or outreach.";
}

function rateBarColor(rate: number): string {
  if (rate >= 70) return "bg-emerald-500";
  if (rate >= 40) return "bg-amber-400";
  return "bg-rose-400";
}

function tierBarColor(tier: EngagementTier): string {
  if (tier === "high") return "bg-emerald-500";
  if (tier === "moderate") return "bg-amber-400";
  return "bg-rose-400";
}

function tierBgClass(tier: EngagementTier): string {
  if (tier === "high") return "bg-emerald-50 border-emerald-100";
  if (tier === "moderate") return "bg-amber-50 border-amber-100";
  return "bg-rose-50 border-rose-100";
}

function tierTextClass(tier: EngagementTier): string {
  if (tier === "high") return "text-emerald-800";
  if (tier === "moderate") return "text-amber-800";
  return "text-rose-800";
}

function tierCountClass(tier: EngagementTier): string {
  if (tier === "high") return "text-emerald-700";
  if (tier === "moderate") return "text-amber-700";
  return "text-rose-700";
}

type SummaryMetricProps = {
  label: string;
  value: string;
  hint: string;
  emphasize?: boolean;
};

function SummaryMetricTile({ label, value, hint, emphasize }: SummaryMetricProps) {
  return (
    <div
      className={`rounded-xl border px-4 py-3 shadow-sm backdrop-blur-sm sm:px-4 sm:py-4 ${
        emphasize
          ? "border-emerald-200/90 bg-white/90 ring-1 ring-emerald-100/80"
          : "border-slate-200/80 bg-white/75"
      }`}
    >
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className="mt-1.5 text-2xl font-bold tracking-tight text-slate-900 sm:text-[1.65rem]">{value}</p>
      <p className="mt-2 text-xs leading-relaxed text-slate-600">{hint}</p>
    </div>
  );
}

function InlineEmptyState({
  title,
  body,
  icon,
}: {
  title: string;
  body: string;
  icon: "chart" | "users" | "layers";
}) {
  const paths = {
    chart: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
    users:
      "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z",
    layers:
      "M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z",
  };
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-slate-200/95 bg-gradient-to-b from-slate-50/90 to-white/60 px-5 py-8 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-500">
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d={paths[icon]} />
        </svg>
      </div>
      <p className="mt-3 text-sm font-semibold text-slate-800">{title}</p>
      <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-slate-600">{body}</p>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ClubInsightsSection({
  club,
  canExportInsights = false,
  exportPayload = null,
}: ClubInsightsSectionProps) {
  const insights = computeClubInsights(club);
  const hasData = club.totalTrackedEvents > 0;
  const highlyEngaged = club.members.filter((m) => m.attendanceRate >= 70).length;
  const eventsLabel = club.totalTrackedEvents === 1 ? "event" : "events";
  const showExport = canExportInsights && exportPayload && hasData;

  return (
    <section id="club-insights" className="page-sections page-sections--loose">
      {showExport ? (
        <div className="flex justify-end">
          <InsightsExportButton payload={exportPayload} />
        </div>
      ) : null}

      <CardSection className="bg-gradient-to-br from-white via-slate-50/90 to-emerald-50/70">
        {hasData ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <SummaryMetricTile
                emphasize
                label="Average attendance"
                value={`${club.clubAverageAttendance}%`}
                hint={averageAttendanceMeaning(club.clubAverageAttendance)}
              />
              <SummaryMetricTile
                label="Tracked events"
                value={String(club.totalTrackedEvents)}
                hint={`Past ${eventsLabel} where attendance was recorded — this is what every chart below is based on.`}
              />
              <SummaryMetricTile
                label="Highly engaged"
                value={String(highlyEngaged)}
                hint={
                  highlyEngaged === 0
                    ? "No one at 70%+ yet — as you track more events, this usually clarifies."
                    : `${highlyEngaged === 1 ? "Member" : "Members"} at 70%+ of tracked events — your core group for energy and word of mouth.`
                }
              />
              <div
                className={`rounded-xl border px-4 py-3 shadow-sm backdrop-blur-sm sm:px-4 sm:py-4 ${
                  insights.trendDirection === "improving"
                    ? "border-emerald-200/90 bg-emerald-50/50"
                    : insights.trendDirection === "declining"
                      ? "border-rose-200/90 bg-rose-50/40"
                      : "border-slate-200/80 bg-white/75"
                }`}
              >
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Momentum</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className={trendBadgeClass(insights.trendDirection)}>{trendLabel(insights.trendDirection, insights.trendDelta)}</span>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-slate-600">
                  {trendNarrative(insights.trendDirection, insights.trendDelta)}
                </p>
              </div>
          </div>
        ) : (
          <PageEmptyState
            title="No tracked history yet"
            copy="Mark attendance on at least one past event to unlock trends, engagement segments, and format comparisons."
            action={
              <Link
                href={`/clubs/${club.id}/events#recent`}
                className="inline-flex min-h-11 items-center justify-center rounded-lg bg-slate-900 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
              >
                Mark attendance
              </Link>
            }
          />
        )}
      </CardSection>

      {!hasData ? null : (
        <>
          {insights.highlights.length > 0 ? (
            <CardSection className="lg:p-7">
              <SectionHeader
                kicker="At a glance"
                title="What to pay attention to"
                description="Plain-language takeaways from the same numbers below."
              />
              <ul className="mt-5 grid gap-3 sm:grid-cols-2">
                {insights.highlights.map((text, i) => (
                  <li
                    key={i}
                    className="flex gap-3 rounded-xl border border-emerald-100/90 bg-gradient-to-br from-emerald-50/90 to-white/80 p-4 shadow-sm"
                  >
                    <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-sm">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    </span>
                    <p className="text-sm leading-relaxed text-slate-700">{text}</p>
                  </li>
                ))}
              </ul>
            </CardSection>
          ) : null}

          {/* Attendance — primary chart surface */}
          <section className="card-surface p-5 sm:p-6 lg:p-7" aria-labelledby="insights-attendance-heading">
            <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
              <div className="min-w-0">
                <p className="section-kicker">Attendance</p>
                <h2 id="insights-attendance-heading" className="mt-1 text-lg font-semibold tracking-tight text-slate-900">
                  Turnout by event
                </h2>
                <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-600">
                  Each row is one tracked past event. The bar is present members vs current roster — useful for spotting which gatherings actually pulled people in.
                </p>
              </div>
              <span className={trendBadgeClass(insights.trendDirection)}>{trendLabel(insights.trendDirection, insights.trendDelta)}</span>
            </div>

            <div className="mt-5">
              {insights.trendPoints.length === 0 ? (
                <InlineEmptyState
                  icon="chart"
                  title="No per-event bars yet"
                  body="Tracked events will list here with a bar for each one. If you expected data, confirm attendance was saved on past events."
                />
              ) : insights.trendPoints.length < 3 ? (
                <>
                  <ul className="space-y-2.5" aria-label="Attendance by event">
                    {insights.trendPoints.map((point) => (
                      <li key={point.eventId}>
                        <TrendBar point={point} />
                      </li>
                    ))}
                  </ul>
                  <p className="mt-4 rounded-lg border border-amber-100 bg-amber-50/80 px-3 py-2.5 text-xs leading-relaxed text-amber-900">
                    <span className="font-semibold">Heads up:</span> trend direction unlocks after at least three tracked events so early noise does not skew the signal.
                  </p>
                </>
              ) : (
                <ul className="space-y-2.5" aria-label="Attendance by event">
                  {insights.trendPoints.map((point) => (
                    <li key={point.eventId}>
                      <TrendBar point={point} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          {/* Engagement + formats — paired analysis */}
          <section className="card-surface p-5 sm:p-6 lg:p-7" aria-labelledby="insights-engagement-heading">
            <div className="border-b border-slate-100 pb-4">
              <p className="section-kicker">Engagement & formats</p>
              <h2 id="insights-engagement-heading" className="mt-1 text-lg font-semibold tracking-tight text-slate-900">
                Where energy sits
              </h2>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-600">
                Compare event types side by side with how members fall into engagement bands — pairing these usually suggests the next experiment (format vs outreach).
              </p>
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-5 shadow-inner sm:p-6">
                <div className="section-card-header">
                  <div>
                    <p className="section-kicker">By format</p>
                    <h3 className="mt-1 text-base font-semibold tracking-tight text-slate-900">Event type effectiveness</h3>
                    <p className="mt-1 text-sm leading-relaxed text-slate-600">
                      Average attendance rate per event type across tracked events — use it to double down on formats that already work for your club.
                    </p>
                  </div>
                  <span className="badge-soft">
                    {insights.eventTypeRows.length} {insights.eventTypeRows.length === 1 ? "type" : "types"}
                  </span>
                </div>

                {insights.eventTypeRows.length === 0 ? (
                  <div className="mt-5">
                    <InlineEmptyState
                      icon="layers"
                      title="No type mix to compare"
                      body="After several tracked events with types assigned, averages appear here so you can see which formats resonate."
                    />
                  </div>
                ) : (
                  <div className="mt-5 space-y-4">
                    {insights.eventTypeRows.map((row, index) => (
                      <div key={row.type}>
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                            {index === 0 && insights.eventTypeRows.length > 1 ? (
                              <span className="inline-flex shrink-0 items-center rounded-full border border-emerald-200 bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                                Strongest
                              </span>
                            ) : null}
                            <span className="truncate text-sm font-semibold text-slate-800">{row.type}</span>
                            <span className="text-xs text-slate-400">
                              {row.eventCount} {row.eventCount === 1 ? "event" : "events"}
                            </span>
                          </div>
                          <span className="text-sm font-bold tabular-nums text-slate-900">{row.avgRate}%</span>
                        </div>
                        <div className="h-2.5 overflow-hidden rounded-full bg-white shadow-inner ring-1 ring-slate-100">
                          <div
                            className={`h-full rounded-full transition-[width] duration-500 ${rateBarColor(row.avgRate)}`}
                            style={{ width: `${row.avgRate}%` }}
                          />
                        </div>
                      </div>
                    ))}
                    {insights.eventTypeRows.length === 1 ? (
                      <p className="text-xs leading-relaxed text-slate-500">Run a second event type to unlock side-by-side comparison.</p>
                    ) : null}
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-5 shadow-inner sm:p-6">
                <div className="section-card-header">
                  <div>
                    <p className="section-kicker">By member</p>
                    <h3 className="mt-1 text-base font-semibold tracking-tight text-slate-900">Engagement mix</h3>
                    <p className="mt-1 text-sm leading-relaxed text-slate-600">
                      Share of roster in each band — low engagement is not blame; it is a signal to re-engage or adjust expectations.
                    </p>
                  </div>
                  <span className="badge-soft">{club.memberCount} members</span>
                </div>

                {insights.segments.length === 0 ? (
                  <div className="mt-5">
                    <InlineEmptyState
                      icon="users"
                      title="Segments need more attendance history"
                      body="As members accumulate presence across tracked events, they land in high, moderate, or low bands."
                    />
                  </div>
                ) : (
                  <div className="mt-5 space-y-3">
                    {insights.segments.map((seg) => (
                      <div key={seg.tier} className={`rounded-xl border p-4 shadow-sm ${tierBgClass(seg.tier)}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className={`text-sm font-semibold ${tierTextClass(seg.tier)}`}>{seg.label}</p>
                            <p className="mt-0.5 text-xs leading-relaxed text-slate-600">{seg.description}</p>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className={`text-xl font-bold tabular-nums ${tierCountClass(seg.tier)}`}>{seg.count}</p>
                            <p className="text-xs text-slate-500">{seg.percent}% of roster</p>
                          </div>
                        </div>
                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/70 ring-1 ring-black/5">
                          <div
                            className={`h-full rounded-full transition-[width] duration-500 ${tierBarColor(seg.tier)}`}
                            style={{ width: `${seg.percent}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>

          <DisclosurePanel
            id="insights-member-spotlight"
            title="Member spotlight"
            subtitle="Top attendees by share of tracked events — handy for thank-yous, committees, or gentle check-ins with people who rarely make it."
            badge={
              club.currentUserRole === "officer" ? (
                <span className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                  Officer view
                </span>
              ) : null
            }
          >
            <div className="section-card-header px-0 pt-1">
              <div>
                <p className="section-kicker">People</p>
                <h3 className="mt-1 text-base font-semibold tracking-tight text-slate-900">Most active members</h3>
                <p className="mt-1 text-sm text-slate-600">Top three by attendance rate on tracked events.</p>
              </div>
              <span className="badge-soft">{club.topMembers.length} shown</span>
            </div>

            {club.topMembers.length === 0 ? (
              <div className="mt-4">
                <InlineEmptyState
                  icon="users"
                  title="No ranking yet"
                  body="When members start appearing at tracked events, the highest attendance rates surface here."
                />
              </div>
            ) : (
              <ul className="mt-4 space-y-3">
                {club.topMembers.map((member, index) => {
                  const isCurrentUser = member.userId === club.currentUserId;
                  const isOfficer = member.role === "officer";
                  return (
                    <li
                      key={member.userId}
                      className="surface-subcard rounded-xl border border-slate-100/90 p-4 transition-shadow hover:shadow-md"
                    >
                      <div className="flex items-center gap-3">
                        <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">
                          {index + 1}
                        </span>
                        <div className={`member-avatar ${isOfficer ? "is-officer" : ""} ${isCurrentUser ? "is-current-user" : ""}`}>
                          {getMemberRosterInitials(member)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-semibold text-slate-900">{getMemberRosterDisplayName(member)}</p>
                            <span className={`member-role-pill ${isOfficer ? "is-officer" : "is-member"}`}>{member.role}</span>
                            {isCurrentUser ? <span className="member-you-pill">You</span> : null}
                          </div>
                          <div className="mt-2">
                            <div className="mb-1 flex items-center justify-between gap-2">
                              <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">Attendance</span>
                              <span className="text-xs font-semibold tabular-nums text-slate-600">
                                {member.attendanceCount}/{member.totalTrackedEvents} · {member.attendanceRate}%
                              </span>
                            </div>
                            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                              <div
                                className={`h-full rounded-full transition-[width] duration-500 ${rateBarColor(member.attendanceRate)}`}
                                style={{ width: `${member.attendanceRate}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </DisclosurePanel>
        </>
      )}
    </section>
  );
}

// ─── Trend bar sub-component ──────────────────────────────────────────────────

type TrendBarProps = {
  point: {
    eventId: string;
    title: string;
    eventType: string;
    date: string;
    presentCount: number;
    memberCount: number;
    rate: number;
  };
};

function TrendBar({ point }: TrendBarProps) {
  const label = `${point.title}, ${point.rate}% attendance`;
  return (
    <div
      className="rounded-xl border border-slate-100/90 bg-white/90 px-3 py-3 shadow-sm sm:px-4"
      role="group"
      aria-label={label}
    >
      <div className="grid items-center gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(6rem,1fr)_3.25rem]">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-800">{point.title}</p>
          <p className="mt-0.5 text-xs text-slate-500">
            {point.eventType} · {point.date} · {point.presentCount}/{point.memberCount} present
          </p>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-slate-100 sm:order-none">
          <div
            className={`h-full rounded-full transition-[width] duration-500 ${rateBarColor(point.rate)}`}
            style={{ width: `${point.rate}%` }}
          />
        </div>
        <p className="text-right text-sm font-bold tabular-nums text-slate-900 sm:pl-1">{point.rate}%</p>
      </div>
    </div>
  );
}
