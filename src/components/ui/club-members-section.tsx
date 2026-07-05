"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { markMemberAlumniAction, removeMemberAction, updateMemberRoleAction } from "@/app/(app)/clubs/actions";
import { ClubCommitteesPanel } from "@/components/ui/club-committees-panel";
import { ClubTeamsPanel } from "@/components/ui/club-teams-panel";
import { GettingStartedChecklist } from "@/components/ui/getting-started-checklist";
import { ClubJoinRequestsPanel } from "@/components/ui/club-join-requests-panel";
import { MemberBulkActionsToolbar } from "@/components/ui/member-bulk-actions-toolbar";
import { MemberImportPanel } from "@/components/ui/member-import-panel";
import { CopyInviteLinkButton } from "@/components/ui/copy-invite-link-button";
import { CopyJoinCodeButton } from "@/components/ui/copy-join-code-button";
import { CopyPublicClubPageButton } from "@/components/ui/copy-public-club-page-button";
import { ClubDuesTermEditDialog } from "@/components/ui/club-dues-term-edit-dialog";
import { MemberProfileDialog } from "@/components/ui/member-profile-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { PageEmptyState } from "@/components/ui/page-patterns";
import { ActionFeedbackBanner } from "@/components/ui/action-feedback-banner";
import { formatVolunteerHoursAmount } from "@/components/ui/volunteer-hours-panel";
import type { ClubMembersPagePermissionGates } from "@/lib/clubs/member-management-access";
import {
  formatTrackedAttendanceSummary,
  participationScoreCompactTitle,
  trackedAttendanceEmptyCopy,
} from "@/lib/clubs/member-engagement-copy";
import { formatMemberLastEngagementDisplay, MEMBER_INACTIVITY } from "@/lib/clubs/member-inactivity";
import {
  PARTICIPATION_ACTIVITY_WINDOW_DAYS,
  recentActivityPointsTitle,
} from "@/lib/clubs/recent-activity";
import { computeParticipationScore, participationScoreBand } from "@/lib/clubs/participation-score";
import { formatClubDuesDueDateLabel, formatClubDuesMoney, isUnpaidDuesPastDue } from "@/lib/clubs/dues-display";
import type {
  ClubDetail,
  ClubDuesSettings,
  ClubMember,
  ClubMemberAttendanceHistoryEntry,
  ClubMemberDuesRecord,
  PendingJoinRequest,
} from "@/lib/clubs/queries";
import { getMemberRosterDisplayName, getMemberRosterInitials } from "@/lib/member-display";
import { getClubAccentColor } from "@/lib/clubs/club-visual";
import type { MemberWithRoles } from "@/lib/rbac/role-actions";

/** Role filter uses real data only: legacy `club_members.role` + RBAC President. */
type RosterRoleFilter = "all" | "president" | "officer" | "member";

/** Membership lifecycle filter (active vs alumni). */
type RosterStatusFilter = "all" | "active" | "alumni";

/** Engagement hint filter (leadership / insights only). */
type RosterEngagementFilter = "all" | "likely_inactive";

/** Recent RSVP/attendance window (see `recent-activity.ts`). */
type RosterActivityLevelFilter = "all" | "engaged" | "low_activity";

type RosterSortKey =
  | "name_asc"
  | "activity_desc"
  | "activity_asc"
  | "last_activity_desc"
  | "last_activity_asc";

function hasRbacPresident(rbacRoles: MemberWithRoles["rbacRoles"]): boolean {
  return rbacRoles.some((r) => r.roleName === "President" && r.isSystem);
}

/** Labels align with member profile dues status options (Paid, Unpaid, …). */
function duesRosterPillClasses(status: ClubMemberDuesRecord["status"]): { label: string; className: string } {
  switch (status) {
    case "paid":
      return {
        label: "Paid",
        className: "border-emerald-200/90 bg-emerald-50 text-emerald-900",
      };
    case "unpaid":
      return {
        label: "Unpaid",
        className: "border-amber-200/90 bg-amber-50 text-amber-950",
      };
    case "partial":
      return {
        label: "Partial",
        className: "border-sky-200/90 bg-sky-50 text-sky-950",
      };
    case "exempt":
      return {
        label: "Exempt",
        className: "border-slate-200/90 bg-slate-100 text-slate-700",
      };
    case "waived":
      return {
        label: "Waived",
        className: "border-slate-200/90 bg-slate-100 text-slate-700",
      };
    default:
      return {
        label: "Dues",
        className: "border-slate-200/90 bg-slate-100 text-slate-700",
      };
  }
}

function duesRosterPillForMember(
  record: ClubMemberDuesRecord,
  duesSettings: ClubDuesSettings | null | undefined,
): { label: string; className: string } {
  if (
    record.status === "unpaid"
    && duesSettings?.dueDate
    && isUnpaidDuesPastDue(record.status, duesSettings.dueDate)
  ) {
    return {
      label: "Past due",
      className:
        "border-amber-300/90 bg-amber-100/95 text-amber-950 shadow-sm ring-1 ring-amber-200/70",
    };
  }
  return duesRosterPillClasses(record.status);
}

function duesRosterPillTitle(
  record: ClubMemberDuesRecord,
  duesSettings: ClubDuesSettings | null | undefined,
): string {
  const pill = duesRosterPillForMember(record, duesSettings);
  if (
    record.status === "unpaid"
    && duesSettings?.dueDate
    && isUnpaidDuesPastDue(record.status, duesSettings.dueDate)
  ) {
    return `Past due: still Unpaid after the term due date (${formatClubDuesDueDateLabel(duesSettings.dueDate)}). Leadership-only — open profile to update.`;
  }
  return `Leadership-only: ${pill.label}. Open profile to view or change.`;
}

function countDuesStatuses(duesByUserId: Record<string, ClubMemberDuesRecord>) {
  let paid = 0;
  let unpaid = 0;
  let partial = 0;
  let waivedOrExempt = 0;
  for (const row of Object.values(duesByUserId)) {
    switch (row.status) {
      case "paid":
        paid++;
        break;
      case "unpaid":
        unpaid++;
        break;
      case "partial":
        partial++;
        break;
      case "waived":
      case "exempt":
        waivedOrExempt++;
        break;
      default:
        break;
    }
  }
  return { paid, unpaid, partial, waivedOrExempt };
}

function memberMatchesStatusFilter(member: ClubMember, filter: RosterStatusFilter): boolean {
  if (filter === "all") return true;
  if (filter === "active") return member.membershipStatus === "active";
  if (filter === "alumni") return member.membershipStatus === "alumni";
  return true;
}

function memberMatchesRoleFilter(
  member: ClubMember,
  rbacRoles: MemberWithRoles["rbacRoles"],
  filter: RosterRoleFilter,
): boolean {
  if (filter === "all") return true;
  const isPres = hasRbacPresident(rbacRoles);
  if (filter === "president") return isPres;
  if (filter === "officer") return member.role === "officer" && !isPres;
  if (filter === "member") return member.role === "member";
  return true;
}

