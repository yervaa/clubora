/**
 * Pilot showcase seed: wipes the database (clubs + notifications + audit logs + all auth users),
 * then creates two primary logins + roster members and three fully populated clubs.
 *
 * Each primary (pilot + pilot2): President in one club, Officer in another, Member in the third.
 *   • pilot:  MSA President, DECA Member, Photography Officer (Marcus is President there).
 *   • pilot2: MSA Member, DECA President, Photography Officer.
 *
 * Requires in .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Safety (same idea as demo-seed):
 *   ALLOW_PILOT_SHOWCASE=true
 *   PILOT_SHOWCASE_TARGET_OK=true   when URL host is not localhost (hosted Supabase)
 *
 * Database: apply supabase/023_pilot_showcase_reset.sql first (adds pilot_showcase_reset RPC).
 */

import path from "path";
import { config } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { seedSystemRolesForClub } from "../demo-seed/rbac";
import {
  DEFAULT_PILOT2_EMAIL,
  DEFAULT_PILOT2_PASSWORD,
  DEFAULT_PILOT_EMAIL,
  DEFAULT_PILOT_PASSWORD,
  DEFAULT_ROSTER_PASSWORD,
  PILOT_SHOWCASE_ENV_FLAG,
  PILOT_SHOWCASE_REMOTE_OK_FLAG,
  ROSTER_PASSWORD_ENV_FLAG,
} from "./constants";
import { buildRoster, type RosterSlug } from "./roster";
import {
  DECA_ANNOUNCEMENTS,
  DECA_EVENTS,
  DECA_TASKS,
  MSA_ANNOUNCEMENTS,
  MSA_EVENTS,
  MSA_TASKS,
  PHOTO_ANNOUNCEMENTS,
  PHOTO_EVENTS,
  PHOTO_TASKS,
  seedClubContent,
} from "./seed-content";

config({ path: path.resolve(process.cwd(), ".env.local") });
config({ path: path.resolve(process.cwd(), ".env") });

/** Decode Supabase JWT payload (no verification) — for diagnostics only; never log the raw key. */
function readServiceKeyDiagnostics(token: string): {
  role: string | null;
  issHost: string | null;
} {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return { role: null, issHost: null };
    const json = Buffer.from(parts[1], "base64url").toString("utf8");
    const o = JSON.parse(json) as { role?: string; iss?: string };
    let issHost: string | null = null;
    if (typeof o.iss === "string") {
      try {
        issHost = new URL(o.iss).hostname.toLowerCase();
      } catch {
        issHost = null;
      }
    }
    return { role: typeof o.role === "string" ? o.role : null, issHost };
  } catch {
    return { role: null, issHost: null };
  }
}

function assertSafeToRun(): void {
  const explicit = process.env[PILOT_SHOWCASE_ENV_FLAG] === "true";
  const vercelProd = process.env.VERCEL_ENV === "production";
  const nodeProd = process.env.NODE_ENV === "production";

  if (!explicit && (vercelProd || nodeProd)) {
    throw new Error(
      `Refused: set ${PILOT_SHOWCASE_ENV_FLAG}=true only when you intentionally run this destructive seed.`,
    );
  }
}

function assertRemoteTargetOptIn(): void {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!raw) return;

  let host: string;
  try {
    host = new URL(raw).hostname.toLowerCase();
  } catch {
    return;
  }

  const isLoopback = host === "localhost" || host === "127.0.0.1" || host === "[::1]";
  if (isLoopback) return;

  const ok = process.env[PILOT_SHOWCASE_REMOTE_OK_FLAG] === "true";
  if (!ok) {
    throw new Error(
      `Refused: your Supabase URL is hosted (${host}), not localhost. ` +
        `This seed deletes ALL users and clubs on that project.\n\n` +
        `Run this exact command:\n` +
        `  ALLOW_PILOT_SHOWCASE=true ${PILOT_SHOWCASE_REMOTE_OK_FLAG}=true npm run seed:pilot-showcase\n\n` +
        `Or add ${PILOT_SHOWCASE_REMOTE_OK_FLAG}=true to .env.local (same folder as package.json).`,
    );
  }
}

async function deleteAllAuthUsers(admin: SupabaseClient): Promise<void> {
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (error) throw error;
    if (!data.users.length) break;
    for (const u of data.users) {
      const { error: delErr } = await admin.auth.admin.deleteUser(u.id);
      if (delErr) throw delErr;
    }
  }
}

async function createRosterUsers(
  admin: SupabaseClient,
  roster: ReturnType<typeof buildRoster>,
): Promise<Map<RosterSlug, string>> {
  const map = new Map<RosterSlug, string>();

  for (const person of roster) {
    const { data, error } = await admin.auth.admin.createUser({
      email: person.email,
      password: person.password,
      email_confirm: true,
      user_metadata: { full_name: person.fullName },
    });
    if (error) throw error;
    if (!data.user) throw new Error(`No user for ${person.email}`);
    map.set(person.slug, data.user.id);
    const { error: pe } = await admin.from("profiles").upsert(
      { id: data.user.id, full_name: person.fullName, email: person.email },
      { onConflict: "id" },
    );
    if (pe) throw pe;
  }

  return map;
}

