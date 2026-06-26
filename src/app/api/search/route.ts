import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type ClubRow = { id: string; name: string; description: string | null };
type AnnouncementRow = {
  id: string;
  title: string;
  club_id: string;
  clubs: { name: string } | { name: string }[] | null;
};
type EventRow = {
  id: string;
  title: string;
  club_id: string;
  event_date: string;
  clubs: { name: string } | { name: string }[] | null;
};
type ProfileRow = { id: string; full_name: string | null; email: string | null };
type MemberClubRow = { user_id: string; club_id: string };

function normalizeRelationName(
  relation: { name: string } | { name: string }[] | null | undefined,
): string {
  if (!relation) return "Club";
  if (Array.isArray(relation)) return relation[0]?.name ?? "Club";
  return relation.name;
}

const SEARCH_MAX_CHARS = 100;

/**
 * Sanitize user input before it is interpolated into a PostgREST `.or(...)`
 * filter string. Strips structural metacharacters that would let a term break
 * out into extra filter conditions (commas, parentheses) plus ILIKE wildcards
 * (`%` `_`), quotes, and backslashes. Dots and `@` are intentionally KEPT so
 * email search still works — they are safe inside the value portion of a filter.
 */
function sanitizeSearchTerm(raw: string): string {
  return raw
    .replace(/[%_,()'"\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, SEARCH_MAX_CHARS);
}

function toIlikePattern(term: string): string {
  return `%${term}%`;
}

function isMissingMembershipStatusColumn(error: { code?: string; message?: string }): boolean {
  return (
    error.code === "42703" && Boolean(error.message?.toLowerCase().includes("membership_status"))
  );
}

async function getActiveClubIds(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const select = "club_id, clubs!inner(id, status)" as const;

  let { data, error } = await supabase
    .from("club_members")
    .select(select)
    .eq("user_id", userId)
    .eq("membership_status", "active");

  if (error && isMissingMembershipStatusColumn(error)) {
    const retry = await supabase.from("club_members").select(select).eq("user_id", userId);
    data = retry.data;
    error = retry.error;
  }

  if (error || !data) {
    return [] as string[];
  }

  type Row = {
    club_id: string;
    clubs: { id: string; status?: string | null } | { id: string; status?: string | null }[];
  };

  return (data as unknown as Row[])
    .map((row) => {
      const club = Array.isArray(row.clubs) ? row.clubs[0] : row.clubs;
      if (!club || (club.status ?? "active") !== "active") return null;
      return row.club_id;
    })
    .filter((id): id is string => Boolean(id));
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimit = await enforceRateLimit({ policy: "search", userId: user.id });
  if (!rateLimit.success) {
    return NextResponse.json(
      { error: "Too many requests. Please slow down." },
      { status: 429 },
    );
  }

  const url = new URL(request.url);
  const rawQ = url.searchParams.get("q")?.trim() ?? "";

  // Sanitize BEFORE length checks: structural metacharacters are stripped, so a
  // term that is only metacharacters collapses to empty and must not match all.
  const term = sanitizeSearchTerm(rawQ);
  if (term.length < 2) {
    return NextResponse.json({
      clubs: [],
      announcements: [],
      events: [],
      members: [],
    });
  }

  const pattern = toIlikePattern(term);
  const clubIds = await getActiveClubIds(supabase, user.id);

  if (clubIds.length === 0) {
    return NextResponse.json({
      clubs: [],
      announcements: [],
      events: [],
      members: [],
    });
  }

  const nowIso = new Date().toISOString();

  const [clubsRes, announcementsRes, eventsRes, membersRes] = await Promise.all([
    supabase
      .from("clubs")
      .select("id, name, description")
      .in("id", clubIds)
      .ilike("name", pattern)
      .limit(3),
    supabase
      .from("announcements")
      .select("id, title, club_id, clubs(name)")
      .in("club_id", clubIds)
      .ilike("title", pattern)
      .order("created_at", { ascending: false })
      .limit(3),
    supabase
      .from("events")
      .select("id, title, club_id, event_date, clubs(name)")
      .in("club_id", clubIds)
      .ilike("title", pattern)
      .gte("event_date", nowIso)
      .order("event_date", { ascending: true })
      .limit(3),
    supabase
      .from("profiles")
      .select("id, full_name, email")
      .neq("id", user.id)
      .or(`full_name.ilike.${pattern},email.ilike.${pattern}`)
      .limit(3),
  ]);

  const clubs = ((clubsRes.data ?? []) as ClubRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
  }));

  const announcements = ((announcementsRes.data ?? []) as AnnouncementRow[]).map((row) => ({
    id: row.id,
    title: row.title,
    club_id: row.club_id,
    club_name: normalizeRelationName(row.clubs),
  }));

  const events = ((eventsRes.data ?? []) as EventRow[]).map((row) => ({
    id: row.id,
    title: row.title,
    club_id: row.club_id,
    club_name: normalizeRelationName(row.clubs),
    event_date: row.event_date,
  }));

  const profileRows = (membersRes.data ?? []) as ProfileRow[];
  const memberIds = profileRows.map((row) => row.id);

  let sharedClubByUserId = new Map<string, string>();

  if (memberIds.length > 0) {
    let { data: membershipRows, error: membershipError } = await supabase
      .from("club_members")
      .select("user_id, club_id")
      .in("club_id", clubIds)
      .in("user_id", memberIds)
      .eq("membership_status", "active");

    if (membershipError && isMissingMembershipStatusColumn(membershipError)) {
      const retry = await supabase
        .from("club_members")
        .select("user_id, club_id")
        .in("club_id", clubIds)
        .in("user_id", memberIds);
      membershipRows = retry.data;
    }

    for (const row of (membershipRows ?? []) as MemberClubRow[]) {
      if (!sharedClubByUserId.has(row.user_id)) {
        sharedClubByUserId.set(row.user_id, row.club_id);
      }
    }
  }

  const members = profileRows
    .filter((row) => sharedClubByUserId.has(row.id))
    .map((row) => ({
      id: row.id,
      full_name: row.full_name,
      email: row.email,
      shared_club_id: sharedClubByUserId.get(row.id)!,
    }));

  return NextResponse.json({
    clubs,
    announcements,
    events,
    members,
  });
}