function memberMatchesRosterSearch(
  member: ClubMember,
  rbacRoles: MemberWithRoles["rbacRoles"],
  queryLower: string,
): boolean {
  const name = member.fullName?.trim().toLowerCase() ?? "";
  const email = member.email?.trim().toLowerCase() ?? "";
  const legacyRole = member.role.toLowerCase();
  const display = getMemberRosterDisplayName(member).toLowerCase();
  const rbacNames = rbacRoles.map((r) => r.roleName.toLowerCase()).join(" ");
  const status = member.membershipStatus === "alumni" ? "alumni" : "";
  const tagNames = (member.tags ?? []).map((t) => t.name.toLowerCase()).join(" ");
  const committeeNames = (member.committees ?? []).map((c) => c.name.toLowerCase()).join(" ");
  const teamNames = (member.teams ?? []).map((t) => t.name.toLowerCase()).join(" ");
  const skillInterestLabels = (member.skillInterestEntries ?? []).map((e) => e.label.toLowerCase()).join(" ");
  const haystack = [
    name,
    email,
    legacyRole,
    display,
    rbacNames,
    status,
    tagNames,
    committeeNames,
    teamNames,
    skillInterestLabels,
  ].join(" ");
  return haystack.includes(queryLower);
}

function memberMatchesEngagementFilter(
  member: ClubMember,
  filter: RosterEngagementFilter,
  canSee: boolean,
): boolean {
  if (!canSee || filter === "all") return true;
  return Boolean(member.likelyInactive);
}

function memberMatchesActivityLevelFilter(
  member: ClubMember,
  filter: RosterActivityLevelFilter,
): boolean {
  if (filter === "all") return true;
  if (member.membershipStatus === "alumni") {
    return filter !== "low_activity";
  }
  if (filter === "engaged") return !member.isInactive;
  if (filter === "low_activity") return member.isInactive;
  return true;
}

function compareRosterMembers(a: ClubMember, b: ClubMember, sortKey: RosterSortKey): number {
  const nameCmp = getMemberRosterDisplayName(a).localeCompare(getMemberRosterDisplayName(b));
  switch (sortKey) {
    case "name_asc":
      return nameCmp;
    case "activity_desc": {
      const d = (b.recentActivityPoints ?? 0) - (a.recentActivityPoints ?? 0);
      return d !== 0 ? d : nameCmp;
    }
    case "activity_asc": {
      const d = (a.recentActivityPoints ?? 0) - (b.recentActivityPoints ?? 0);
      return d !== 0 ? d : nameCmp;
    }
    case "last_activity_desc": {
      const ta = a.lastActivityAt ? new Date(a.lastActivityAt).getTime() : Number.NEGATIVE_INFINITY;
      const tb = b.lastActivityAt ? new Date(b.lastActivityAt).getTime() : Number.NEGATIVE_INFINITY;
      const d = tb - ta;
      return d !== 0 ? d : nameCmp;
    }
    case "last_activity_asc": {
      const ta = a.lastActivityAt ? new Date(a.lastActivityAt).getTime() : Number.POSITIVE_INFINITY;
      const tb = b.lastActivityAt ? new Date(b.lastActivityAt).getTime() : Number.POSITIVE_INFINITY;
      const d = ta - tb;
      return d !== 0 ? d : nameCmp;
    }
    default:
      return nameCmp;
  }
}