async function insertClub(
  admin: SupabaseClient,
  args: { name: string; description: string; joinCode: string; createdBy: string; presidentId: string },
): Promise<string> {
  const { data, error } = await admin
    .from("clubs")
    .insert({
      name: args.name,
      description: args.description,
      join_code: args.joinCode.toUpperCase().trim(),
      created_by: args.createdBy,
    })
    .select("id")
    .single();
  if (error) throw error;
  const clubId = data.id as string;
  await seedSystemRolesForClub(admin, clubId, args.presidentId);
  return clubId;
}

async function addMember(
  admin: SupabaseClient,
  clubId: string,
  userId: string,
  legacyRole: "member" | "officer",
): Promise<void> {
  const { error } = await admin.from("club_members").insert({
    club_id: clubId,
    user_id: userId,
    role: legacyRole,
  });
  if (error && error.code !== "23505") throw error;
}

function u(m: Map<RosterSlug, string>, slug: RosterSlug): string {
  const id = m.get(slug);
  if (!id) throw new Error(`Missing ${slug}`);
  return id;
}

async function main(): Promise<void> {
  assertSafeToRun();
  assertRemoteTargetOptIn();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  const pilotEmail = (process.env.PILOT_SHOWCASE_EMAIL ?? DEFAULT_PILOT_EMAIL).trim();
  const pilotPassword = (process.env.PILOT_SHOWCASE_PASSWORD ?? DEFAULT_PILOT_PASSWORD).trim();
  const pilot2Email = (process.env.PILOT_SHOWCASE_EMAIL_2 ?? DEFAULT_PILOT2_EMAIL).trim();
  const pilot2Password = (process.env.PILOT_SHOWCASE_PASSWORD_2 ?? DEFAULT_PILOT2_PASSWORD).trim();
  const rosterPassword = (process.env[ROSTER_PASSWORD_ENV_FLAG] ?? DEFAULT_ROSTER_PASSWORD).trim();
  const roster = buildRoster(pilotEmail, pilotPassword, pilot2Email, pilot2Password, rosterPassword);

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let urlHost = "";
  try {
    urlHost = new URL(url).hostname.toLowerCase();
  } catch {
    urlHost = "";
  }
  const keyDiag = readServiceKeyDiagnostics(serviceKey);

  console.log("Calling pilot_showcase_reset() (deletes all clubs + related rows)…");
  const { error: rpcErr } = await admin.rpc("pilot_showcase_reset");
  if (rpcErr) {
    if (rpcErr.code === "PGRST202" || String(rpcErr.message ?? "").includes("pilot_showcase_reset")) {
      throw new Error(
        "RPC pilot_showcase_reset missing. Apply supabase/023_pilot_showcase_reset.sql to this Supabase project, then retry.",
      );
    }

    const msg = String(rpcErr.message ?? "");
    if (msg.includes("DELETE requires a WHERE clause")) {
      throw new Error(
        "Database still has the old pilot_showcase_reset() definition. " +
          "Re-run the SQL in supabase/023_pilot_showcase_reset.sql (SQL Editor) so deletes use WHERE true, then retry.",
      );
    }
    if (msg.includes("System roles") && msg.includes("cannot be deleted")) {
      throw new Error(
        "Database still has an old pilot_showcase_reset() without the cascade-delete bypass. " +
          "Re-run the full supabase/023_pilot_showcase_reset.sql in the SQL Editor (includes set_config before deleting clubs), then retry.",
      );
    }
    if (msg.includes("Unregistered") || msg.toLowerCase().includes("api key")) {
      const roleHint =
        keyDiag.role === "anon"
          ? "Your SUPABASE_SERVICE_ROLE_KEY decodes as role **anon** — paste the **service_role** key (secret), not the anon key."
          : keyDiag.role === "service_role"
            ? "Key role is service_role but project rejected it — copy the service_role key again from **this same** project (Settings → API), or remove stray quotes/spaces in .env.local."
            : "Could not read role from key — check for a truncated key or typos in .env.local.";

      throw new Error(
        `Supabase rejected the API key for ${urlHost || url}.\n${roleHint}\n\n` +
          `JWT iss host: ${keyDiag.issHost ?? "unknown"} (should align with ${urlHost || "your project URL"}).\n` +
          `Supabase said: ${msg}`,
      );
    }

    throw rpcErr;
  }

  console.log("Deleting all auth users…");
  await deleteAllAuthUsers(admin);

  console.log("Cleaning up orphaned profiles…");
  const { error: cleanupErr } = await admin.rpc("cleanup_orphaned_profiles");
  if (cleanupErr) {
    if (cleanupErr.code === "PGRST202" || String(cleanupErr.message ?? "").includes("cleanup_orphaned_profiles")) {
      throw new Error(
        "RPC cleanup_orphaned_profiles missing. Apply supabase/059_cleanup_orphaned_profiles.sql to this Supabase project, then retry.",
      );
    }
    throw cleanupErr;
  }

  console.log("Creating roster (9 users: 2 primary + 7 extras)…");
  const ids = await createRosterUsers(admin, roster);

  const pilot = u(ids, "pilot");
  const pilot2 = u(ids, "pilot2");
  const elena = u(ids, "elena");
  const marcus = u(ids, "marcus");
  const james = u(ids, "james");
  const priya = u(ids, "priya");
  const sophie = u(ids, "sophie");
  const tessa = u(ids, "tessa");
  const diego = u(ids, "diego");

  // ─── Club 1: pilot = President; pilot2 = Member — Muslim Student Association
  console.log("Seeding Muslim Student Association…");
  const c1 = await insertClub(admin, {
    name: "Muslim Student Association",
    description:
      "Community, faith, and service on campus: weekly halaqa, Ramadan programming, interfaith panels, and volunteer outings. Allies welcome.",
    joinCode: "MSACLB",
    createdBy: pilot,
    presidentId: pilot,
  });
  await addMember(admin, c1, pilot2, "member");
  await addMember(admin, c1, elena, "member");
  await addMember(admin, c1, james, "member");
  await addMember(admin, c1, priya, "member");
  await addMember(admin, c1, marcus, "officer");

  const c1Members = [pilot, pilot2, elena, marcus, james, priya];
  const c1Officers = [pilot, marcus];
  await seedClubContent({
    admin,
    clubId: c1,
    presidentId: pilot,
    memberUserIds: c1Members,
    officerUserIds: c1Officers,
    userMap: ids,
    announcements: MSA_ANNOUNCEMENTS,
    events: MSA_EVENTS,
    tasks: MSA_TASKS,
    auditSamples: [
      { action: "role.assigned", target: "marcus", daysAgo: 24 },
      { action: "members.invited", daysAgo: 10, metadata: { channel: "club_fair_signups" } },
    ],
  });

  // ─── Club 2: pilot2 = President; pilot = Member — DECA
  console.log("Seeding DECA…");
  const c2 = await insertClub(admin, {
    name: "DECA",
    description:
      "Marketing, finance, hospitality, and entrepreneurship competitions — practice role-plays, written events, and travel to district and state.",
    joinCode: "DECACL",
    createdBy: pilot2,
    presidentId: pilot2,
  });
  await addMember(admin, c2, pilot, "member");
  await addMember(admin, c2, marcus, "officer");
  await addMember(admin, c2, priya, "member");

  const c2Members = [pilot2, pilot, marcus, priya];
  const c2Officers = [pilot2, marcus];
  await seedClubContent({
    admin,
    clubId: c2,
    presidentId: pilot2,
    memberUserIds: c2Members,
    officerUserIds: c2Officers,
    userMap: ids,
    announcements: DECA_ANNOUNCEMENTS,
    events: DECA_EVENTS,
    tasks: DECA_TASKS,
    auditSamples: [
      { action: "role.assigned", target: "marcus", daysAgo: 18 },
      { action: "announcement.posted", daysAgo: 4, metadata: { title: "District competition registration" } },
    ],
  });

  // ─── Club 3: Marcus = President; pilot + pilot2 = Officers — Photography Club
  console.log("Seeding Photography Club…");
  const c3 = await insertClub(admin, {
    name: "Photography Club",
    description:
      "Shoot together, learn lighting and editing, borrow school gear, and prep prints for the spring gallery and yearbook support.",
    joinCode: "PHOCLB",
    createdBy: marcus,
    presidentId: marcus,
  });
  await addMember(admin, c3, pilot, "officer");
  await addMember(admin, c3, pilot2, "officer");
  await addMember(admin, c3, sophie, "member");
  await addMember(admin, c3, tessa, "member");
  await addMember(admin, c3, diego, "member");

  const c3Members = [marcus, pilot, pilot2, sophie, tessa, diego];
  const c3Officers = [marcus, pilot, pilot2];
  await seedClubContent({
    admin,
    clubId: c3,
    presidentId: marcus,
    memberUserIds: c3Members,
    officerUserIds: c3Officers,
    userMap: ids,
    announcements: PHOTO_ANNOUNCEMENTS,
    events: PHOTO_EVENTS,
    tasks: PHOTO_TASKS,
    auditSamples: [
      { action: "role.assigned", target: "pilot", daysAgo: 30 },
      { action: "members.invited", daysAgo: 6, metadata: { note: "New member orientation" } },
    ],
  });

  console.log("\nDone.");
  console.log(`  Primary 1 (Jordan): ${pilotEmail}  /  ${pilotPassword}`);
  console.log(`  Primary 2 (Alex):   ${pilot2Email}  /  ${pilot2Password}`);
  console.log(`  Other roster: showcase.*@clubora.local  /  ${rosterPassword}`);
  console.log("  Join codes: MSACLB  DECACL  PHOCLB");
  console.log(
    "  Role matrix: each primary is President in one club, Member in another, Officer in the third (see header comment in run.ts).",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
