import type { SupabaseClient } from "@supabase/supabase-js";
import { DEMO_CLUB_JOIN_CODES, DEMO_EMAIL_DOMAIN } from "./constants";

/**
 * Removes demo clubs (by join code) then demo auth users (`*.demo@clubora.test`).
 * Club delete uses RPC `delete_demo_clubs_by_join_codes` (migration 022) so CASCADE
 * can remove system roles / last president without RBAC delete triggers blocking.
 * Also clears profiles orphaned by the deleted auth users (migration 059) — without
 * this, re-seeding with the same fixed demo emails hits profiles' UNIQUE(email).
 */
export async function resetDemoData(admin: SupabaseClient): Promise<{ clubsRemoved: number; usersRemoved: number }> {
  const { data: deletedClubRows, error: rpcErr } = await admin.rpc("delete_demo_clubs_by_join_codes", {
    p_join_codes: [...DEMO_CLUB_JOIN_CODES],
  });
  if (rpcErr) {
    if (rpcErr.code === "PGRST202" || String(rpcErr.message ?? "").includes("delete_demo_clubs_by_join_codes")) {
      throw new Error(
        "Database function delete_demo_clubs_by_join_codes is missing. Apply supabase/022_demo_seed_club_delete.sql to your Supabase project (Dashboard SQL editor or `supabase db push`), then retry.",
      );
    }
    throw rpcErr;
  }

  const clubsRemoved = typeof deletedClubRows === "number" ? deletedClubRows : 0;

  let usersRemoved = 0;
  const perPage = 200;
  for (let page = 1; page <= 50; page++) {
    const { data: list, error: le } = await admin.auth.admin.listUsers({ page, perPage });
    if (le) throw le;
    if (!list?.users.length) break;

    for (const u of list.users) {
      if (!u.email?.endsWith(DEMO_EMAIL_DOMAIN)) continue;
      const { error: delErr } = await admin.auth.admin.deleteUser(u.id);
      if (delErr) throw delErr;
      usersRemoved += 1;
    }

    if (list.users.length < perPage) break;
  }

  const { error: cleanupErr } = await admin.rpc("cleanup_orphaned_profiles");
  if (cleanupErr) {
    if (cleanupErr.code === "PGRST202" || String(cleanupErr.message ?? "").includes("cleanup_orphaned_profiles")) {
      throw new Error(
        "RPC cleanup_orphaned_profiles missing. Apply supabase/059_cleanup_orphaned_profiles.sql to this Supabase project, then retry.",
      );
    }
    throw cleanupErr;
  }

  return { clubsRemoved, usersRemoved };
}