function rosterParticipationPill(member: ClubMember) {
  const { score, attendanceSignalLimited } = computeParticipationScore({
    attendanceRate: member.attendanceRate,
    totalTrackedEvents: member.totalTrackedEvents,
    volunteerHoursTotal: member.volunteerHoursTotal,
  });
  const band = participationScoreBand(score);
  const cls =
    band === "high"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : band === "mid"
        ? "border-amber-200 bg-amber-50 text-amber-900"
        : "border-slate-200 bg-slate-100 text-slate-700";

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${cls}`}
      title={participationScoreCompactTitle({ score, attendanceSignalLimited })}
    >
      Score {score}
    </span>
  );
}

function rosterActivityPointsPill(member: ClubMember) {
  const pts = member.recentActivityPoints ?? 0;
  return (
    <span
      className="inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-950"
      title={recentActivityPointsTitle(pts)}
    >
      Activity {pts}
    </span>
  );
}

function memberAttendancePercentClass(rate: number): string {
  if (rate < 30) return "member-roster-row__attendance-pct is-low";
  if (rate <= 60) return "member-roster-row__attendance-pct is-mid";
  return "member-roster-row__attendance-pct is-high";
}

function memberAttendanceBarFillColor(rate: number, accent: string): string {
  if (rate < 30) return "#E24B4A";
  return accent;
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 9l6 6 6-6" />
    </svg>
  );
}

/** Server-built gates plus async import check from `member-import-auth`. */
export type ClubMembersSectionPermissions = ClubMembersPagePermissionGates & {
  canImportMemberList?: boolean;
};

type ClubMembersSectionProps = {
  club: ClubDetail;
  query: {
    memberError?: string;
    memberSuccess?: string;
  };
  rbacByUser?: Record<string, MemberWithRoles["rbacRoles"]>;
  isPresident?: boolean;
  permissions?: ClubMembersSectionPermissions;
  pendingJoinRequests?: PendingJoinRequest[];
  /** Populated only for users who may manage officer notes; never sent to regular members. */
  officerNotesByUserId?: Record<string, string>;
  /** Populated only for users who may manage dues; never sent to regular members. */
  duesByUserId?: Record<string, ClubMemberDuesRecord>;
  /** Current club dues term; leadership-only. */
  duesSettings?: ClubDuesSettings | null;
  /**
   * Per-member past attendance rows; members page only.
   * Server loads all members’ rows only when `canViewOthersMemberAttendanceHistory`; otherwise the viewer’s user id only.
   */
  attendanceHistoryByUserId?: Record<string, ClubMemberAttendanceHistoryEntry[]>;
};

export function ClubMembersSection({
  club,
  query,
  rbacByUser = {},
  isPresident = false,
  permissions,
  pendingJoinRequests = [],
  officerNotesByUserId,
  duesByUserId,
  duesSettings = null,
  attendanceHistoryByUserId,
}: ClubMembersSectionProps) {
  const [rosterSearch, setRosterSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RosterRoleFilter>("all");
  const [statusFilter, setStatusFilter] = useState<RosterStatusFilter>("all");
  const [engagementFilter, setEngagementFilter] = useState<RosterEngagementFilter>("all");
  const [activityLevelFilter, setActivityLevelFilter] = useState<RosterActivityLevelFilter>("all");
  const [rosterSortKey, setRosterSortKey] = useState<RosterSortKey>("name_asc");
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [rosterImportOpen, setRosterImportOpen] = useState(false);
  const [duesTermEditOpen, setDuesTermEditOpen] = useState(false);
  const [duesTermEditKey, setDuesTermEditKey] = useState(0);
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(() => new Set());
  const [expandedMemberIds, setExpandedMemberIds] = useState<Set<string>>(() => new Set());
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [filterAboutOpen, setFilterAboutOpen] = useState(false);
  const [advancedPanelOpen, setAdvancedPanelOpen] = useState(false);
  const [inviteMoreOptionsOpen, setInviteMoreOptionsOpen] = useState(false);
  const filterPanelRef = useRef<HTMLDivElement>(null);

  const activeMembers = club.members.filter((m) => m.membershipStatus === "active");
  const memberCount = activeMembers.length;
  const officerCount = activeMembers.filter((m) => m.role === "officer").length;
  const rosterTotalCount = club.members.length;
  const announcementsCountForUi = club.rosterAnnouncementsCount ?? club.announcements.length;
  const eventsCountForUi = club.rosterEventsCount ?? club.events.length;
  const setupDone = memberCount > 1 && announcementsCountForUi > 0 && eventsCountForUi > 0;

  // RBAC-based permission checks with legacy officer fallback.
  const legacyIsOfficer = club.currentUserRole === "officer";
  const canInviteMembers = permissions?.canInviteMembers ?? legacyIsOfficer;
  const canRemoveMembers = permissions?.canRemoveMembers ?? legacyIsOfficer;
  const canAssignRoles = permissions?.canAssignRoles ?? legacyIsOfficer;
  const canManageMemberTags = permissions?.canManageMemberTags ?? legacyIsOfficer;
  const canManageCommittees = permissions?.canManageCommittees ?? legacyIsOfficer;
  const canManageTeams = permissions?.canManageTeams ?? legacyIsOfficer;
  const canSeeInactiveEngagement = permissions?.canSeeInactiveEngagement ?? false;
  const canManageVolunteerHours = permissions?.canManageVolunteerHours ?? false;
  const canManageMemberSkillsForOthers = permissions?.canManageMemberSkillsForOthers ?? legacyIsOfficer;
  const canManageMemberAvailabilityForOthers =
    permissions?.canManageMemberAvailabilityForOthers ?? legacyIsOfficer;
  const canManageOfficerNotes = permissions?.canManageOfficerNotes ?? false;
  const canManageMemberDues = permissions?.canManageMemberDues ?? false;
  const canExportMemberRoster = permissions?.canExportMemberRoster ?? false;
  const canImportMemberList = permissions?.canImportMemberList ?? false;
  const canViewMemberContact = permissions?.canViewMemberContact ?? false;
  const canViewOthersMemberAttendanceHistory = permissions?.canViewOthersMemberAttendanceHistory ?? false;

  // A user can see management controls if they have at least one management permission.
  const hasAnyManagementPermission =
    canInviteMembers
    || canRemoveMembers
    || canAssignRoles
    || canManageMemberTags
    || canManageCommittees
    || canManageTeams;
  const isArchived = club.status === "archived";
  const showBulkMemberChrome =
    !isArchived
    && (canManageMemberTags || canManageCommittees || canManageTeams || canRemoveMembers);
  const showAdvancedMemberTools = canManageMemberDues || canManageCommittees || canManageTeams;
  const showInvite = canInviteMembers && !isArchived;
  const showManagement = hasAnyManagementPermission && !isArchived;

  const rosterQuery = rosterSearch.trim().toLowerCase();
  const panelFilterCount =
    (statusFilter !== "all" ? 1 : 0)
    + (roleFilter !== "all" ? 1 : 0)
    + (activityLevelFilter !== "all" ? 1 : 0)
    + (canSeeInactiveEngagement && engagementFilter !== "all" ? 1 : 0);
  const hasActiveFilters =
    Boolean(rosterQuery)
    || roleFilter !== "all"
    || statusFilter !== "all"
    || activityLevelFilter !== "all"
    || rosterSortKey !== "name_asc"
    || (canSeeInactiveEngagement && engagementFilter !== "all");

  const isViewerOfficer = legacyIsOfficer || isPresident || canSeeInactiveEngagement;

  const likelyInactiveCount = canSeeInactiveEngagement
    ? activeMembers.filter((m) => m.likelyInactive).length
    : 0;

  const duesStatusCounts = useMemo(() => {
    if (!canManageMemberDues || !duesByUserId) {
      return { paid: 0, unpaid: 0, partial: 0, waivedOrExempt: 0 };
    }
    return countDuesStatuses(duesByUserId);
  }, [canManageMemberDues, duesByUserId]);

  const activeMembersWithoutDuesStatus = useMemo(() => {
    if (!canManageMemberDues || !duesByUserId) return 0;
    return activeMembers.filter((m) => !duesByUserId[m.userId]).length;
  }, [canManageMemberDues, duesByUserId, activeMembers]);

  const duesStatusesOnFile = useMemo(() => {
    if (!duesByUserId) return 0;
    return Object.keys(duesByUserId).length;
  }, [duesByUserId]);

  const filteredMembers = useMemo(() => {
    let list = club.members;
    if (statusFilter !== "all") {
      list = list.filter((m) => memberMatchesStatusFilter(m, statusFilter));
    }
    if (roleFilter !== "all") {
      list = list.filter((m) =>
        memberMatchesRoleFilter(m, rbacByUser[m.userId] ?? [], roleFilter),
      );
    }
    list = list.filter((m) => memberMatchesEngagementFilter(m, engagementFilter, canSeeInactiveEngagement));
    list = list.filter((m) => memberMatchesActivityLevelFilter(m, activityLevelFilter));
    if (rosterQuery) {
      list = list.filter((m) => memberMatchesRosterSearch(m, rbacByUser[m.userId] ?? [], rosterQuery));
    }
    const sorted = [...list].sort((a, b) => compareRosterMembers(a, b, rosterSortKey));
    return sorted;
  }, [
    club.members,
    rbacByUser,
    rosterQuery,
    roleFilter,
    statusFilter,
    engagementFilter,
    activityLevelFilter,
    rosterSortKey,
    canSeeInactiveEngagement,
  ]);

  const visibleBulkSelected = useMemo(() => {
    const visible = new Set(filteredMembers.map((m) => m.userId));
    const next = new Set<string>();
    for (const id of bulkSelected) {
      if (visible.has(id)) next.add(id);
    }
    return next;
  }, [bulkSelected, filteredMembers]);

  const showLowActivityBadge = useMemo(() => {
    const activeVisible = filteredMembers.filter((m) => m.membershipStatus !== "alumni");
    if (activeVisible.length === 0) return false;
    const inactiveCount = activeVisible.filter((m) => m.isInactive).length;
    if (inactiveCount === 0) return false;
    return inactiveCount < activeVisible.length;
  }, [filteredMembers]);

  useEffect(() => {
    if (!filterPanelOpen) return;

    function handlePointerDown(event: MouseEvent) {
      if (filterPanelRef.current && !filterPanelRef.current.contains(event.target as Node)) {
        closeFilterPanel();
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [filterPanelOpen]);

  function clearPanelFilters() {
    setRoleFilter("all");
    setStatusFilter("all");
    setEngagementFilter("all");
    setActivityLevelFilter("all");
  }

  function closeFilterPanel() {
    setFilterPanelOpen(false);
    setFilterAboutOpen(false);
  }

  function clearRosterFilters() {
    setRosterSearch("");
    setRoleFilter("all");
    setStatusFilter("all");
    setEngagementFilter("all");
    setActivityLevelFilter("all");
    setRosterSortKey("name_asc");
  }

  function selectAllVisibleMembers() {
    const ids = filteredMembers.filter((m) => m.userId !== club.currentUserId).map((m) => m.userId);
    setBulkSelected(new Set(ids));
  }

  function toggleBulkMember(userId: string) {
    setBulkSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  function toggleMemberExpanded(userId: string) {
    setExpandedMemberIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  const clubAccentColor = getClubAccentColor(club.name);
  const hasSidebar =
    showInvite || (canImportMemberList && !isArchived) || canExportMemberRoster;

  return (
    <section className="page-sections">
      <header className="members-page-header">
        <h1 className="app-page-title">Members</h1>
        {showInvite ? (
          <a href="#invite-members" className="btn-primary shrink-0">
            Invite members
          </a>
        ) : null}
      </header>

      {isArchived ? (
        <p className="members-page-archived-note">
          This club is archived — inviting new members is disabled.
        </p>
      ) : null}

      <div className="members-stats-row">
        <div className="members-stats-tile card-surface">
          <p className="members-stats-tile__value">{memberCount}</p>
          <p className="members-stats-tile__label">
            Active {memberCount === 1 ? "member" : "members"}
          </p>
        </div>
        <div className="members-stats-tile card-surface">
          <p className="members-stats-tile__value">{officerCount}</p>
          <p className="members-stats-tile__label">
            {officerCount === 1 ? "Officer" : "Officers"}
          </p>
        </div>
        <div className="members-stats-tile card-surface">
          <p className="members-stats-tile__value">
            {club.totalTrackedEvents > 0 ? `${club.clubAverageAttendance}%` : "—"}
          </p>
          <p className="members-stats-tile__label">Avg. attendance</p>
        </div>
      </div>

      {pendingJoinRequests.length > 0 ? (
        <ClubJoinRequestsPanel clubId={club.id} requests={pendingJoinRequests} />
      ) : null}

      {showManagement && !setupDone ? (
        <GettingStartedChecklist
          clubId={club.id}
          membersCount={memberCount}
          announcementsCount={announcementsCountForUi}
          eventsCount={eventsCountForUi}
        />
      ) : null}

      <div className={`members-page-columns${hasSidebar ? "" : " members-page-columns--solo"}`}>
        <div className="members-roster-card card-surface" id="members">
          {rosterTotalCount > 0 ? (
            <div className="members-roster-card__filters">
              <div className="member-roster-filter-bar" ref={filterPanelRef}>
                <div className="flex items-center gap-2">
                  <div className="member-roster-search w-48 shrink-0">
                    <svg
                      className="member-roster-search__icon"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      aria-hidden
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                      type="search"
                      value={rosterSearch}
                      onChange={(e) => setRosterSearch(e.target.value)}
                      placeholder="Search members..."
                      className="input-control member-roster-search__input min-h-10 w-full text-sm"
                      aria-label="Search members in roster"
                      autoComplete="off"
                    />
                  </div>
                  <button
                    type="button"
                    className="member-roster-filter-btn shrink-0"
                    aria-expanded={filterPanelOpen}
                    aria-haspopup="true"
                    onClick={() => setFilterPanelOpen((open) => !open)}
                  >
                    {panelFilterCount > 0 ? `Filter · ${panelFilterCount}` : "Filter"}
                  </button>
                  <div className="w-36 shrink-0">
                    <label htmlFor="roster-sort" className="sr-only">
                      Sort
                    </label>
                    <select
                      id="roster-sort"
                      value={rosterSortKey}
                      onChange={(e) => setRosterSortKey(e.target.value as RosterSortKey)}
                      className="input-control min-h-10 w-full text-sm"
                      aria-label="Sort roster"
                    >
                      <option value="name_asc">Name (A–Z)</option>
                      <option value="activity_desc">Activity score (high → low)</option>
                      <option value="activity_asc">Activity score (low → high)</option>
                      <option value="last_activity_desc">Last activity (recent first)</option>
                      <option value="last_activity_asc">Last activity (oldest first)</option>
                    </select>
                  </div>
                </div>
                {filterPanelOpen ? (
                  <div className="member-roster-filter-panel" role="dialog" aria-label="Filter members">
                    <button
                      type="button"
                      className="member-roster-filter-panel__close"
                      aria-label="Close filters"
                      onClick={closeFilterPanel}
                    >
                      ×
                    </button>
                    <div className="member-roster-filter-panel__grid">
                      <div className="member-roster-filter-panel__field">
                        <label htmlFor="roster-status-filter" className="member-roster-filter-panel__label">
                          Status
                        </label>
                        <select
                          id="roster-status-filter"
                          value={statusFilter}
                          onChange={(e) => setStatusFilter(e.target.value as RosterStatusFilter)}
                          className="input-control min-h-10 w-full text-sm"
                          aria-label="Filter roster by membership status"
                        >
                          <option value="all">All</option>
                          <option value="active">Active only</option>
                          <option value="alumni">Alumni only</option>
                        </select>
                      </div>
                      <div className="member-roster-filter-panel__field">
                        <label htmlFor="roster-role-filter" className="member-roster-filter-panel__label">
                          Role
                        </label>
                        <select
                          id="roster-role-filter"
                          value={roleFilter}
                          onChange={(e) => setRoleFilter(e.target.value as RosterRoleFilter)}
                          className="input-control min-h-10 w-full text-sm"
                          aria-label="Filter roster by role"
                        >
                          <option value="all">All roles</option>
                          <option value="president">President</option>
                          <option value="officer">Officer (not President)</option>
                          <option value="member">Member</option>
                        </select>
                      </div>
                      <div className="member-roster-filter-panel__field">
                        <label htmlFor="roster-activity-filter" className="member-roster-filter-panel__label">
                          Activity
                        </label>
                        <select
                          id="roster-activity-filter"
                          value={activityLevelFilter}
                          onChange={(e) => setActivityLevelFilter(e.target.value as RosterActivityLevelFilter)}
                          className="input-control min-h-10 w-full text-sm"
                          aria-label="Filter by recent RSVP and attendance activity"
                        >
                          <option value="all">All</option>
                          <option value="engaged">Engaged</option>
                          <option value="low_activity">Low activity</option>
                        </select>
                      </div>
                      {canSeeInactiveEngagement ? (
                        <div className="member-roster-filter-panel__field">
                          <label htmlFor="roster-engagement-filter" className="member-roster-filter-panel__label">
                            Engagement
                          </label>
                          <select
                            id="roster-engagement-filter"
                            value={engagementFilter}
                            onChange={(e) => setEngagementFilter(e.target.value as RosterEngagementFilter)}
                            className="input-control min-h-10 w-full text-sm"
                            aria-label="Filter roster by engagement"
                          >
                            <option value="all">All members</option>
                            <option value="likely_inactive">Likely inactive</option>
                          </select>
                        </div>
                      ) : null}
                    </div>
                    {filterAboutOpen ? (
                      <div className="member-roster-filter-panel__about-content">
                        <p>
                          The list shows a short engagement summary; skills, availability, notes, and full attendance history
                          are in each member&apos;s profile.
                        </p>
                        <p>
                          <span className="font-semibold text-slate-600">Grade &amp; class year</span> are not stored yet
                          (profiles only include name and email). Filters use membership role and RBAC roles only.
                        </p>
                        {canSeeInactiveEngagement ? (
                          <p>
                            <span className="font-semibold text-slate-600">Likely inactive</span> uses RSVP and event signals
                            (leadership recency), not the same as attendance % or participation score. No RSVP or attended-event
                            signal in {MEMBER_INACTIVITY.INACTIVITY_DAYS} days after a {MEMBER_INACTIVITY.NEW_MEMBER_GRACE_DAYS}
                            -day join grace; needs {MEMBER_INACTIVITY.MIN_TRACKED_EVENTS_FOR_LABEL}+ tracked past events
                            club-wide. Nothing changes automatically.
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                    <div className="member-roster-filter-panel__footer">
                      {panelFilterCount > 0 ? (
                        <button
                          type="button"
                          className="member-roster-filter-panel__footer-link"
                          onClick={clearPanelFilters}
                        >
                          Clear filters
                        </button>
                      ) : (
                        <span aria-hidden />
                      )}
                      <button
                        type="button"
                        className="member-roster-filter-panel__footer-link"
                        aria-expanded={filterAboutOpen}
                        onClick={() => setFilterAboutOpen((open) => !open)}
                      >
                        About filters
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
              {hasActiveFilters ? (
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                  <button
                    type="button"
                    onClick={clearRosterFilters}
                    className="inline-flex min-h-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-800 transition hover:bg-slate-100 sm:text-sm"
                  >
                    Clear all
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}

        {rosterTotalCount > 0 && hasActiveFilters ? (
          <p className="mt-3 text-xs text-slate-600" role="status">
            Showing{" "}
            <span className="font-semibold text-slate-900">{filteredMembers.length}</span> of {rosterTotalCount}{" "}
            members
          </p>
        ) : null}

        {query.memberSuccess ? (
          <ActionFeedbackBanner
            variant="success"
            title="Member update complete"
            message={query.memberSuccess}
            className="mt-4"
            actions={
              <>
                {canInviteMembers ? (
                  <a href="#invite-members" className="btn-secondary text-xs">
                    Invite more members
                  </a>
                ) : null}
                <Link href={`/clubs/${club.id}/announcements#post-announcement`} className="btn-secondary text-xs">
                  Post welcome update
                </Link>
              </>
            }
          />
        ) : null}
        {query.memberError ? (
          <ActionFeedbackBanner
            variant="error"
            title="Could not complete member update"
            message={query.memberError}
            className="mt-3"
          />
        ) : null}

        {showBulkMemberChrome && visibleBulkSelected.size > 0 ? (
          <div className="members-bulk-select-bar">
            <button
              type="button"
              onClick={selectAllVisibleMembers}
              className="inline-flex min-h-9 shrink-0 items-center justify-center rounded-lg border border-indigo-200/90 bg-indigo-50/60 px-3 text-xs font-semibold text-indigo-950 transition hover:bg-indigo-100/70 sm:text-sm"
            >
              Select visible ({filteredMembers.filter((m) => m.userId !== club.currentUserId).length})
            </button>
          </div>
        ) : null}

        {showBulkMemberChrome ? (
          <MemberBulkActionsToolbar
            clubId={club.id}
            clubName={club.name}
            currentUserId={club.currentUserId}
            selectedUserIds={Array.from(visibleBulkSelected)}
            onClearSelection={() => setBulkSelected(new Set())}
            canManageMemberTags={canManageMemberTags}
            canManageCommittees={canManageCommittees}
            canManageTeams={canManageTeams}
            canRemoveMembers={canRemoveMembers}
            memberTagDefinitions={club.memberTagDefinitions}
            clubCommittees={club.clubCommittees}
            clubTeams={club.clubTeams}
          />
        ) : null}

        {rosterTotalCount === 0 ? (
          <div className="members-roster-card__empty">
            <EmptyState
              icon="ti-users"
              title="No members yet"
              description={
                canInviteMembers
                  ? "Share your join code so classmates can find the club."
                  : "Members will appear here once they join."
              }
            />
          </div>
        ) : filteredMembers.length === 0 ? (
          <div className="members-roster-card__empty">
            <PageEmptyState
              title="No members match current filters"
              copy={
                engagementFilter === "likely_inactive" && canSeeInactiveEngagement
                  ? "No one is currently flagged as likely inactive, or another filter is hiding results."
                  : activityLevelFilter === "low_activity"
                    ? "No members match low activity for this filter set, or another filter is hiding results."
                    : activityLevelFilter === "engaged"
                      ? "No members match engaged activity for this filter set, or another filter is hiding results."
                      : "Try a different search term or adjust filters."
              }
              action={
                hasActiveFilters ? (
                  <button
                    type="button"
                    onClick={clearRosterFilters}
                    className="btn-primary"
                  >
                    Clear filters
                  </button>
                ) : null
              }
            />
          </div>
        ) : (
          <ul className="member-roster-list" aria-label="Club member roster">
            {filteredMembers.map((member) => {
              const isCurrentUser = member.userId === club.currentUserId;
              const isAlumni = member.membershipStatus === "alumni";
              const isOfficer = member.role === "officer" && !isAlumni;
              const isExpanded = expandedMemberIds.has(member.userId);

              const rbacRoles = rbacByUser[member.userId] ?? [];
              const significantRbacRoles = rbacRoles.filter(
                (r) => !(r.isSystem && (r.roleName === "Officer" || r.roleName === "Member")),
              );

              const duesRecord = canManageMemberDues ? duesByUserId?.[member.userId] : undefined;
              const duesPill = duesRecord ? duesRosterPillForMember(duesRecord, duesSettings) : null;
              const duesPillHint = duesRecord ? duesRosterPillTitle(duesRecord, duesSettings) : "";

              const hasAffiliationChips =
                significantRbacRoles.length > 0
                || (member.tags?.length ?? 0) > 0
                || (member.committees?.length ?? 0) > 0
                || (member.teams?.length ?? 0) > 0;

              return (
                <li
                  key={member.userId}
                  className={`member-roster-row${isExpanded ? " is-expanded" : ""}${isOfficer ? " is-officer" : ""}${isCurrentUser ? " is-current-user" : ""}${isAlumni ? " is-alumni" : ""}`}
                >
                  <div className="member-roster-row__outer">
                    {showBulkMemberChrome ? (
                      <div className="member-roster-row__checkbox">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                          checked={visibleBulkSelected.has(member.userId)}
                          onChange={() => toggleBulkMember(member.userId)}
                          disabled={isCurrentUser}
                          title={isCurrentUser ? "You cannot bulk-change your own account from here." : undefined}
                          aria-label={
                            isCurrentUser
                              ? "Your account (not available for bulk selection)"
                              : `Select ${getMemberRosterDisplayName(member)} for bulk actions`
                          }
                        />
                      </div>
                    ) : null}
                    <div className="member-roster-row__grid">
                      <div className={`member-avatar ${isOfficer ? "is-officer" : ""} ${isCurrentUser ? "is-current-user" : ""}`}>
                        {getMemberRosterInitials(member)}
                      </div>

                      <button
                        type="button"
                        className="member-roster-row__identity"
                        aria-expanded={isExpanded}
                        onClick={() => toggleMemberExpanded(member.userId)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="member-roster-row__name">
                            {getMemberRosterDisplayName(member)}
                          </h3>
                          {isPresident && !isAlumni ? (
                            <Link
                              href={`/clubs/${club.id}/settings`}
                              className="shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                              title="Manage roles in Settings"
                              aria-label="Manage roles in Settings"
                              onClick={(event) => event.stopPropagation()}
                            >
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                                />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              </svg>
                            </Link>
                          ) : null}
                        </div>
                        <div className="member-roster-row__badges">
                          <span className={`member-role-pill ${isOfficer ? "is-officer" : "is-member"}`}>
                            {member.role}
                          </span>
                          {isCurrentUser ? <span className="member-you-pill">You</span> : null}
                        </div>
                      </button>

                      <div className="member-roster-row__attendance">
                        {member.totalTrackedEvents > 0 ? (
                          <>
                            <p className={memberAttendancePercentClass(member.attendanceRate)}>
                              {member.attendanceRate}%
                            </p>
                            <div className="member-roster-row__bar" title={`${member.attendanceRate}% attendance`}>
                              <div
                                className="member-roster-row__bar-fill"
                                style={{
                                  width: `${Math.min(100, Math.max(0, member.attendanceRate))}%`,
                                  backgroundColor: memberAttendanceBarFillColor(
                                    member.attendanceRate,
                                    clubAccentColor,
                                  ),
                                }}
                              />
                            </div>
                          </>
                        ) : null}
                      </div>

                      <div className="member-roster-row__actions">
                        <button
                          type="button"
                          onClick={() => setProfileUserId(member.userId)}
                          className="member-roster-row__profile-btn"
                        >
                          Profile
                        </button>
                        <button
                          type="button"
                          className="member-roster-row__chevron-btn"
                          aria-expanded={isExpanded}
                          aria-label={isExpanded ? "Collapse member details" : "Expand member details"}
                          onClick={() => toggleMemberExpanded(member.userId)}
                        >
                          <ChevronDownIcon className="member-roster-row__chevron" />
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="member-roster-row__details">
                    <div className="member-roster-row__details-inner">
                      <div className="member-roster-row__details-content">
                            <div className="flex flex-wrap items-center gap-1.5">
                              {isAlumni ? (
                                <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
                                  Alumni
                                </span>
                              ) : null}
                              {duesPill ? (
                                <span
                                  className={`inline-flex max-w-full min-w-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${duesPill.className}`}
                                  title={duesPillHint}
                                >
                                  <span className="truncate">{duesPill.label}</span>
                                </span>
                              ) : null}
                              {!isAlumni && member.isInactive && showLowActivityBadge ? (
                                <span
                                  className="inline-flex max-w-full items-center rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-900"
                                  title={`No RSVP and no attendance in the last ${PARTICIPATION_ACTIVITY_WINDOW_DAYS} days (after a short grace period for new members). For outreach only.`}
                                >
                                  Low activity
                                </span>
                              ) : null}
                              {canSeeInactiveEngagement && !isAlumni && member.likelyInactive ? (
                                <span
                                  className="inline-flex max-w-full items-center rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700"
                                  title={
                                    (() => {
                                      const last = formatMemberLastEngagementDisplay(member.lastEngagementAt);
                                      return last
                                        ? `Leadership recency (RSVP / events): last signal ${last}. Nothing in ${MEMBER_INACTIVITY.INACTIVITY_DAYS}d — separate from attendance % and participation score.`
                                        : `Leadership recency: no RSVP or attended-event signal in loaded history; nothing in ${MEMBER_INACTIVITY.INACTIVITY_DAYS}d — separate from attendance % and score.`;
                                    })()
                                  }
                                >
                                  Likely inactive
                                </span>
                              ) : null}
                            </div>

                            {hasAffiliationChips ? (
                              <div
                                className="flex flex-wrap items-center gap-1.5 border-t border-slate-100/90 pt-2.5"
                                aria-label="Roles, tags, committees, and teams"
                              >
                                {significantRbacRoles.map((r) => (
                                  <span
                                    key={r.roleId}
                                    className={`inline-flex max-w-full items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                                      r.roleName === "President"
                                        ? "border-violet-200 bg-violet-50 text-violet-700"
                                        : "border-emerald-200 bg-emerald-50 text-emerald-700"
                                    }`}
                                  >
                                    {r.roleName}
                                  </span>
                                ))}
                                {(member.tags ?? []).slice(0, 3).map((t) => (
                                  <span
                                    key={t.id}
                                    className="inline-flex max-w-full items-center rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-800"
                                  >
                                    {t.name}
                                  </span>
                                ))}
                                {(member.tags ?? []).length > 3 ? (
                                  <span className="text-[11px] font-medium text-slate-500">
                                    +{(member.tags ?? []).length - 3} tags
                                  </span>
                                ) : null}
                                {(member.committees ?? []).slice(0, 2).map((c) => (
                                  <span
                                    key={c.id}
                                    className="inline-flex max-w-full items-center rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 text-[11px] font-semibold text-teal-900"
                                  >
                                    {c.name}
                                  </span>
                                ))}
                                {(member.committees ?? []).length > 2 ? (
                                  <span className="text-[11px] font-medium text-slate-500">
                                    +{(member.committees ?? []).length - 2} committees
                                  </span>
                                ) : null}
                                {(member.teams ?? []).slice(0, 2).map((t) => (
                                  <span
                                    key={t.id}
                                    className="inline-flex max-w-full items-center rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-900"
                                  >
                                    {t.name}
                                  </span>
                                ))}
                                {(member.teams ?? []).length > 2 ? (
                                  <span className="text-[11px] font-medium text-slate-500">
                                    +{(member.teams ?? []).length - 2} teams
                                  </span>
                                ) : null}
                              </div>
                            ) : null}

                            <div
                              className="flex flex-col gap-2 border-t border-slate-100/90 pt-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3 sm:gap-y-1"
                              aria-label="Tracked attendance, participation score, and volunteer hours"
                            >
                              <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-slate-600">
                                <span className="font-medium text-slate-500">Summary</span>
                                <span className="hidden h-3 w-px bg-slate-200 sm:block" aria-hidden />
                                {member.totalTrackedEvents > 0 ? (
                                  <span className="text-slate-800" title="Marked present at tracked past events (not RSVPs)">
                                    {formatTrackedAttendanceSummary({
                                      attendanceCount: member.attendanceCount,
                                      totalTrackedEvents: member.totalTrackedEvents,
                                      attendanceRate: member.attendanceRate,
                                    })}
                                  </span>
                                ) : (
                                  <span className="text-slate-500" title={trackedAttendanceEmptyCopy()}>
                                    No tracked events yet
                                  </span>
                                )}
                              </div>
                              {isViewerOfficer ? (
                                <>
                                  <span className="hidden h-3 w-px bg-slate-200 sm:block" aria-hidden />
                                  <div className="flex flex-wrap items-center gap-2">
                                    {rosterActivityPointsPill(member)}
                                    <span className="text-xs text-slate-400">·</span>
                                    {rosterParticipationPill(member)}
                                    <span className="text-xs text-slate-400">·</span>
                                    <span className="text-xs font-medium text-slate-700">
                                      {member.volunteerHoursTotal > 0
                                        ? `${formatVolunteerHoursAmount(member.volunteerHoursTotal)} h volunteer`
                                        : "No hours logged"}
                                    </span>
                                  </div>
                                </>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </div>

                  {!isArchived && !isCurrentUser && (canAssignRoles || canRemoveMembers) ? (
                    <div className="member-roster-row__actions-bar">
                      {/* Role promotion/demotion — requires members.assign_roles; alumni are read-only */}
                      {canAssignRoles && member.membershipStatus === "active" &&
                        (member.role === "member" ? (
                          <form action={updateMemberRoleAction}>
                            <input type="hidden" name="club_id" value={club.id} />
                            <input type="hidden" name="user_id" value={member.userId} />
                            <input type="hidden" name="role" value="officer" />
                            <button type="submit" className="btn-secondary text-xs">
                              Promote to Officer
                            </button>
                          </form>
                        ) : (
                          <form action={updateMemberRoleAction}>
                            <input type="hidden" name="club_id" value={club.id} />
                            <input type="hidden" name="user_id" value={member.userId} />
                            <input type="hidden" name="role" value="member" />
                            <button type="submit" className="btn-secondary text-xs">
                              Demote to Member
                            </button>
                          </form>
                        ))}
                      {canRemoveMembers && member.membershipStatus === "active" && (
                        <form action={markMemberAlumniAction}>
                          <input type="hidden" name="club_id" value={club.id} />
                          <input type="hidden" name="user_id" value={member.userId} />
                          <button type="submit" className="btn-secondary text-xs">
                            Mark as alumni
                          </button>
                        </form>
                      )}
                      {canRemoveMembers && (
                        <form action={removeMemberAction}>
                          <input type="hidden" name="club_id" value={club.id} />
                          <input type="hidden" name="user_id" value={member.userId} />
                          <button type="submit" className="btn-danger text-xs">
                            {isAlumni ? "Remove from roster" : "Remove from Club"}
                          </button>
                        </form>
                      )}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}

          {showAdvancedMemberTools ? (
            <div className="members-roster-card__footer">
              <button
                type="button"
                className="members-roster-advanced-link"
                aria-expanded={advancedPanelOpen}
                onClick={() => setAdvancedPanelOpen((open) => !open)}
              >
                ⋯ Advanced: dues, committees &amp; teams
              </button>
              {advancedPanelOpen ? (
                <div className="members-roster-advanced-panel space-y-4">
                  {canManageMemberDues ? (
                    <section
                      className="card-surface overflow-hidden border border-slate-200/90 bg-gradient-to-br from-white via-slate-50/90 to-emerald-50/45 p-5 shadow-sm sm:p-6"
                      aria-labelledby="club-dues-summary-heading"
                    >
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0 flex-1 space-y-3">
                          <div>
                            <p className="section-kicker text-slate-600">Club dues</p>
                            <h2
                              id="club-dues-summary-heading"
                              className="mt-1 text-lg font-semibold tracking-tight text-slate-900"
                            >
                              {duesSettings ? "This term" : isArchived ? "No term on file" : "Set a club-wide term"}
                            </h2>
                          </div>

                          {duesSettings ? (
                            <>
                              <div className="rounded-xl border border-slate-100/95 bg-white/85 px-4 py-3 shadow-inner sm:px-4 sm:py-3.5">
                                <p
                                  className="text-base font-semibold leading-snug text-slate-900 sm:text-[1.05rem] line-clamp-3 break-words"
                                  title={duesSettings.label}
                                >
                                  {duesSettings.label}
                                </p>
                                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                                  <span className="font-medium text-slate-800 tabular-nums">
                                    {formatClubDuesMoney(duesSettings.amountCents, duesSettings.currency)}
                                  </span>
                                  <span className="text-slate-400"> · </span>
                                  Due{" "}
                                  <span className="font-medium text-slate-800">
                                    {formatClubDuesDueDateLabel(duesSettings.dueDate)}
                                  </span>
                                </p>
                              </div>

                              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                                <div className="rounded-lg border border-emerald-100/90 bg-emerald-50/50 px-3 py-2 text-center sm:text-left">
                                  <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-800/80">Paid</p>
                                  <p className="mt-0.5 text-lg font-bold tabular-nums text-emerald-950">{duesStatusCounts.paid}</p>
                                </div>
                                <div className="rounded-lg border border-amber-100/90 bg-amber-50/50 px-3 py-2 text-center sm:text-left">
                                  <p className="text-[10px] font-bold uppercase tracking-wider text-amber-900/90">Unpaid</p>
                                  <p className="mt-0.5 text-lg font-bold tabular-nums text-amber-950">{duesStatusCounts.unpaid}</p>
                                </div>
                                <div className="rounded-lg border border-sky-100/90 bg-sky-50/60 px-3 py-2 text-center sm:text-left">
                                  <p className="text-[10px] font-bold uppercase tracking-wider text-sky-900/85">Partial</p>
                                  <p className="mt-0.5 text-lg font-bold tabular-nums text-sky-950">{duesStatusCounts.partial}</p>
                                </div>
                                <div className="rounded-lg border border-slate-200/90 bg-slate-50/80 px-3 py-2 text-center sm:text-left">
                                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600">Waived / exempt</p>
                                  <p className="mt-0.5 text-lg font-bold tabular-nums text-slate-900">
                                    {duesStatusCounts.waivedOrExempt}
                                  </p>
                                </div>
                              </div>

                              {duesStatusesOnFile === 0 ? (
                                <p className="text-xs leading-relaxed text-slate-600">
                                  No member statuses recorded yet — open a profile from the roster and choose{" "}
                                  <span className="font-medium text-slate-800">Paid</span>,{" "}
                                  <span className="font-medium text-slate-800">Unpaid</span>, or another option to populate these
                                  counts.
                                </p>
                              ) : (
                                <p className="text-xs leading-relaxed text-slate-600">
                                  Counts only include members with a status saved on their profile (not the whole roster).
                                  {activeMembersWithoutDuesStatus > 0 ? (
                                    <>
                                      {" "}
                                      <span className="font-medium text-slate-800">
                                        {activeMembersWithoutDuesStatus} active{" "}
                                        {activeMembersWithoutDuesStatus === 1 ? "member has" : "members have"} no status yet.
                                      </span>
                                    </>
                                  ) : null}
                                </p>
                              )}

                              <p className="text-[11px] leading-relaxed text-slate-500">
                                Roster chips use <span className="font-medium text-slate-700">Past due</span> when someone is{" "}
                                <span className="font-medium text-slate-700">Unpaid</span> and today is after the term due date.
                              </p>
                            </>
                          ) : isArchived ? (
                            <div className="rounded-xl border border-dashed border-slate-200/95 bg-slate-50/60 px-4 py-4 sm:px-5">
                              <p className="text-sm font-semibold text-slate-800">No club dues term on file</p>
                              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
                                Archived clubs cannot add or change a dues term. Restore the club if you need to edit this.
                              </p>
                            </div>
                          ) : (
                            <div className="rounded-xl border border-dashed border-slate-200/95 bg-white/70 px-4 py-4 sm:px-5">
                              <p className="text-sm font-semibold text-slate-900">No dues term yet</p>
                              <p className="mt-1 text-sm leading-relaxed text-slate-600">
                                Add what you charge and when it is due. The same line appears on member profiles so everyone sees
                                one source of truth.
                              </p>
                            </div>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setDuesTermEditKey((k) => k + 1);
                            setDuesTermEditOpen(true);
                          }}
                          disabled={isArchived}
                          className="btn-secondary inline-flex min-h-10 shrink-0 items-center justify-center self-start px-4 py-2.5 text-sm font-semibold shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isArchived ? "Term locked" : duesSettings ? "Edit club dues term" : "Set club dues term"}
                        </button>
                      </div>
                    </section>
                  ) : null}

                  {canManageCommittees ? (
                    <ClubCommitteesPanel
                      clubId={club.id}
                      committees={club.clubCommittees}
                      canManage={canManageCommittees}
                      isArchived={isArchived}
                    />
                  ) : null}

                  {canManageTeams ? (
                    <ClubTeamsPanel
                      clubId={club.id}
                      teams={club.clubTeams}
                      canManage={canManageTeams}
                      isArchived={isArchived}
                    />
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        {hasSidebar ? (
          <aside className="members-page-sidebar">
            {showInvite ? (
              <div className="members-sidebar-card card-surface" id="invite-members">
                <h2 className="members-sidebar-card__title">Invite members</h2>
                <p className="members-sidebar-card__desc">
                  Share a link — students sign in and request to join in one step.
                </p>
                {club.requireJoinApproval ? (
                  <p className="members-sidebar-card__notice">
                    Approval required: invitees submit a request first. They are added only after officer approval.
                  </p>
                ) : null}
                <p className="members-sidebar-card__kicker">Recommended</p>
                <div className="members-sidebar-card__rec-box">
                  <p className="members-sidebar-card__rec-text">
                    Copy the invite link and share it in your group chat.
                  </p>
                  <CopyInviteLinkButton joinCode={club.joinCode} className="btn-primary w-full">
                    Copy invite link
                  </CopyInviteLinkButton>
                </div>
                <button
                  type="button"
                  className="members-sidebar-card__more-link"
                  aria-expanded={inviteMoreOptionsOpen}
                  onClick={() => setInviteMoreOptionsOpen((open) => !open)}
                >
                  More options: join code · public page
                </button>
                {inviteMoreOptionsOpen ? (
                  <div className="members-sidebar-card__more-panel space-y-3">
                    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-center">
                      <p className="font-mono text-2xl font-bold tracking-[0.22em] text-slate-900 select-all">
                        {club.joinCode}
                      </p>
                    </div>
                    <div className="flex flex-col gap-2">
                      <CopyJoinCodeButton joinCode={club.joinCode} className="btn-secondary w-full" />
                      <CopyPublicClubPageButton clubId={club.id} className="btn-secondary w-full" />
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {(canImportMemberList && !isArchived) || canExportMemberRoster ? (
              <div className="members-sidebar-card card-surface">
                <h2 className="members-sidebar-card__title">Roster files</h2>
                <p className="members-sidebar-card__desc">Import or export member data as CSV.</p>
                <div className="members-sidebar-card__file-actions">
                  {canImportMemberList && !isArchived ? (
                    <button
                      type="button"
                      className="btn-secondary flex-1"
                      aria-expanded={rosterImportOpen}
                      onClick={() => setRosterImportOpen((open) => !open)}
                    >
                      ↑ Import CSV
                    </button>
                  ) : null}
                  {canExportMemberRoster ? (
                    <a
                      href={`/clubs/${club.id}/members/export`}
                      title="Downloads every member in this club as CSV. Roster search and filters do not apply."
                      className="btn-secondary flex-1 text-center"
                    >
                      ↓ Export CSV
                    </a>
                  ) : null}
                </div>
                {rosterImportOpen && canImportMemberList && !isArchived ? (
                  <div className="mt-3">
                    <MemberImportPanel clubId={club.id} />
                  </div>
                ) : null}
              </div>
            ) : null}
          </aside>
        ) : null}
      </div>

      <MemberProfileDialog
        open={profileUserId !== null}
        onClose={() => setProfileUserId(null)}
        member={
          profileUserId ? (club.members.find((m) => m.userId === profileUserId) ?? null) : null
        }
        clubId={club.id}
        currentUserId={club.currentUserId}
        rbacRoles={profileUserId ? rbacByUser[profileUserId] ?? [] : []}
        isPresident={isPresident}
        isArchived={isArchived}
        canAssignRoles={canAssignRoles}
        canRemoveMembers={canRemoveMembers}
        memberTagDefinitions={club.memberTagDefinitions}
        canManageMemberTags={canManageMemberTags}
        clubCommittees={club.clubCommittees}
        canManageCommittees={canManageCommittees}
        clubTeams={club.clubTeams}
        canManageTeams={canManageTeams}
        canManageVolunteerHours={canManageVolunteerHours && !isArchived}
        canManageMemberSkillsForOthers={canManageMemberSkillsForOthers}
        canManageMemberAvailabilityForOthers={canManageMemberAvailabilityForOthers}
        canManageOfficerNotes={canManageOfficerNotes}
        officerNotesByUserId={officerNotesByUserId}
        canManageMemberDues={canManageMemberDues}
        duesByUserId={duesByUserId}
        duesSettings={duesSettings}
        attendanceHistoryByUserId={attendanceHistoryByUserId}
        canViewMemberContact={canViewMemberContact}
        canSeeInactiveEngagement={canSeeInactiveEngagement}
        canViewOthersMemberAttendanceHistory={canViewOthersMemberAttendanceHistory}
      />

      <ClubDuesTermEditDialog
        key={duesTermEditKey}
        open={duesTermEditOpen}
        onClose={() => setDuesTermEditOpen(false)}
        clubId={club.id}
        isArchived={isArchived}
        initial={duesSettings ?? null}
      />

    </section>
  );
}
