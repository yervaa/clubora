"use server";

import { createHash, randomBytes, randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { enforceRateLimit, getRateLimitErrorMessage } from "@/lib/rate-limit";
import { upsertCurrentUserProfile } from "@/lib/profiles";
import { sanitizeInlineText } from "@/lib/sanitize";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { assertClubActiveForMutations } from "@/lib/clubs/club-status";
import { JOIN_REDIRECT_MESSAGES } from "@/lib/clubs/join-flow";
import { hasPermission } from "@/lib/rbac/permissions";
import { createActivityEvent } from "@/lib/activity/create-activity-event";
import { getMemberManagementErrorMessage } from "@/lib/clubs/member-management-messages";
import { sendAnnouncementMemberBroadcast } from "@/lib/announcements/member-broadcast-notifications";
import { notifyApproversAnnouncementSubmitted, notifyApproversEventSubmitted } from "@/lib/clubs/advisor-notify";
import { notifyClubMembersOfPublishedEvent } from "@/lib/clubs/event-created-notify";
import {
  announcementDeleteSchema,
  announcementCreateSchema,
  announcementUpdateSchema,
  attendanceToggleSchema,
  clubCreateSchema,
  ANNOUNCEMENT_ATTACHMENT_MIMES,
  eventCreateSchema,
  eventDeleteSchema,
  eventUpdateSchema,
  eventReflectionSchema,
  joinCodeSchema,
  MAX_RECURRING_OCCURRENCES,
  MAX_ANNOUNCEMENT_ATTACHMENTS,
  MAX_ANNOUNCEMENT_ATTACHMENT_BYTES,
  memberRemovalSchema,
  memberMarkAlumniSchema,
  memberRoleUpdateSchema,
  parseAnnouncementCreateExtras,
  parseAnnouncementUpdateIntent,
  parseEventRecurrenceSettings,
  rsvpSchema,
} from "@/lib/validation/clubs";

function generateJoinCode() {
  return randomBytes(4).toString("hex").toUpperCase();
}

/**
 * Join codes are shareable club-join credentials, so they must never be written
 * to logs in plaintext. Log only a short, non-reversible fingerprint that is
 * still useful for correlating funnel events for the same code.
 */
function redactJoinCode(code: string | null | undefined): string {
  if (!code) return "none";
  return `sha256:${createHash("sha256").update(code).digest("hex").slice(0, 8)}`;
}

function getSafeValidationErrorMessage(result: { error: { issues: Array<{ message: string }> } }) {
  return result.error.issues[0]?.message ?? "Please review your input and try again.";
}

function logClubCreateError(stage: string, details: Record<string, unknown>) {
  console.error(`[club-create:${stage}]`, details);
}

function logClubCreateFunnel(event: string, details: Record<string, unknown>) {
  console.info(`[analytics:club-create:${event}]`, details);
}

function logJoinClub(step: string, details: Record<string, unknown>) {
  console.info(`[club-join:${step}]`, details);
}

function logAttendance(step: string, details: Record<string, unknown>) {
  console.info(`[attendance:${step}]`, details);
}

function getAttendanceErrorMessage(code?: string, message?: string) {
  if (code === "42P01") {
    return "Attendance table is missing. Apply the latest database migration.";
  }

  if (code === "42501") {
    return "Attendance permissions are not configured correctly.";
  }

  if (code === "23503") {
    return "This member profile is missing. Have them sign in again, then retry.";
  }

  if (message?.toLowerCase().includes("row-level security")) {
    return "Attendance permissions are not configured correctly.";
  }

  return "Unable to save attendance. Please retry.";
}

function getReflectionErrorMessage(code?: string, message?: string) {
  if (code === "42P01") {
    return "Reflections table is missing. Apply the latest database migration.";
  }

  if (code === "42501") {
    return "Reflection permissions are not configured correctly.";
  }

  if (message?.toLowerCase().includes("row-level security")) {
    return "Reflection permissions are not configured correctly.";
  }

  return "Unable to save reflection. Please retry.";
}

function addMonthsWithDayFallback(date: Date, monthsToAdd: number, desiredDayOfMonth: number): Date {
  const next = new Date(date);
  const originalHours = next.getHours();
  const originalMinutes = next.getMinutes();
  const originalSeconds = next.getSeconds();
  const originalMs = next.getMilliseconds();

  next.setDate(1);
  next.setMonth(next.getMonth() + monthsToAdd);
  const lastDayOfTargetMonth = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(desiredDayOfMonth, lastDayOfTargetMonth));
  next.setHours(originalHours, originalMinutes, originalSeconds, originalMs);
  return next;
}

function generateRecurringOccurrenceDates(params: {
  firstStartAt: Date;
  frequency: "weekly" | "biweekly" | "monthly";
  endType: "after_count" | "until_date";
  occurrenceCount: number | null;
  untilDate: string | null;
}) {
  const dates: Date[] = [];
  const first = new Date(params.firstStartAt);
  if (Number.isNaN(first.getTime())) {
    return { dates, truncatedByCap: false };
  }

  const desiredDayOfMonth = first.getDate();
  let cursor = first;
  const untilLimit =
    params.endType === "until_date" && params.untilDate
      ? new Date(`${params.untilDate}T23:59:59`)
      : null;

  while (dates.length < MAX_RECURRING_OCCURRENCES) {
    if (params.endType === "after_count" && params.occurrenceCount != null && dates.length >= params.occurrenceCount) {
      break;
    }
    if (params.endType === "until_date" && untilLimit && cursor.getTime() > untilLimit.getTime()) {
      break;
    }

    dates.push(new Date(cursor));

    if (params.frequency === "weekly") {
      const next = new Date(cursor);
      next.setDate(next.getDate() + 7);
      cursor = next;
    } else if (params.frequency === "biweekly") {
      const next = new Date(cursor);
      next.setDate(next.getDate() + 14);
      cursor = next;
    } else {
      cursor = addMonthsWithDayFallback(cursor, 1, desiredDayOfMonth);
    }
  }
  const truncatedByCap =
    params.endType === "until_date" &&
    untilLimit != null &&
    dates.length === MAX_RECURRING_OCCURRENCES &&
    cursor.getTime() <= untilLimit.getTime();

  return { dates, truncatedByCap };
}

async function ensureCreatorOfficerMembership(supabase: Awaited<ReturnType<typeof createClient>>, clubId: string, userId: string) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data: membership, error: membershipError } = await supabase
      .from("club_members")
      .select("role")
      .eq("club_id", clubId)
      .eq("user_id", userId)
      .maybeSingle();

    if (membershipError) {
      return { ok: false as const };
    }

    if (membership?.role === "officer") {
      return { ok: true as const, repaired: false };
    }

    if (attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }

  console.warn(`Club creator membership missing after club insert for club ${clubId}. Falling back to ensure_club_creator_membership().`);

  const { data: fallbackApplied, error: fallbackError } = await supabase.rpc("ensure_club_creator_membership", {
    target_club_id: clubId,
  });

  if (fallbackError || !fallbackApplied) {
    return { ok: false as const };
  }

  const { data: verifiedMembership, error: verifyError } = await supabase
    .from("club_members")
    .select("role")
    .eq("club_id", clubId)
    .eq("user_id", userId)
    .maybeSingle();

  if (verifyError || verifiedMembership?.role !== "officer") {
    return { ok: false as const };
  }

  return { ok: true as const, repaired: true };
}

export async function createClubAction(formData: FormData) {
  const rawNameValue = formData.get("name");
  const rawTaglineValue = formData.get("tagline");
  const rawName = typeof rawNameValue === "string" ? rawNameValue : "";
  const rawTagline = typeof rawTaglineValue === "string" ? rawTaglineValue : "";
  const description = rawTagline.trim().length > 0 ? rawTagline : "A student club on Clubora.";

  logClubCreateFunnel("submit", {
    hasName: rawName.trim().length > 0,
    hasTagline: rawTagline.trim().length > 0,
    nameLength: rawName.length,
    taglineLength: rawTagline.length,
  });

  const parsed = clubCreateSchema.safeParse({
    name: rawName,
    description,
  });

  if (!parsed.success) {
    logClubCreateFunnel("validation_failed", {
      issue: getSafeValidationErrorMessage(parsed),
      hasName: rawName.trim().length > 0,
      hasTagline: rawTagline.trim().length > 0,
    });
    redirect(`/clubs/create?error=${encodeURIComponent(getSafeValidationErrorMessage(parsed))}`);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  logClubCreateFunnel("validated", {
    userId: user.id,
    usedFallbackDescription: rawTagline.trim().length === 0,
    normalizedNameLength: parsed.data.name.length,
    normalizedDescriptionLength: parsed.data.description.length,
  });

  const rateLimit = await enforceRateLimit({
    policy: "clubCreate",
    userId: user.id,
  });
  if (!rateLimit.success) {
    logClubCreateFunnel("rate_limited", {
      userId: user.id,
    });
    redirect(`/clubs/create?error=${encodeURIComponent(getRateLimitErrorMessage())}`);
  }

  const { error: profileError } = await upsertCurrentUserProfile(supabase, user);

  if (profileError) {
    logClubCreateError("profile-upsert", {
      userId: user.id,
      code: profileError.code,
      message: profileError.message,
      details: profileError.details,
    });
    logClubCreateFunnel("profile_upsert_failed", {
      userId: user.id,
      code: profileError.code,
    });
    redirect("/clubs/create?error=Unable+to+prepare+your+profile.+Please+retry.");
  }

  const clubId = randomUUID();
  let created = false;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const joinCode = generateJoinCode();
    const { error: clubInsertError } = await supabase.rpc("create_club_with_creator_membership", {
      target_club_id: clubId,
      target_name: parsed.data.name,
      target_description: parsed.data.description,
      target_join_code: joinCode,
    });

    if (!clubInsertError) {
      created = true;
      break;
    }

    logClubCreateError("club-insert", {
      userId: user.id,
      clubId,
      joinCode: redactJoinCode(joinCode),
      code: clubInsertError.code,
      message: clubInsertError.message,
      details: clubInsertError.details,
    });

    if (clubInsertError.code !== "23505") {
      redirect("/clubs/create?error=Could+not+create+club.+Please+retry.");
    }
  }
  if (!created) {
    logClubCreateFunnel("join_code_generation_failed", {
      userId: user.id,
      clubId,
    });
    redirect("/clubs/create?error=Could+not+generate+a+join+code.+Please+retry.");
  }

  const membershipCheck = await ensureCreatorOfficerMembership(supabase, clubId, user.id);

  if (!membershipCheck.ok) {
    logClubCreateError("membership-verify", {
      userId: user.id,
      clubId,
    });
    logClubCreateFunnel("creator_membership_verify_failed", {
      userId: user.id,
      clubId,
    });
    redirect("/clubs/create?error=Club+created+but+officer+membership+verification+failed.+Apply+the+latest+database+migration.");
  }

  logClubCreateFunnel("success", {
    userId: user.id,
    clubId,
    repairedCreatorMembership: membershipCheck.repaired,
    usedFallbackDescription: rawTagline.trim().length === 0,
  });

  revalidatePath("/dashboard");
  revalidatePath("/clubs");
  revalidatePath(`/clubs/${clubId}`);
  redirect(`/clubs/${clubId}?setupSuccess=1`);
}

