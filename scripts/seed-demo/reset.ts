import type { SupabaseClient } from "@supabase/supabase-js";
import { DEMO_STORAGE_BUCKETS } from "./constants";

type ResetSummary = { usersRemoved: number; objectsRemoved: number };

/**
 * Wipes the whole demo database: every club (and everything that cascades from it),
 * notifications, audit logs, every auth user, orphaned profiles, and club uploads.
 *
 * Uses `pilot_showcase_reset` (supabase/023) for the club cascade and
 * `cleanup_orphaned_profiles` (supabase/059) so fixed demo emails can be recreated.
 */
export async function resetDemoDatabase(admin: SupabaseClient): Promise<ResetSummary> {
  // dues_payments.dues_id is ON DELETE RESTRICT; clear it before the club cascade
  // reaches public.dues so delete order inside the cascade can't trip the FK.
  const { error: payErr } = await admin.from("dues_payments").delete().not("id", "is", null);
  if (payErr) throw payErr;

  const { error: resetErr } = await admin.rpc("pilot_showcase_reset");
  if (resetErr) {
    if (resetErr.code === "PGRST202") {
      throw new Error("RPC pilot_showcase_reset missing. Apply supabase/023_pilot_showcase_reset.sql, then retry.");
    }
    throw resetErr;
  }

  let usersRemoved = 0;
  // Deleting shifts pagination, so always re-read page 1 until it's empty.
  for (let guard = 0; guard < 100; guard++) {
    const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (error) throw error;
    if (!data.users.length) break;
    for (const u of data.users) {
      const { error: delErr } = await admin.auth.admin.deleteUser(u.id);
      if (delErr) throw delErr;
      usersRemoved += 1;
    }
  }

  const { error: cleanupErr } = await admin.rpc("cleanup_orphaned_profiles");
  if (cleanupErr) {
    if (cleanupErr.code === "PGRST202") {
      throw new Error("RPC cleanup_orphaned_profiles missing. Apply supabase/059_cleanup_orphaned_profiles.sql, then retry.");
    }
    throw cleanupErr;
  }

  let objectsRemoved = 0;
  for (const bucket of DEMO_STORAGE_BUCKETS) {
    objectsRemoved += await emptyBucket(admin, bucket);
  }

  return { usersRemoved, objectsRemoved };
}

/** Recursively removes every object in a bucket (storage list() is one folder level at a time). */
async function emptyBucket(admin: SupabaseClient, bucket: string, prefix = ""): Promise<number> {
  let removed = 0;
  for (let guard = 0; guard < 100; guard++) {
    const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: 1000 });
    if (error) {
      if (/not found/i.test(error.message)) return removed;
      throw error;
    }
    if (!data?.length) break;

    const files = data.filter((o) => o.id !== null).map((o) => (prefix ? `${prefix}/${o.name}` : o.name));
    const folders = data.filter((o) => o.id === null).map((o) => (prefix ? `${prefix}/${o.name}` : o.name));

    for (const folder of folders) {
      removed += await emptyBucket(admin, bucket, folder);
    }
    if (files.length) {
      const { error: rmErr } = await admin.storage.from(bucket).remove(files);
      if (rmErr) throw rmErr;
      removed += files.length;
    }
    if (!files.length) break;
  }
  return removed;
}
