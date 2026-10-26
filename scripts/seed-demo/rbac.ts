import type { SupabaseClient } from "@supabase/supabase-js";

/** Mirrors `seed_default_club_roles` from supabase/020_tasks.sql (Officer + Member task perms). */
const OFFICER_PERMISSION_KEYS = new Set([
  "members.view",
  "members.invite",
  "announcements.create",
  "announcements.edit",
  "announcements.delete",
  "events.create",
  "events.edit",
  "events.delete",
  "attendance.mark",
  "attendance.edit",
  "reflections.create",
  "reflections.edit",
  "insights.view",
  "tasks.view",
  "tasks.create",
  "tasks.edit",
  "tasks.assign",
  "tasks.complete",
]);

const MEMBER_PERMISSION_KEYS = new Set([
  "members.view",
  "insights.view",
  "tasks.view",
  "tasks.complete",
]);

/**
 * Creates President / Officer / Member system roles, wires permissions, assigns President + Officer to creator.
 * Call after `clubs` insert (trigger already added creator to `club_members` as legacy officer).
 */
export async function seedSystemRolesForClub(
  admin: SupabaseClient,
  clubId: string,
  presidentUserId: string,
): Promise<{ presidentRoleId: string; officerRoleId: string; memberRoleId: string }> {
  const { data: perms, error: pe } = await admin.from("permissions").select("id, key");
  if (pe) throw pe;
  if (!perms?.length) throw new Error("No permissions in database — run Supabase migrations.");

  async function insertSystemRole(name: string, description: string): Promise<string> {
    const { data, error } = await admin
      .from("club_roles")
      .insert({
        club_id: clubId,
        name,
        description,
        is_system: true,
      })
      .select("id")
      .single();
    if (error) throw error;
    return data.id as string;
  }

  const presidentRoleId = await insertSystemRole("President", "Full control over the club");
  const officerRoleId = await insertSystemRole("Officer", "Manages events, announcements, and members");
  const memberRoleId = await insertSystemRole("Member", "Standard club member");

  const rpRows: { role_id: string; permission_id: string }[] = [];

  for (const p of perms) {
    rpRows.push({ role_id: presidentRoleId, permission_id: p.id });
  }

  for (const p of perms) {
    if (OFFICER_PERMISSION_KEYS.has(p.key)) {
      rpRows.push({ role_id: officerRoleId, permission_id: p.id });
    }
  }

  for (const p of perms) {
    if (MEMBER_PERMISSION_KEYS.has(p.key)) {
      rpRows.push({ role_id: memberRoleId, permission_id: p.id });
    }
  }

  const { error: rpe } = await admin.from("role_permissions").insert(rpRows);
  if (rpe) throw rpe;

  const { error: mre } = await admin.from("member_roles").insert([
    { user_id: presidentUserId, club_id: clubId, role_id: presidentRoleId },
    { user_id: presidentUserId, club_id: clubId, role_id: officerRoleId },
  ]);
  if (mre) throw mre;

  return { presidentRoleId, officerRoleId, memberRoleId };
}

export async function createCustomRole(
  admin: SupabaseClient,
  clubId: string,
  name: string,
  description: string,
  permissionKeys: string[],
  permByKey: Map<string, string>,
): Promise<string> {
  const { data: roleRow, error: re } = await admin
    .from("club_roles")
    .insert({
      club_id: clubId,
      name,
      description,
      is_system: false,
    })
    .select("id")
    .single();
  if (re) throw re;

  const roleId = roleRow.id as string;
  const rows = permissionKeys
    .map((k) => {
      const pid = permByKey.get(k);
      return pid ? { role_id: roleId, permission_id: pid } : null;
    })
    .filter(Boolean) as { role_id: string; permission_id: string }[];

  if (rows.length) {
    const { error: rpe } = await admin.from("role_permissions").insert(rows);
    if (rpe) throw rpe;
  }

  return roleId;
}

export async function loadPermissionMap(admin: SupabaseClient): Promise<Map<string, string>> {
  const { data, error } = await admin.from("permissions").select("id, key");
  if (error) throw error;
  return new Map((data ?? []).map((p) => [p.key, p.id as string]));
}