export async function joinClubAction(formData: FormData) {
  const parsed = joinCodeSchema.safeParse({
    joinCode: formData.get("join_code"),
  });

  if (!parsed.success) {
    redirect(`/clubs/join?error=${encodeURIComponent(getSafeValidationErrorMessage(parsed))}`);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const normalizedJoinCode = parsed.data.joinCode;
  logJoinClub("start", {
    userId: user.id,
    joinCode: redactJoinCode(normalizedJoinCode),
  });

  const rateLimit = await enforceRateLimit({
    policy: "clubJoin",
    userId: user.id,
  });
  if (!rateLimit.success) {
    redirect(`/clubs/join?code=${encodeURIComponent(normalizedJoinCode)}&error=${encodeURIComponent(getRateLimitErrorMessage())}`);
  }

  const admin = createAdminClient();
  const { data: clubRow, error: clubLookupError } = await admin
    .from("clubs")
    .select("id, status, require_join_approval")
    .eq("join_code", normalizedJoinCode)
    .maybeSingle();

  if (clubLookupError) {
    logJoinClub("lookup-error", {
      userId: user.id,
      joinCode: redactJoinCode(normalizedJoinCode),
      code: clubLookupError.code,
      message: clubLookupError.message,
      details: clubLookupError.details,
    });
    redirect(
      `/clubs/join?code=${encodeURIComponent(normalizedJoinCode)}&error=${encodeURIComponent("Unexpected error. Please retry.")}`,
    );
  }

  if (!clubRow?.id || (clubRow as { status?: string }).status === "archived") {
    logJoinClub("invalid-code", {
      userId: user.id,
      joinCode: redactJoinCode(normalizedJoinCode),
    });
    redirect(
      `/clubs/join?code=${encodeURIComponent(normalizedJoinCode)}&error=${encodeURIComponent(JOIN_REDIRECT_MESSAGES.invalidOrArchived)}`,
    );
  }

  const clubId = clubRow.id;
  logJoinClub("lookup-success", {
    userId: user.id,
    clubId,
    joinCode: redactJoinCode(normalizedJoinCode),
  });

  const { data: existingMembership } = await supabase
    .from("club_members")
    .select("id")
    .eq("club_id", clubId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existingMembership) {
    logJoinClub("already-member", {
      userId: user.id,
      clubId,
    });
    redirect(
      `/clubs/join?code=${encodeURIComponent(normalizedJoinCode)}&clubId=${clubId}&error=${encodeURIComponent(JOIN_REDIRECT_MESSAGES.alreadyMember)}`,
    );
  }

  const { error: profileError } = await upsertCurrentUserProfile(supabase, user);

  if (profileError) {
    logJoinClub("profile-error", {
      userId: user.id,
      clubId,
      code: profileError.code,
      message: profileError.message,
      details: profileError.details,
    });
    redirect(
      `/clubs/join?code=${encodeURIComponent(normalizedJoinCode)}&error=${encodeURIComponent("Profile missing. Sign out and back in, then try again.")}`,
    );
  }

  logJoinClub("profile-ready", {
    userId: user.id,
    clubId,
  });

  const requiresApproval = Boolean(
    (clubRow as { require_join_approval?: boolean | null }).require_join_approval,
  );

  if (requiresApproval) {
    const { data: submitStatus, error: submitRpcError } = await supabase.rpc("submit_club_join_request", {
      p_join_code: normalizedJoinCode,
    });

    if (submitRpcError) {
      logJoinClub("submit-request-rpc-error", {
        userId: user.id,
        clubId,
        code: submitRpcError.code,
        message: submitRpcError.message,
        details: submitRpcError.details,
      });
      redirect(
        `/clubs/join?code=${encodeURIComponent(normalizedJoinCode)}&error=${encodeURIComponent("Could not submit join request. Please retry.")}`,
      );
    }

    switch (submitStatus) {
      case "ok":
        logJoinClub("join-request-pending", { userId: user.id, clubId });
        revalidatePath("/dashboard");
        revalidatePath("/clubs");
        revalidatePath(`/clubs/${clubId}/members`);
        redirect(
          `/clubs/join?code=${encodeURIComponent(normalizedJoinCode)}&clubId=${clubId}&pending=1&success=${encodeURIComponent(JOIN_REDIRECT_MESSAGES.requestSubmitted)}`,
        );
      case "already_member":
        redirect(
          `/clubs/join?code=${encodeURIComponent(normalizedJoinCode)}&clubId=${clubId}&error=${encodeURIComponent(JOIN_REDIRECT_MESSAGES.alreadyMember)}`,
        );
      case "pending_exists":
        redirect(
          `/clubs/join?code=${encodeURIComponent(normalizedJoinCode)}&clubId=${clubId}&pending=1&success=${encodeURIComponent(JOIN_REDIRECT_MESSAGES.requestAlreadyPending)}`,
        );
      case "invalid_code":
        redirect(
          `/clubs/join?code=${encodeURIComponent(normalizedJoinCode)}&error=${encodeURIComponent(JOIN_REDIRECT_MESSAGES.invalidOrArchived)}`,
        );
      case "archived":
        redirect(
          `/clubs/join?code=${encodeURIComponent(normalizedJoinCode)}&error=${encodeURIComponent(JOIN_REDIRECT_MESSAGES.invalidOrArchived)}`,
        );
      case "approval_not_required":
        break;
      case "not_authenticated":
        redirect("/login");
      default:
        logJoinClub("submit-request-unexpected-status", { userId: user.id, clubId, submitStatus });
        redirect(
          `/clubs/join?code=${encodeURIComponent(normalizedJoinCode)}&error=${encodeURIComponent("Could not complete join. Please retry.")}`,
        );
    }
  }

  const { error: joinError } = await supabase.from("club_members").insert({
    club_id: clubId,
    user_id: user.id,
    role: "member",
  });

  if (joinError) {
    if (joinError.code === "23505") {
      logJoinClub("duplicate-membership", {
        userId: user.id,
        clubId,
      });
      redirect(
        `/clubs/join?code=${encodeURIComponent(normalizedJoinCode)}&clubId=${clubId}&error=${encodeURIComponent(JOIN_REDIRECT_MESSAGES.alreadyMember)}`,
      );
    }

    logJoinClub("membership-insert-error", {
      userId: user.id,
      clubId,
      code: joinError.code,
      message: joinError.message,
      details: joinError.details,
    });
    redirect(
      `/clubs/join?code=${encodeURIComponent(normalizedJoinCode)}&error=${encodeURIComponent("Could not add membership. Please retry.")}`,
    );
  }

  logJoinClub("success", {
    userId: user.id,
    clubId,
  });

  revalidatePath("/dashboard");
  revalidatePath("/clubs");
  revalidatePath(`/clubs/${clubId}`);
  redirect(
    `/clubs/join?code=${encodeURIComponent(normalizedJoinCode)}&clubId=${clubId}&success=${encodeURIComponent(JOIN_REDIRECT_MESSAGES.joinedImmediate)}`,
  );
}

/** Canonical extension per allowlisted attachment MIME (used to normalize stored object names). */
const ATTACHMENT_EXTENSION_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

/**
 * Sniffs the real file type from leading magic bytes. Returns an allowlisted
 * MIME string or null. Never trust the client-supplied `file.type` for this.
 */
function sniffAttachmentMime(bytes: Uint8Array): string | null {
  const matches = (sig: number[], offset = 0) => sig.every((b, i) => bytes[offset + i] === b);

  // PDF: "%PDF-"
  if (matches([0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf";
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (matches([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  // JPEG: FF D8 FF
  if (matches([0xff, 0xd8, 0xff])) return "image/jpeg";
  // GIF: "GIF8"
  if (matches([0x47, 0x49, 0x46, 0x38])) return "image/gif";
  // WebP: "RIFF" .... "WEBP"
  if (matches([0x52, 0x49, 0x46, 0x46]) && matches([0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";

  return null;
}

/** Sanitizes the filename and normalizes its extension to match the server-validated MIME. */
function safeAttachmentFilename(name: string, mime: string): string {
  const ext = ATTACHMENT_EXTENSION_BY_MIME[mime] ?? "bin";
  const base = name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
  const withoutExt = base.replace(/\.[a-zA-Z0-9]+$/, "");
  const safeBase = withoutExt || "file";
  return `${safeBase}.${ext}`;
}

const MAX_PINNED_ANNOUNCEMENTS = 3;

async function enforcePinnedAnnouncementsLimit(
  supabase: Awaited<ReturnType<typeof createClient>>,
  clubId: string,
  targetAnnouncementId?: string,
) {
  const { data: pinnedRows, error: pinnedError } = await supabase
    .from("announcements")
    .select("id")
    .eq("club_id", clubId)
    .eq("is_published", true)
    .eq("is_pinned", true);

  if (pinnedError) {
    return { ok: false as const, error: "Unable to check pinned announcements. Please retry." };
  }

  const countExcludingTarget = (pinnedRows ?? []).filter((row) => row.id !== targetAnnouncementId).length;
  if (countExcludingTarget >= MAX_PINNED_ANNOUNCEMENTS) {
    return {
      ok: false as const,
      error: `You can pin at most ${MAX_PINNED_ANNOUNCEMENTS} published announcements. Unpin one first.`,
    };
  }

  return { ok: true as const };
}

export async function createAnnouncementAction(formData: FormData) {
  const parsed = announcementCreateSchema.safeParse({
    clubId: formData.get("club_id"),
    title: formData.get("title"),
    content: formData.get("content"),
  });

  if (!parsed.success) {
    const fallbackClubId = typeof formData.get("club_id") === "string" ? formData.get("club_id") : "";
    if (fallbackClubId) {
      redirect(`/clubs/${fallbackClubId}/announcements?annError=${encodeURIComponent(getSafeValidationErrorMessage(parsed))}`);
    }
    redirect("/clubs?error=Invalid+club.");
  }

  const extras = parseAnnouncementCreateExtras(formData);
  if (!extras.ok) {
    redirect(
      `/clubs/${parsed.data.clubId}/announcements?annError=${encodeURIComponent(extras.error)}`,
    );
  }

  const attachmentFiles = formData
    .getAll("attachments")
    .filter((f): f is File => typeof f !== "string" && f instanceof File);

  if (attachmentFiles.length > MAX_ANNOUNCEMENT_ATTACHMENTS) {
    redirect(
      `/clubs/${parsed.data.clubId}/announcements?annError=${encodeURIComponent(`You can attach at most ${MAX_ANNOUNCEMENT_ATTACHMENTS} files.`)}`,
    );
  }

  const attachmentTypeError = "Attachments must be images (JPEG, PNG, GIF, WebP) or PDF.";
  const validatedAttachments: { file: File; mime: string }[] = [];
  for (const file of attachmentFiles) {
    if (file.size > MAX_ANNOUNCEMENT_ATTACHMENT_BYTES) {
      redirect(
        `/clubs/${parsed.data.clubId}/announcements?annError=${encodeURIComponent("Each attachment must be 5 MB or smaller.")}`,
      );
    }
    const declaredMime = (file.type || "").toLowerCase();
    if (!ANNOUNCEMENT_ATTACHMENT_MIMES.has(declaredMime)) {
      redirect(
        `/clubs/${parsed.data.clubId}/announcements?annError=${encodeURIComponent(attachmentTypeError)}`,
      );
    }
    // Authoritative check: sniff the real type from leading bytes; client mime is spoofable.
    const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    const sniffedMime = sniffAttachmentMime(header);
    if (!sniffedMime || !ANNOUNCEMENT_ATTACHMENT_MIMES.has(sniffedMime) || sniffedMime !== declaredMime) {
      redirect(
        `/clubs/${parsed.data.clubId}/announcements?annError=${encodeURIComponent(attachmentTypeError)}`,
      );
    }
    validatedAttachments.push({ file, mime: sniffedMime });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const rateLimit = await enforceRateLimit({
    policy: "announcementCreate",
    userId: user.id,
    hint: parsed.data.clubId,
  });
  if (!rateLimit.success) {
    redirect(`/clubs/${parsed.data.clubId}/announcements?annError=${encodeURIComponent(getRateLimitErrorMessage())}`);
  }

  const { data: membership, error: membershipError } = await supabase
    .from("club_members")
    .select("user_id")
    .eq("club_id", parsed.data.clubId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (membershipError || !membership) {
    redirect(`/clubs/${parsed.data.clubId}/announcements?annError=You+do+not+have+access+to+this+club.`);
  }

  const active = await assertClubActiveForMutations(parsed.data.clubId);
  if (!active.ok) {
    redirect(`/clubs/${parsed.data.clubId}/announcements?annError=${encodeURIComponent(active.message)}`);
  }

  const canPost = await hasPermission(user.id, parsed.data.clubId, "announcements.create");
  if (!canPost) {
    redirect(`/clubs/${parsed.data.clubId}/announcements?annError=You+do+not+have+permission+to+create+announcements.`);
  }

  const { data: clubFlags } = await supabase
    .from("clubs")
    .select("require_announcement_approval")
    .eq("id", parsed.data.clubId)
    .maybeSingle();
  const requireAnnouncementApproval = Boolean(clubFlags?.require_announcement_approval);

  const submittedForReview =
    requireAnnouncementApproval
    && (extras.data.isPublished || Boolean(extras.data.scheduledForIso));

  if (extras.data.isPinned && !submittedForReview) {
    const pinCheck = await enforcePinnedAnnouncementsLimit(supabase, parsed.data.clubId);
    if (!pinCheck.ok) {
      redirect(`/clubs/${parsed.data.clubId}/announcements?annError=${encodeURIComponent(pinCheck.error)}`);
    }
  }

  let approvalStatus: "draft" | "pending" | "approved" = "draft";
  let isPublishedRow = false;
  let scheduledForRow = extras.data.scheduledForIso;
  let isPinnedRow = submittedForReview ? false : extras.data.isPinned;

  if (!requireAnnouncementApproval) {
    if (!extras.data.isPublished && !extras.data.scheduledForIso) {
      approvalStatus = "draft";
      isPublishedRow = false;
    } else if (extras.data.scheduledForIso) {
      approvalStatus = "approved";
      isPublishedRow = false;
    } else {
      approvalStatus = "approved";
      isPublishedRow = true;
    }
  } else if (!extras.data.isPublished && !extras.data.scheduledForIso) {
    approvalStatus = "draft";
    isPublishedRow = false;
  } else {
    approvalStatus = "pending";
    isPublishedRow = false;
  }

  const { data: inserted, error: insertError } = await supabase
    .from("announcements")
    .insert({
      club_id: parsed.data.clubId,
      title: parsed.data.title,
      content: parsed.data.content,
      created_by: user.id,
      poll_question: extras.data.pollQuestion,
      poll_options: extras.data.pollOptions,
      scheduled_for: scheduledForRow,
      is_published: isPublishedRow,
      approval_status: approvalStatus,
      is_urgent: extras.data.isUrgent,
      is_pinned: isPinnedRow,
      pinned_at: isPinnedRow ? new Date().toISOString() : null,
    })
    .select("id")
    .maybeSingle();

  if (insertError || !inserted?.id) {
    redirect(`/clubs/${parsed.data.clubId}/announcements?annError=Unable+to+create+announcement.+Please+retry.`);
  }

  const announcementId = inserted.id;
  let announcementActivityId: string | null = null;
  if (isPublishedRow && approvalStatus === "approved") {
    announcementActivityId = await createActivityEvent({
      type: "announcement.created",
      actorId: user.id,
      clubId: parsed.data.clubId,
      entityId: announcementId,
      targetLabel: parsed.data.title,
      href: `/clubs/${parsed.data.clubId}/announcements#announcement-${announcementId}`,
      metadata: {
        has_poll: Boolean(extras.data.pollQuestion),
        scheduled: Boolean(scheduledForRow),
        urgent: extras.data.isUrgent,
      },
    });
  }

  if (validatedAttachments.length > 0) {
    const admin = createAdminClient();
    for (const { file, mime } of validatedAttachments) {
      const path = `${parsed.data.clubId}/${announcementId}/${randomUUID()}-${safeAttachmentFilename(file.name, mime)}`;
      const buf = Buffer.from(await file.arrayBuffer());
      const { error: upErr } = await admin.storage.from("announcement-attachments").upload(path, buf, {
        contentType: mime,
        upsert: false,
      });
      if (upErr) {
        console.error("[announcements] attachment upload failed", upErr.message);
        redirect(
          `/clubs/${parsed.data.clubId}/announcements?annError=${encodeURIComponent("Could not upload an attachment. Please retry.")}`,
        );
      }

      const { error: attErr } = await admin.from("announcement_attachments").insert({
        announcement_id: announcementId,
        file_url: path,
        file_name: file.name.slice(0, 240),
        file_type: mime,
      });

      if (attErr) {
        console.error("[announcements] attachment row insert failed", attErr.message);
        redirect(
          `/clubs/${parsed.data.clubId}/announcements?annError=${encodeURIComponent("Could not save attachment metadata. Please retry.")}`,
        );
      }
    }
  }

  if (isPublishedRow && approvalStatus === "approved") {
    await sendAnnouncementMemberBroadcast({
      supabase,
      clubId: parsed.data.clubId,
      actorId: user.id,
      announcementId,
      title: parsed.data.title,
      hasPoll: Boolean(extras.data.pollQuestion),
      activityEventId: announcementActivityId,
      isUrgent: extras.data.isUrgent,
    });
  }

  if (approvalStatus === "pending") {
    await notifyApproversAnnouncementSubmitted({
      clubId: parsed.data.clubId,
      actorId: user.id,
      announcementId,
      title: parsed.data.title,
    });
  }

  revalidatePath(`/clubs/${parsed.data.clubId}`);
  revalidatePath(`/clubs/${parsed.data.clubId}/announcements`);
  revalidatePath("/dashboard");

  let successMsg: string;
  if (approvalStatus === "pending") {
    successMsg = "Submitted for advisor approval.";
  } else if (isPublishedRow) {
    successMsg = "Announcement posted.";
  } else if (scheduledForRow) {
    successMsg = "Announcement scheduled — members will be notified when it publishes.";
  } else {
    successMsg = "Draft saved.";
  }
  redirect(`/clubs/${parsed.data.clubId}/announcements?annSuccess=${encodeURIComponent(successMsg)}`);
}

export async function updateAnnouncementAction(formData: FormData) {
  const parsed = announcementUpdateSchema.safeParse({
    clubId: formData.get("club_id"),
    announcementId: formData.get("announcement_id"),
    title: formData.get("title"),
    content: formData.get("content"),
  });

  if (!parsed.success) {
    const fallbackClubId = typeof formData.get("club_id") === "string" ? formData.get("club_id") : "";
    if (fallbackClubId) {
      redirect(`/clubs/${fallbackClubId}/announcements?annError=${encodeURIComponent(getSafeValidationErrorMessage(parsed))}`);
    }
    redirect("/clubs?error=Invalid+announcement.");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const active = await assertClubActiveForMutations(parsed.data.clubId);
  if (!active.ok) {
    redirect(`/clubs/${parsed.data.clubId}/announcements?annError=${encodeURIComponent(active.message)}`);
  }

  const canEdit = await hasPermission(user.id, parsed.data.clubId, "announcements.edit");
  if (!canEdit) {
    redirect(`/clubs/${parsed.data.clubId}/announcements?annError=You+do+not+have+permission+to+edit+announcements.`);
  }

  const { data: existing, error: existingError } = await supabase
    .from("announcements")
    .select(
      "id, club_id, is_published, is_pinned, poll_question, member_broadcast_sent_at, approval_status, scheduled_for",
    )
    .eq("id", parsed.data.announcementId)
    .maybeSingle();

  if (existingError || !existing || existing.club_id !== parsed.data.clubId) {
    redirect(`/clubs/${parsed.data.clubId}/announcements?annError=Announcement+not+found+for+this+club.`);
  }

  const { data: clubFlagsUp } = await supabase
    .from("clubs")
    .select("require_announcement_approval")
    .eq("id", parsed.data.clubId)
    .maybeSingle();
  const requireAnnouncementApprovalUp = Boolean(clubFlagsUp?.require_announcement_approval);

  const intent = parseAnnouncementUpdateIntent(formData);
  const wantsUrgent = formData.get("is_urgent") === "on";
  const wantsPinned = formData.get("is_pinned") === "on";

  const typedExisting = existing as typeof existing & { approval_status?: string | null };

  let nextIsPublished =
    intent === "publish_now"
      ? true
      : intent === "save_draft"
        ? existing.is_published
          ? true
          : false
        : existing.is_published;

  let nextApprovalStatus = (typedExisting.approval_status ?? "approved") as "draft" | "pending" | "approved" | "rejected";
  let submittedPending = false;

  if (intent === "publish_now" && requireAnnouncementApprovalUp) {
    nextIsPublished = false;
    nextApprovalStatus = "pending";
    submittedPending = true;
  } else if (intent === "save_draft") {
    nextApprovalStatus =
      typedExisting.approval_status === "rejected" || typedExisting.approval_status === "pending"
        ? "draft"
        : (typedExisting.approval_status as "draft" | "pending" | "approved" | "rejected");
  } else if (intent === "publish_now" && !requireAnnouncementApprovalUp) {
    nextApprovalStatus = "approved";
  }

  const nextIsPinned = nextIsPublished && !submittedPending ? wantsPinned : false;

  if (nextIsPinned && (!existing.is_pinned || !existing.is_published)) {
    const pinCheck = await enforcePinnedAnnouncementsLimit(supabase, parsed.data.clubId, parsed.data.announcementId);
    if (!pinCheck.ok) {
      redirect(`/clubs/${parsed.data.clubId}/announcements?annError=${encodeURIComponent(pinCheck.error)}`);
    }
  }

  const becomingPublished =
    !existing.is_published && nextIsPublished && nextApprovalStatus === "approved" && !requireAnnouncementApprovalUp;

  const nowIso = new Date().toISOString();
  const updatePayload: {
    title: string;
    content: string;
    is_urgent: boolean;
    is_published: boolean;
    is_pinned: boolean;
    approval_status?: string;
    rejection_reason?: string | null;
    pinned_at?: string | null;
    scheduled_for?: string | null;
    member_broadcast_sent_at?: string | null;
  } = {
    title: parsed.data.title,
    content: parsed.data.content,
    is_urgent: wantsUrgent,
    is_published: nextIsPublished,
    is_pinned: submittedPending ? false : nextIsPinned,
    approval_status: nextApprovalStatus,
  };
  if (submittedPending) {
    updatePayload.rejection_reason = null;
  }
  if (!updatePayload.is_pinned) {
    updatePayload.pinned_at = null;
  } else if (!existing.is_pinned) {
    updatePayload.pinned_at = nowIso;
  }
  if (nextIsPublished) {
    updatePayload.scheduled_for = null;
  }
  if (becomingPublished) {
    updatePayload.member_broadcast_sent_at = null;
  }

  const { error: updateError } = await supabase
    .from("announcements")
    .update(updatePayload)
    .eq("id", parsed.data.announcementId)
    .eq("club_id", parsed.data.clubId);

  if (updateError) {
    redirect(`/clubs/${parsed.data.clubId}/announcements?annError=Unable+to+update+announcement.+Please+retry.`);
  }

  if (submittedPending) {
    await notifyApproversAnnouncementSubmitted({
      clubId: parsed.data.clubId,
      actorId: user.id,
      announcementId: parsed.data.announcementId,
      title: parsed.data.title,
    });
  }

  if (becomingPublished) {
    const activityEventId = await createActivityEvent({
      type: "announcement.created",
      actorId: user.id,
      clubId: parsed.data.clubId,
      entityId: parsed.data.announcementId,
      targetLabel: parsed.data.title,
      href: `/clubs/${parsed.data.clubId}/announcements#announcement-${parsed.data.announcementId}`,
      metadata: {
        published_from_draft: true,
        has_poll: Boolean(existing.poll_question),
        urgent: wantsUrgent,
      },
    });

    await sendAnnouncementMemberBroadcast({
      supabase,
      clubId: parsed.data.clubId,
      actorId: user.id,
      announcementId: parsed.data.announcementId,
      title: parsed.data.title,
      hasPoll: Boolean(existing.poll_question),
      activityEventId,
      isUrgent: wantsUrgent,
    });
  }

  revalidatePath(`/clubs/${parsed.data.clubId}`);
  revalidatePath(`/clubs/${parsed.data.clubId}/announcements`);
  revalidatePath("/dashboard");

  let successMessage: string;
  if (submittedPending) {
    successMessage = "Submitted for advisor approval.";
  } else if (becomingPublished) {
    successMessage = "Draft published.";
  } else if (nextIsPublished) {
    successMessage = "Announcement updated.";
  } else {
    successMessage = "Draft updated.";
  }
  redirect(`/clubs/${parsed.data.clubId}/announcements?annSuccess=${encodeURIComponent(successMessage)}`);
}

export async function deleteAnnouncementAction(formData: FormData) {
  const parsed = announcementDeleteSchema.safeParse({
    clubId: formData.get("club_id"),
    announcementId: formData.get("announcement_id"),
  });

  if (!parsed.success) {
    const fallbackClubId = typeof formData.get("club_id") === "string" ? formData.get("club_id") : "";
    if (fallbackClubId) {
      redirect(`/clubs/${fallbackClubId}/announcements?annError=${encodeURIComponent(getSafeValidationErrorMessage(parsed))}`);
    }
    redirect("/clubs?error=Invalid+announcement.");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const active = await assertClubActiveForMutations(parsed.data.clubId);
  if (!active.ok) {
    redirect(`/clubs/${parsed.data.clubId}/announcements?annError=${encodeURIComponent(active.message)}`);
  }

  const canDelete = await hasPermission(user.id, parsed.data.clubId, "announcements.delete");
  if (!canDelete) {
    redirect(`/clubs/${parsed.data.clubId}/announcements?annError=You+do+not+have+permission+to+delete+announcements.`);
  }

  const { data: existing, error: existingError } = await supabase
    .from("announcements")
    .select("id, club_id")
    .eq("id", parsed.data.announcementId)
    .maybeSingle();

  if (existingError || !existing || existing.club_id !== parsed.data.clubId) {
    redirect(`/clubs/${parsed.data.clubId}/announcements?annError=Announcement+not+found+for+this+club.`);
  }

  const admin = createAdminClient();
  const { data: attachmentRows } = await admin
    .from("announcement_attachments")
    .select("file_url")
    .eq("announcement_id", parsed.data.announcementId);
  const filePaths = (attachmentRows ?? []).map((row) => row.file_url).filter((value): value is string => Boolean(value));
  if (filePaths.length > 0) {
    await admin.storage.from("announcement-attachments").remove(filePaths);
  }

  const { error: deleteError } = await supabase
    .from("announcements")
    .delete()
    .eq("id", parsed.data.announcementId)
    .eq("club_id", parsed.data.clubId);
  if (deleteError) {
    redirect(`/clubs/${parsed.data.clubId}/announcements?annError=Unable+to+delete+announcement.+Please+retry.`);
  }

  revalidatePath(`/clubs/${parsed.data.clubId}`);
  revalidatePath(`/clubs/${parsed.data.clubId}/announcements`);
  revalidatePath("/dashboard");
  redirect(`/clubs/${parsed.data.clubId}/announcements?annSuccess=Announcement+deleted.`);
}

export async function updateMemberRoleAction(formData: FormData) {
  const parsed = memberRoleUpdateSchema.safeParse({
    clubId: formData.get("club_id"),
    userId: formData.get("user_id"),
    role: formData.get("role"),
  });

  if (!parsed.success) {
    const fallbackClubId = typeof formData.get("club_id") === "string" ? formData.get("club_id") : "";
    if (fallbackClubId) {
      redirect(`/clubs/${fallbackClubId}/members?memberError=${encodeURIComponent(getSafeValidationErrorMessage(parsed))}`);
    }
    redirect("/clubs?error=Invalid+member+request.");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const active = await assertClubActiveForMutations(parsed.data.clubId);
  if (!active.ok) {
    redirect(`/clubs/${parsed.data.clubId}/members?memberError=${encodeURIComponent(active.message)}`);
  }

  const canAssignRoles = await hasPermission(user.id, parsed.data.clubId, "members.assign_roles");
  if (!canAssignRoles) {
    redirect(`/clubs/${parsed.data.clubId}/members?memberError=You+do+not+have+permission+to+update+member+roles.`);
  }

  const { data: currentMembership } = await supabase
    .from("club_members")
    .select("role")
    .eq("club_id", parsed.data.clubId)
    .eq("user_id", parsed.data.userId)
    .maybeSingle();

  const { data: status, error } = await supabase.rpc("update_club_member_role", {
    target_club_id: parsed.data.clubId,
    target_user_id: parsed.data.userId,
    new_role: parsed.data.role,
  });

  if (error || status !== "ok") {
    redirect(`/clubs/${parsed.data.clubId}/members?memberError=${encodeURIComponent(getMemberManagementErrorMessage(status ?? "unknown"))}`);
  }

  if (currentMembership?.role !== parsed.data.role) {
    await createActivityEvent({
      type: parsed.data.role === "officer" ? "role.assigned" : "role.removed",
      actorId: user.id,
      clubId: parsed.data.clubId,
      entityId: null,
      targetLabel: parsed.data.role === "officer" ? "Officer role" : "Officer role",
      href: `/clubs/${parsed.data.clubId}/members`,
      metadata: { target_user_id: parsed.data.userId, previous_role: currentMembership?.role ?? null },
    });
  }

  revalidatePath(`/clubs/${parsed.data.clubId}`);
  revalidatePath("/clubs");
  revalidatePath("/dashboard");
  redirect(`/clubs/${parsed.data.clubId}/members?memberSuccess=Member+updated.`);
}

export async function removeMemberAction(formData: FormData) {
  const parsed = memberRemovalSchema.safeParse({
    clubId: formData.get("club_id"),
    userId: formData.get("user_id"),
  });

  if (!parsed.success) {
    const fallbackClubId = typeof formData.get("club_id") === "string" ? formData.get("club_id") : "";
    if (fallbackClubId) {
      redirect(`/clubs/${fallbackClubId}/members?memberError=${encodeURIComponent(getSafeValidationErrorMessage(parsed))}`);
    }
    redirect("/clubs?error=Invalid+member+request.");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const active = await assertClubActiveForMutations(parsed.data.clubId);
  if (!active.ok) {
    redirect(`/clubs/${parsed.data.clubId}/members?memberError=${encodeURIComponent(active.message)}`);
  }

  const canRemove = await hasPermission(user.id, parsed.data.clubId, "members.remove");
  if (!canRemove) {
    redirect(`/clubs/${parsed.data.clubId}/members?memberError=You+do+not+have+permission+to+remove+members.`);
  }

  const { data: status, error } = await supabase.rpc("remove_club_member", {
    target_club_id: parsed.data.clubId,
    target_user_id: parsed.data.userId,
  });

  if (error || status !== "ok") {
    redirect(`/clubs/${parsed.data.clubId}/members?memberError=${encodeURIComponent(getMemberManagementErrorMessage(status ?? "unknown"))}`);
  }

  revalidatePath(`/clubs/${parsed.data.clubId}`);
  revalidatePath("/clubs");
  revalidatePath("/dashboard");
  redirect(`/clubs/${parsed.data.clubId}/members?memberSuccess=Member+removed.`);
}

export async function markMemberAlumniAction(formData: FormData) {
  const parsed = memberMarkAlumniSchema.safeParse({
    clubId: formData.get("club_id"),
    userId: formData.get("user_id"),
  });

  if (!parsed.success) {
    const fallbackClubId = typeof formData.get("club_id") === "string" ? formData.get("club_id") : "";
    if (fallbackClubId) {
      redirect(`/clubs/${fallbackClubId}/members?memberError=${encodeURIComponent(getSafeValidationErrorMessage(parsed))}`);
    }
    redirect("/clubs?error=Invalid+member+request.");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const active = await assertClubActiveForMutations(parsed.data.clubId);
  if (!active.ok) {
    redirect(`/clubs/${parsed.data.clubId}/members?memberError=${encodeURIComponent(active.message)}`);
  }

  const canMark = await hasPermission(user.id, parsed.data.clubId, "members.remove");
  if (!canMark) {
    redirect(`/clubs/${parsed.data.clubId}/members?memberError=You+do+not+have+permission+to+update+membership+status.`);
  }

  const { data: status, error } = await supabase.rpc("set_club_membership_alumni", {
    p_club_id: parsed.data.clubId,
    p_target_user_id: parsed.data.userId,
  });

  if (error || status !== "ok") {
    redirect(`/clubs/${parsed.data.clubId}/members?memberError=${encodeURIComponent(getMemberManagementErrorMessage(status ?? "unknown"))}`);
  }

  revalidatePath(`/clubs/${parsed.data.clubId}`);
  revalidatePath(`/clubs/${parsed.data.clubId}/settings`);
  revalidatePath("/clubs");
  revalidatePath("/dashboard");
  redirect(`/clubs/${parsed.data.clubId}/members?memberSuccess=Member+marked+as+alumni.`);
}

export async function createEventAction(formData: FormData) {
  const duplicateEventIdRaw = formData.get("duplicate_event_id");
  const duplicateEventId = typeof duplicateEventIdRaw === "string" ? duplicateEventIdRaw : "";
  const duplicateQuery = duplicateEventId ? `&duplicateEventId=${encodeURIComponent(duplicateEventId)}` : "";
  const rawDescriptionValue = formData.get("description");
  const rawLocationValue = formData.get("location");
  const rawEventTypeValue = formData.get("event_type");
  const rawDescription = typeof rawDescriptionValue === "string" ? rawDescriptionValue : "";
  const rawLocation = typeof rawLocationValue === "string" ? rawLocationValue : "";
  const rawEventType = typeof rawEventTypeValue === "string" ? rawEventTypeValue : "";
  const normalizedDescription = rawDescription.trim().length > 0 ? rawDescription : "Club event.";
  const normalizedLocation = rawLocation.trim().length > 0 ? rawLocation : "TBD";
  const normalizedEventType = rawEventType.trim().length > 0 ? rawEventType : "Meeting";

  const parsed = eventCreateSchema.safeParse({
    clubId: formData.get("club_id"),
    title: formData.get("title"),
    description: normalizedDescription,
    location: normalizedLocation,
    eventType: normalizedEventType,
    capacity: formData.get("capacity"),
    eventDate: formData.get("event_date"),
  });

  if (!parsed.success) {
    const fallbackClubId = typeof formData.get("club_id") === "string" ? formData.get("club_id") : "";
    if (fallbackClubId) {
      redirect(`/clubs/${fallbackClubId}/events?eventError=${encodeURIComponent(getSafeValidationErrorMessage(parsed))}${duplicateQuery}#create-event`);
    }
    redirect("/clubs?error=Invalid+club.");
  }
  const eventDate = new Date(parsed.data.eventDate);
  const recurrenceParsed = parseEventRecurrenceSettings(formData, parsed.data.eventDate);
  if (!recurrenceParsed.ok) {
    redirect(
      `/clubs/${parsed.data.clubId}/events?eventError=${encodeURIComponent(recurrenceParsed.error)}${duplicateQuery}#create-event`,
    );
  }
  const recurrenceSettings = recurrenceParsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const rateLimit = await enforceRateLimit({
    policy: "eventCreate",
    userId: user.id,
    hint: parsed.data.clubId,
  });
  if (!rateLimit.success) {
    redirect(`/clubs/${parsed.data.clubId}/events?eventError=${encodeURIComponent(getRateLimitErrorMessage())}${duplicateQuery}#create-event`);
  }

  const { data: membership, error: membershipError } = await supabase
    .from("club_members")
    .select("role")
    .eq("club_id", parsed.data.clubId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (membershipError || !membership) {
    redirect(`/clubs/${parsed.data.clubId}/events?eventError=You+do+not+have+access+to+this+club.${duplicateQuery}#create-event`);
  }

  const active = await assertClubActiveForMutations(parsed.data.clubId);
  if (!active.ok) {
    redirect(
      `/clubs/${parsed.data.clubId}/events?eventError=${encodeURIComponent(active.message)}${duplicateQuery}#create-event`,
    );
  }

  // RBAC check: requires the events.create permission (granted to President + Officer by default).
  const canCreate = await hasPermission(user.id, parsed.data.clubId, "events.create");
  if (!canCreate) {
    redirect(`/clubs/${parsed.data.clubId}/events?eventError=You+don't+have+permission+to+create+events.${duplicateQuery}#create-event`);
  }

  const { data: eventClubFlags } = await supabase
    .from("clubs")
    .select("require_event_approval")
    .eq("id", parsed.data.clubId)
    .maybeSingle();
  const requireEventApproval = Boolean(eventClubFlags?.require_event_approval);
  const initialApprovalStatus = requireEventApproval ? ("pending" as const) : ("approved" as const);

  let insertedEvent: { id: string; title: string } | null = null;
  let createdOccurrences = 1;
  if (!recurrenceSettings) {
    const { data: oneTimeEvent, error: insertError } = await supabase
      .from("events")
      .insert({
        club_id: parsed.data.clubId,
        title: parsed.data.title,
        description: parsed.data.description,
        location: parsed.data.location,
        event_type: parsed.data.eventType,
        capacity: parsed.data.capacity,
        event_date: eventDate.toISOString(),
        created_by: user.id,
        approval_status: initialApprovalStatus,
      })
      .select("id, title")
      .maybeSingle();

    if (insertError || !oneTimeEvent?.id) {
      redirect(
        `/clubs/${parsed.data.clubId}/events?eventError=Unable+to+create+event.+Please+retry.${duplicateQuery}#create-event`,
      );
    }
    insertedEvent = oneTimeEvent;
  } else {
    const generation = generateRecurringOccurrenceDates({
      firstStartAt: eventDate,
      frequency: recurrenceSettings.frequency,
      endType: recurrenceSettings.endType,
      occurrenceCount: recurrenceSettings.occurrenceCount,
      untilDate: recurrenceSettings.untilDate,
    });
    const occurrenceDates = generation.dates;

    if (occurrenceDates.length < 1) {
      redirect(
        `/clubs/${parsed.data.clubId}/events?eventError=Recurrence+settings+did+not+produce+any+occurrences.${duplicateQuery}#create-event`,
      );
    }
    if (recurrenceSettings.endType === "until_date" && generation.truncatedByCap) {
      redirect(
        `/clubs/${parsed.data.clubId}/events?eventError=${encodeURIComponent(`This series exceeds the ${MAX_RECURRING_OCCURRENCES} occurrence limit. Choose an earlier end date.`)}${duplicateQuery}#create-event`,
      );
    }

    createdOccurrences = occurrenceDates.length;
    const { data: seriesRow, error: seriesError } = await supabase
      .from("event_series")
      .insert({
        club_id: parsed.data.clubId,
        created_by: user.id,
        title: parsed.data.title,
        description: parsed.data.description,
        location: parsed.data.location,
        event_type: parsed.data.eventType,
        capacity: parsed.data.capacity,
        starts_at: eventDate.toISOString(),
        duration_minutes: recurrenceSettings.durationMinutes,
        recurrence_type: recurrenceSettings.frequency,
        end_type: recurrenceSettings.endType,
        occurrence_count: recurrenceSettings.occurrenceCount,
        until_date: recurrenceSettings.untilDate,
      })
      .select("id")
      .maybeSingle();

    if (seriesError || !seriesRow?.id) {
      redirect(
        `/clubs/${parsed.data.clubId}/events?eventError=Unable+to+create+recurring+series.+Please+retry.${duplicateQuery}#create-event`,
      );
    }

    const eventRows = occurrenceDates.map((date, idx) => ({
      club_id: parsed.data.clubId,
      title: parsed.data.title,
      description: parsed.data.description,
      location: parsed.data.location,
      event_type: parsed.data.eventType,
      capacity: parsed.data.capacity,
      event_date: date.toISOString(),
      created_by: user.id,
      series_id: seriesRow.id,
      series_occurrence: idx + 1,
      approval_status: initialApprovalStatus,
    }));

    const { data: createdEvents, error: recurringInsertError } = await supabase
      .from("events")
      .insert(eventRows)
      .select("id, title, event_date")
      .order("event_date", { ascending: true });

    if (recurringInsertError || !createdEvents || createdEvents.length === 0) {
      await supabase.from("event_series").delete().eq("id", seriesRow.id);
      redirect(
        `/clubs/${parsed.data.clubId}/events?eventError=Unable+to+create+recurring+occurrences.+Please+retry.${duplicateQuery}#create-event`,
      );
    }

    insertedEvent = { id: createdEvents[0]!.id, title: createdEvents[0]!.title };
  }

  if (!insertedEvent) {
    redirect(`/clubs/${parsed.data.clubId}/events?eventError=Unable+to+create+event.+Please+retry.${duplicateQuery}#create-event`);
  }

  if (requireEventApproval) {
    await notifyApproversEventSubmitted({
      clubId: parsed.data.clubId,
      actorId: user.id,
      eventId: insertedEvent.id,
      title: insertedEvent.title,
    });
  } else {
    await notifyClubMembersOfPublishedEvent({
      supabase,
      clubId: parsed.data.clubId,
      excludeNotifyUserId: user.id,
      eventId: insertedEvent.id,
      title: insertedEvent.title,
      eventDate,
      location: parsed.data.location,
      occurrenceCount: createdOccurrences,
      actorId: user.id,
    });
  }

  revalidatePath(`/clubs/${parsed.data.clubId}`);
  const successMsg = requireEventApproval
    ? createdOccurrences > 1
      ? `Recurring series submitted (${createdOccurrences} events) for advisor approval.`
      : "Event submitted for advisor approval."
    : createdOccurrences > 1
      ? `Recurring series created (${createdOccurrences} events).`
      : "Event created.";
  redirect(`/clubs/${parsed.data.clubId}/events?eventSuccess=${encodeURIComponent(successMsg)}.#events`);
}

export async function updateEventAction(formData: FormData) {
  const rawDescriptionValue = formData.get("description");
  const rawLocationValue = formData.get("location");
  const rawEventTypeValue = formData.get("event_type");
  const rawDescription = typeof rawDescriptionValue === "string" ? rawDescriptionValue : "";
  const rawLocation = typeof rawLocationValue === "string" ? rawLocationValue : "";
  const rawEventType = typeof rawEventTypeValue === "string" ? rawEventTypeValue : "";
  const normalizedDescription = rawDescription.trim().length > 0 ? rawDescription : "Club event.";
  const normalizedLocation = rawLocation.trim().length > 0 ? rawLocation : "TBD";
  const normalizedEventType = rawEventType.trim().length > 0 ? rawEventType : "Meeting";

  const parsed = eventUpdateSchema.safeParse({
    clubId: formData.get("club_id"),
    eventId: formData.get("event_id"),
    title: formData.get("title"),
    description: normalizedDescription,
    location: normalizedLocation,
    eventType: normalizedEventType,
    capacity: formData.get("capacity"),
    eventDate: formData.get("event_date"),
  });

  if (!parsed.success) {
    const fallbackClubId = typeof formData.get("club_id") === "string" ? formData.get("club_id") : "";
    const fallbackEventId = typeof formData.get("event_id") === "string" ? formData.get("event_id") : "";
    if (fallbackClubId) {
      redirect(`/clubs/${fallbackClubId}/events?eventError=${encodeURIComponent(getSafeValidationErrorMessage(parsed))}#event-${fallbackEventId}`);
    }
    redirect("/clubs?error=Invalid+event+request.");
  }

  const eventDate = new Date(parsed.data.eventDate);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const rateLimit = await enforceRateLimit({
    policy: "eventCreate",
    userId: user.id,
    hint: parsed.data.clubId,
  });
  if (!rateLimit.success) {
    redirect(`/clubs/${parsed.data.clubId}/events?eventError=${encodeURIComponent(getRateLimitErrorMessage())}#event-${parsed.data.eventId}`);
  }

  const active = await assertClubActiveForMutations(parsed.data.clubId);
  if (!active.ok) {
    redirect(`/clubs/${parsed.data.clubId}/events?eventError=${encodeURIComponent(active.message)}#event-${parsed.data.eventId}`);
  }

  const canEdit = await hasPermission(user.id, parsed.data.clubId, "events.edit");
  if (!canEdit) {
    redirect(`/clubs/${parsed.data.clubId}/events?eventError=You+do+not+have+permission+to+edit+events.#event-${parsed.data.eventId}`);
  }

  const { data: existingEvent, error: existingEventError } = await supabase
    .from("events")
    .select("id, club_id, event_date, capacity, approval_status, title")
    .eq("id", parsed.data.eventId)
    .maybeSingle();

  if (existingEventError || !existingEvent || existingEvent.club_id !== parsed.data.clubId) {
    redirect(`/clubs/${parsed.data.clubId}/events?eventError=Event+not+found+for+this+club.`);
  }

  if (new Date(existingEvent.event_date).getTime() <= Date.now()) {
    redirect(`/clubs/${parsed.data.clubId}/events?eventError=Past+events+cannot+be+edited.+Create+a+new+event+instead.#event-${parsed.data.eventId}`);
  }

  if (eventDate.getTime() <= Date.now()) {
    redirect(`/clubs/${parsed.data.clubId}/events?eventError=Event+date+must+be+in+the+future.#event-${parsed.data.eventId}`);
  }

  const { data: updateClubFlags } = await supabase
    .from("clubs")
    .select("require_event_approval")
    .eq("id", parsed.data.clubId)
    .maybeSingle();
  const requireEventApprovalUpdate = Boolean(updateClubFlags?.require_event_approval);
  const prevApproval = (existingEvent as { approval_status?: string }).approval_status ?? "approved";
  let notifyApproversForEvent = false;

  const baseUpdate: {
    title: string;
    description: string;
    location: string;
    event_type: string;
    capacity: number | null;
    event_date: string;
    approval_status?: string;
    rejection_reason?: null;
    approved_at?: null;
    approved_by?: null;
  } = {
    title: parsed.data.title,
    description: parsed.data.description,
    location: parsed.data.location,
    event_type: parsed.data.eventType,
    capacity: parsed.data.capacity,
    event_date: eventDate.toISOString(),
  };

  if (requireEventApprovalUpdate && (prevApproval === "approved" || prevApproval === "rejected")) {
    baseUpdate.approval_status = "pending";
    baseUpdate.rejection_reason = null;
    baseUpdate.approved_at = null;
    baseUpdate.approved_by = null;
    notifyApproversForEvent = true;
  }

  const { error: updateError } = await supabase.from("events").update(baseUpdate).eq("id", parsed.data.eventId).eq("club_id", parsed.data.clubId);

  if (updateError) {
    redirect(`/clubs/${parsed.data.clubId}/events?eventError=Unable+to+update+event.+Please+retry.#event-${parsed.data.eventId}`);
  }

  if (notifyApproversForEvent) {
    await notifyApproversEventSubmitted({
      clubId: parsed.data.clubId,
      actorId: user.id,
      eventId: parsed.data.eventId,
      title: parsed.data.title,
    });
  }

  const previousCapacity = existingEvent.capacity;
  if (previousCapacity !== parsed.data.capacity) {
    const { error: waitlistReconcileError } = await supabase.rpc("reconcile_event_waitlist", {
      target_event_id: parsed.data.eventId,
    });
    if (waitlistReconcileError) {
      redirect(`/clubs/${parsed.data.clubId}/events?eventError=Event+updated,+but+waitlist+sync+failed.+Please+retry.#event-${parsed.data.eventId}`);
    }
  }

  revalidatePath(`/clubs/${parsed.data.clubId}`);
  revalidatePath(`/clubs/${parsed.data.clubId}/events`);
  revalidatePath(`/clubs/${parsed.data.clubId}/events/history`);
  const successMsg = notifyApproversForEvent ? "Updates submitted for advisor approval." : "Event updated.";
  redirect(`/clubs/${parsed.data.clubId}/events?eventSuccess=${encodeURIComponent(successMsg)}#event-${parsed.data.eventId}`);
}

export async function deleteEventAction(formData: FormData) {
  const parsed = eventDeleteSchema.safeParse({
    clubId: formData.get("club_id"),
    eventId: formData.get("event_id"),
  });

  if (!parsed.success) {
    const fallbackClubId = typeof formData.get("club_id") === "string" ? formData.get("club_id") : "";
    if (fallbackClubId) {
      redirect(`/clubs/${fallbackClubId}/events?eventError=${encodeURIComponent(getSafeValidationErrorMessage(parsed))}`);
    }
    redirect("/clubs?error=Invalid+event+request.");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const rateLimit = await enforceRateLimit({
    policy: "eventCreate",
    userId: user.id,
    hint: parsed.data.clubId,
  });
  if (!rateLimit.success) {
    redirect(`/clubs/${parsed.data.clubId}/events?eventError=${encodeURIComponent(getRateLimitErrorMessage())}#event-${parsed.data.eventId}`);
  }

  const active = await assertClubActiveForMutations(parsed.data.clubId);
  if (!active.ok) {
    redirect(`/clubs/${parsed.data.clubId}/events?eventError=${encodeURIComponent(active.message)}#event-${parsed.data.eventId}`);
  }

  const canDelete = await hasPermission(user.id, parsed.data.clubId, "events.delete");
  if (!canDelete) {
    redirect(`/clubs/${parsed.data.clubId}/events?eventError=You+do+not+have+permission+to+delete+events.#event-${parsed.data.eventId}`);
  }

  const { data: existingEvent, error: existingEventError } = await supabase
    .from("events")
    .select("id, club_id")
    .eq("id", parsed.data.eventId)
    .maybeSingle();

  if (existingEventError || !existingEvent || existingEvent.club_id !== parsed.data.clubId) {
    redirect(`/clubs/${parsed.data.clubId}/events?eventError=Event+not+found+for+this+club.`);
  }

  const { error: deleteError } = await supabase
    .from("events")
    .delete()
    .eq("id", parsed.data.eventId)
    .eq("club_id", parsed.data.clubId);

  if (deleteError) {
    redirect(`/clubs/${parsed.data.clubId}/events?eventError=Unable+to+delete+event.+Please+retry.#event-${parsed.data.eventId}`);
  }

  revalidatePath(`/clubs/${parsed.data.clubId}`);
  revalidatePath(`/clubs/${parsed.data.clubId}/events`);
  revalidatePath(`/clubs/${parsed.data.clubId}/events/history`);
  redirect(`/clubs/${parsed.data.clubId}/events?eventSuccess=Event+deleted.#events`);
}

export async function deleteEventSeriesAction(formData: FormData) {
  const parsed = eventDeleteSchema.safeParse({
    clubId: formData.get("club_id"),
    eventId: formData.get("event_id"),
  });

  if (!parsed.success) {
    const fallbackClubId = typeof formData.get("club_id") === "string" ? formData.get("club_id") : "";
    if (fallbackClubId) {
      redirect(`/clubs/${fallbackClubId}/events?eventError=${encodeURIComponent(getSafeValidationErrorMessage(parsed))}`);
    }
    redirect("/clubs?error=Invalid+event+request.");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const active = await assertClubActiveForMutations(parsed.data.clubId);
  if (!active.ok) {
    redirect(`/clubs/${parsed.data.clubId}/events?eventError=${encodeURIComponent(active.message)}#event-${parsed.data.eventId}`);
  }

  const canDelete = await hasPermission(user.id, parsed.data.clubId, "events.delete");
  if (!canDelete) {
    redirect(`/clubs/${parsed.data.clubId}/events?eventError=You+do+not+have+permission+to+delete+events.#event-${parsed.data.eventId}`);
  }

  const { data: existingEvent, error: existingEventError } = await supabase
    .from("events")
    .select("id, club_id, series_id")
    .eq("id", parsed.data.eventId)
    .maybeSingle();

  if (existingEventError || !existingEvent || existingEvent.club_id !== parsed.data.clubId) {
    redirect(`/clubs/${parsed.data.clubId}/events?eventError=Event+not+found+for+this+club.`);
  }
  if (!existingEvent.series_id) {
    redirect(`/clubs/${parsed.data.clubId}/events?eventError=This+event+is+not+part+of+a+recurring+series.#event-${parsed.data.eventId}`);
  }

  const { error: deleteSeriesError } = await supabase
    .from("event_series")
    .delete()
    .eq("id", existingEvent.series_id)
    .eq("club_id", parsed.data.clubId);

  if (deleteSeriesError) {
    redirect(`/clubs/${parsed.data.clubId}/events?eventError=Unable+to+delete+event+series.+Please+retry.#event-${parsed.data.eventId}`);
  }

  revalidatePath(`/clubs/${parsed.data.clubId}`);
  revalidatePath(`/clubs/${parsed.data.clubId}/events`);
  revalidatePath(`/clubs/${parsed.data.clubId}/events/history`);
  redirect(`/clubs/${parsed.data.clubId}/events?eventSuccess=Recurring+series+deleted.#events`);
}

export async function upsertRsvpAction(formData: FormData) {
  const parsed = rsvpSchema.safeParse({
    clubId: formData.get("club_id"),
    eventId: formData.get("event_id"),
    status: formData.get("status"),
  });

  if (!parsed.success) {
    const fallbackClubId = typeof formData.get("club_id") === "string" ? formData.get("club_id") : "";
    if (fallbackClubId) {
      redirect(`/clubs/${fallbackClubId}/events?rsvpError=${encodeURIComponent(getSafeValidationErrorMessage(parsed))}`);
    }
    redirect("/clubs?error=Invalid+event+request.");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const rateLimit = await enforceRateLimit({
    policy: "rsvpWrite",
    userId: user.id,
    hint: parsed.data.clubId,
  });
  if (!rateLimit.success) {
    redirect(`/clubs/${parsed.data.clubId}/events?rsvpError=${encodeURIComponent(getRateLimitErrorMessage())}`);
  }

  const { data: membership, error: membershipError } = await supabase
    .from("club_members")
    .select("id")
    .eq("club_id", parsed.data.clubId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (membershipError || !membership) {
    redirect(`/clubs/${parsed.data.clubId}/events?rsvpError=You+do+not+have+access+to+this+club+event.`);
  }

  const active = await assertClubActiveForMutations(parsed.data.clubId);
  if (!active.ok) {
    redirect(`/clubs/${parsed.data.clubId}/events?rsvpError=${encodeURIComponent(active.message)}`);
  }

  const { data: eventRow, error: eventError } = await supabase
    .from("events")
    .select("id, club_id, title")
    .eq("id", parsed.data.eventId)
    .maybeSingle();

  if (eventError || !eventRow || eventRow.club_id !== parsed.data.clubId) {
    redirect(`/clubs/${parsed.data.clubId}/events?rsvpError=Event+not+found+for+this+club.`);
  }

  const { data: appliedStatus, error: upsertError } = await supabase.rpc("set_event_rsvp_with_capacity", {
    target_event_id: parsed.data.eventId,
    target_status: parsed.data.status,
  });

  if (upsertError) {
    if (upsertError.message?.includes("not_allowed")) {
      redirect(`/clubs/${parsed.data.clubId}/events?rsvpError=You+do+not+have+access+to+this+event.`);
    }
    redirect(`/clubs/${parsed.data.clubId}/events?rsvpError=Unable+to+save+RSVP.+Please+retry.`);
  }

  const finalStatus =
    typeof appliedStatus === "string" && ["yes", "no", "maybe", "waitlist"].includes(appliedStatus)
      ? appliedStatus
      : parsed.data.status;

  await createActivityEvent({
    type: "rsvp.submitted",
    actorId: user.id,
    clubId: parsed.data.clubId,
    entityId: parsed.data.eventId,
    targetLabel: eventRow.title,
    href: `/clubs/${parsed.data.clubId}/events#event-${parsed.data.eventId}`,
    metadata: { status: finalStatus },
  });

  revalidatePath(`/clubs/${parsed.data.clubId}`);
  const successMessage = finalStatus === "waitlist" ? "Event is full — you are on the waitlist." : "RSVP saved.";
  redirect(
    `/clubs/${parsed.data.clubId}/events?rsvpSuccess=${encodeURIComponent(successMessage)}&rsvpEventId=${encodeURIComponent(parsed.data.eventId)}&rsvpStatus=${encodeURIComponent(finalStatus)}`,
  );
}

export async function saveEventReflectionAction(formData: FormData) {
  const parsed = eventReflectionSchema.safeParse({
    clubId: formData.get("club_id"),
    eventId: formData.get("event_id"),
    whatWorked: formData.get("what_worked"),
    whatDidnt: formData.get("what_didnt"),
    notes: formData.get("notes"),
  });

  if (!parsed.success) {
    const fallbackClubIdRaw = formData.get("club_id");
    const fallbackEventIdRaw = formData.get("event_id");
    const fallbackClubId = typeof fallbackClubIdRaw === "string" ? fallbackClubIdRaw : "";
    const fallbackEventId = typeof fallbackEventIdRaw === "string" ? fallbackEventIdRaw : "";
    if (fallbackClubId) {
      const eventQuery = fallbackEventId ? `&reflectionEventId=${encodeURIComponent(fallbackEventId)}` : "";
      redirect(`/clubs/${fallbackClubId}/events?reflectionError=${encodeURIComponent(getSafeValidationErrorMessage(parsed))}${eventQuery}#events`);
    }
    redirect("/clubs?error=Invalid+reflection+request.");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const rateLimit = await enforceRateLimit({
    policy: "announcementCreate",
    userId: user.id,
    hint: parsed.data.clubId,
  });
  if (!rateLimit.success) {
    redirect(`/clubs/${parsed.data.clubId}/events?reflectionError=${encodeURIComponent(getRateLimitErrorMessage())}&reflectionEventId=${encodeURIComponent(parsed.data.eventId)}#events`);
  }

  const { data: membership, error: membershipError } = await supabase
    .from("club_members")
    .select("user_id")
    .eq("club_id", parsed.data.clubId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (membershipError || !membership) {
    redirect(`/clubs/${parsed.data.clubId}/events?reflectionError=You+do+not+have+access+to+this+club.&reflectionEventId=${encodeURIComponent(parsed.data.eventId)}#events`);
  }

  const active = await assertClubActiveForMutations(parsed.data.clubId);
  if (!active.ok) {
    redirect(
      `/clubs/${parsed.data.clubId}/events?reflectionError=${encodeURIComponent(active.message)}&reflectionEventId=${encodeURIComponent(parsed.data.eventId)}#events`,
    );
  }

  const canReflect = await hasPermission(user.id, parsed.data.clubId, "reflections.create");
  if (!canReflect) {
    redirect(`/clubs/${parsed.data.clubId}/events?reflectionError=You+do+not+have+permission+to+save+reflections.&reflectionEventId=${encodeURIComponent(parsed.data.eventId)}#events`);
  }

  const { data: eventRow, error: eventError } = await supabase
    .from("events")
    .select("id, club_id, event_date")
    .eq("id", parsed.data.eventId)
    .maybeSingle();

  if (eventError || !eventRow || eventRow.club_id !== parsed.data.clubId) {
    redirect(`/clubs/${parsed.data.clubId}/events?reflectionError=Event+not+found+for+this+club.&reflectionEventId=${encodeURIComponent(parsed.data.eventId)}#events`);
  }

  if (new Date(eventRow.event_date).getTime() > Date.now()) {
    redirect(`/clubs/${parsed.data.clubId}/events?reflectionError=Reflections+can+only+be+saved+for+past+events.&reflectionEventId=${encodeURIComponent(parsed.data.eventId)}#events`);
  }

  const normalizedNotes = parsed.data.notes.trim() ? parsed.data.notes : null;

  const { data: existingReflection, error: existingReflectionError } = await supabase
    .from("event_reflections")
    .select("id")
    .eq("event_id", parsed.data.eventId)
    .maybeSingle();

  if (existingReflectionError) {
    redirect(`/clubs/${parsed.data.clubId}/events?reflectionError=${encodeURIComponent(getReflectionErrorMessage(existingReflectionError.code, existingReflectionError.message))}&reflectionEventId=${encodeURIComponent(parsed.data.eventId)}#events`);
  }

  if (existingReflection) {
    const { error: updateError } = await supabase
      .from("event_reflections")
      .update({
        what_worked: parsed.data.whatWorked,
        what_didnt: parsed.data.whatDidnt,
        notes: normalizedNotes,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existingReflection.id);

    if (updateError) {
      redirect(`/clubs/${parsed.data.clubId}/events?reflectionError=${encodeURIComponent(getReflectionErrorMessage(updateError.code, updateError.message))}&reflectionEventId=${encodeURIComponent(parsed.data.eventId)}#events`);
    }
  } else {
    const { error: insertError } = await supabase.from("event_reflections").insert({
      event_id: parsed.data.eventId,
      what_worked: parsed.data.whatWorked,
      what_didnt: parsed.data.whatDidnt,
      notes: normalizedNotes,
      created_by: user.id,
      updated_by: user.id,
    });

    if (insertError) {
      redirect(`/clubs/${parsed.data.clubId}/events?reflectionError=${encodeURIComponent(getReflectionErrorMessage(insertError.code, insertError.message))}&reflectionEventId=${encodeURIComponent(parsed.data.eventId)}#events`);
    }
  }

  revalidatePath(`/clubs/${parsed.data.clubId}`);
  redirect(`/clubs/${parsed.data.clubId}/events?reflectionSuccess=Reflection+saved.&reflectionEventId=${encodeURIComponent(parsed.data.eventId)}#events`);
}

export async function toggleAttendanceAction(formData: FormData) {
  const parsed = attendanceToggleSchema.safeParse({
    clubId: formData.get("club_id"),
    eventId: formData.get("event_id"),
    userId: formData.get("user_id"),
    present: formData.get("present"),
  });

  if (!parsed.success) {
    const fallbackClubId = typeof formData.get("club_id") === "string" ? formData.get("club_id") : "";
    if (fallbackClubId) {
      redirect(`/clubs/${fallbackClubId}/events?attendanceError=${encodeURIComponent(getSafeValidationErrorMessage(parsed))}`);
    }
    redirect("/clubs?error=Invalid+attendance+request.");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  logAttendance("start", {
    submittedClubId: parsed.data.clubId,
    submittedEventId: parsed.data.eventId,
    submittedUserId: parsed.data.userId,
    present: parsed.data.present,
    currentUserId: user.id,
  });

  const { error: currentProfileError } = await upsertCurrentUserProfile(supabase, user);
  if (currentProfileError) {
    logAttendance("current-profile-error", {
      currentUserId: user.id,
      code: currentProfileError.code,
      message: currentProfileError.message,
      details: currentProfileError.details,
    });
    redirect(`/clubs/${parsed.data.clubId}/events?attendanceError=Could+not+prepare+your+profile.+Please+retry.`);
  }

  const rateLimit = await enforceRateLimit({
    policy: "rsvpWrite",
    userId: user.id,
    hint: parsed.data.clubId,
  });
  if (!rateLimit.success) {
    redirect(`/clubs/${parsed.data.clubId}/events?attendanceError=${encodeURIComponent(getRateLimitErrorMessage())}`);
  }

  const { data: membership, error: membershipError } = await supabase
    .from("club_members")
    .select("user_id")
    .eq("club_id", parsed.data.clubId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (membershipError || !membership) {
    logAttendance("membership-check-failed", {
      currentUserId: user.id,
      clubId: parsed.data.clubId,
      code: membershipError?.code,
      message: membershipError?.message,
      details: membershipError?.details,
      foundMembership: Boolean(membership),
    });
    redirect(`/clubs/${parsed.data.clubId}/events?attendanceError=You+do+not+have+access+to+this+club.`);
  }

  const active = await assertClubActiveForMutations(parsed.data.clubId);
  if (!active.ok) {
    redirect(`/clubs/${parsed.data.clubId}/events?attendanceError=${encodeURIComponent(active.message)}`);
  }

  const canMarkAttendance = await hasPermission(user.id, parsed.data.clubId, "attendance.mark");
  if (!canMarkAttendance) {
    logAttendance("permission-denied", {
      currentUserId: user.id,
      clubId: parsed.data.clubId,
    });
    redirect(`/clubs/${parsed.data.clubId}/events?attendanceError=You+do+not+have+permission+to+track+attendance.`);
  }

  logAttendance("membership-check-passed", {
    currentUserId: user.id,
    clubId: parsed.data.clubId,
  });

  const { data: eventRow, error: eventError } = await supabase
    .from("events")
    .select("id, club_id, title")
    .eq("id", parsed.data.eventId)
    .maybeSingle();

  if (eventError || !eventRow || eventRow.club_id !== parsed.data.clubId) {
    logAttendance("event-check-failed", {
      currentUserId: user.id,
      clubId: parsed.data.clubId,
      eventId: parsed.data.eventId,
      code: eventError?.code,
      message: eventError?.message,
      details: eventError?.details,
      foundEvent: Boolean(eventRow),
      eventClubId: eventRow?.club_id,
    });
    redirect(`/clubs/${parsed.data.clubId}/events?attendanceError=Event+not+found+for+this+club.`);
  }

  logAttendance("event-check-passed", {
    currentUserId: user.id,
    clubId: parsed.data.clubId,
    eventId: parsed.data.eventId,
  });

  const { data: targetMember, error: targetMemberError } = await supabase
    .from("club_members")
    .select("id")
    .eq("club_id", parsed.data.clubId)
    .eq("user_id", parsed.data.userId)
    .maybeSingle();

  if (targetMemberError || !targetMember) {
    logAttendance("target-member-check-failed", {
      currentUserId: user.id,
      clubId: parsed.data.clubId,
      targetUserId: parsed.data.userId,
      code: targetMemberError?.code,
      message: targetMemberError?.message,
      details: targetMemberError?.details,
      foundTargetMember: Boolean(targetMember),
    });
    redirect(`/clubs/${parsed.data.clubId}/events?attendanceError=Member+not+found+in+this+club.`);
  }

  logAttendance("target-member-check-passed", {
    currentUserId: user.id,
    clubId: parsed.data.clubId,
    targetUserId: parsed.data.userId,
  });

  if (parsed.data.present) {
    const admin = createAdminClient();

    const { data: targetProfile } = await admin
      .from("profiles")
      .select("id")
      .eq("id", parsed.data.userId)
      .maybeSingle();

    if (!targetProfile) {
      const { data: authUser, error: authUserError } = await admin.auth.admin.getUserById(parsed.data.userId);

      logAttendance("target-profile-missing", {
        currentUserId: user.id,
        clubId: parsed.data.clubId,
        eventId: parsed.data.eventId,
        targetUserId: parsed.data.userId,
        authLookupError: authUserError?.message ?? null,
        authUserFound: Boolean(authUser?.user),
      });

      if (authUser?.user) {
        const { error: targetProfileError } = await admin.from("profiles").upsert(
          {
            id: authUser.user.id,
            email: authUser.user.email ?? "",
            full_name:
              typeof authUser.user.user_metadata?.full_name === "string"
                ? sanitizeInlineText(authUser.user.user_metadata.full_name).slice(0, 80)
                : "",
          },
          { onConflict: "id" },
        );

        if (targetProfileError) {
          logAttendance("target-profile-upsert-error", {
            currentUserId: user.id,
            targetUserId: parsed.data.userId,
            code: targetProfileError.code,
            message: targetProfileError.message,
            details: targetProfileError.details,
          });
          redirect(`/clubs/${parsed.data.clubId}/events?attendanceError=This+member+profile+is+missing.+Have+them+sign+in+again,+then+retry.`);
        }
      } else {
        redirect(`/clubs/${parsed.data.clubId}/events?attendanceError=This+member+profile+is+missing.+Have+them+sign+in+again,+then+retry.`);
      }
    }

    const { data: existingAttendance, error: existingAttendanceError } = await supabase
      .from("event_attendance")
      .select("id")
      .eq("event_id", parsed.data.eventId)
      .eq("user_id", parsed.data.userId)
      .maybeSingle();

    if (existingAttendanceError) {
      logAttendance("existing-attendance-check-error", {
        currentUserId: user.id,
        eventId: parsed.data.eventId,
        targetUserId: parsed.data.userId,
        code: existingAttendanceError.code,
        message: existingAttendanceError.message,
        details: existingAttendanceError.details,
      });
      redirect(`/clubs/${parsed.data.clubId}/events?attendanceError=${encodeURIComponent(getAttendanceErrorMessage(existingAttendanceError.code, existingAttendanceError.message))}`);
    }

    if (existingAttendance) {
      logAttendance("already-present", {
        currentUserId: user.id,
        eventId: parsed.data.eventId,
        targetUserId: parsed.data.userId,
      });
    } else {
      const { error: attendanceError } = await supabase.from("event_attendance").insert({
        event_id: parsed.data.eventId,
        user_id: parsed.data.userId,
        marked_by: user.id,
      });

      if (attendanceError) {
        logAttendance("insert-error", {
          currentUserId: user.id,
          clubId: parsed.data.clubId,
          eventId: parsed.data.eventId,
          targetUserId: parsed.data.userId,
          code: attendanceError.code,
          message: attendanceError.message,
          details: attendanceError.details,
        });
        redirect(`/clubs/${parsed.data.clubId}/events?attendanceError=${encodeURIComponent(getAttendanceErrorMessage(attendanceError.code, attendanceError.message))}`);
      }

      logAttendance("insert-success", {
        currentUserId: user.id,
        clubId: parsed.data.clubId,
        eventId: parsed.data.eventId,
        targetUserId: parsed.data.userId,
      });

      await createActivityEvent({
        type: "attendance.marked",
        actorId: user.id,
        clubId: parsed.data.clubId,
        entityId: parsed.data.eventId,
        targetLabel: eventRow.title,
        href: `/clubs/${parsed.data.clubId}/events#event-${parsed.data.eventId}`,
        metadata: { marked_user_id: parsed.data.userId },
      });
    }
  } else {
    const { error: attendanceError } = await supabase
      .from("event_attendance")
      .delete()
      .eq("event_id", parsed.data.eventId)
      .eq("user_id", parsed.data.userId);

    if (attendanceError) {
      logAttendance("delete-error", {
        currentUserId: user.id,
        clubId: parsed.data.clubId,
        eventId: parsed.data.eventId,
        targetUserId: parsed.data.userId,
        code: attendanceError.code,
        message: attendanceError.message,
        details: attendanceError.details,
      });
      redirect(`/clubs/${parsed.data.clubId}/events?attendanceError=${encodeURIComponent(getAttendanceErrorMessage(attendanceError.code, attendanceError.message))}`);
    }

    logAttendance("delete-success", {
      currentUserId: user.id,
      clubId: parsed.data.clubId,
      eventId: parsed.data.eventId,
      targetUserId: parsed.data.userId,
    });
  }

  revalidatePath(`/clubs/${parsed.data.clubId}`);
  redirect(
    `/clubs/${parsed.data.clubId}/events?attendanceSuccess=Attendance+updated.&attendanceEventId=${encodeURIComponent(parsed.data.eventId)}&attendanceUserId=${encodeURIComponent(parsed.data.userId)}&attendancePresent=${parsed.data.present ? "true" : "false"}`,
  );
}
