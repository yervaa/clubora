import { randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CLUB_PLANS,
  DEMO_MEMBER_NAME,
  DEMO_OFFICER_NAME,
  ROSTER,
  rosterEmail,
  type ClubPlan,
  type PersonKey,
} from "./content";
import { createCustomRole, loadPermissionMap, seedSystemRolesForClub } from "./rbac";

export type DemoAccounts = {
  officer: { email: string; password: string };
  member: { email: string; password: string };
};

type PeopleIds = Map<PersonKey, string>;

function daysFromNow(days: number, hourUtc = 22): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(hourUtc, 0, 0, 0);
  return d.toISOString();
}

function dateOnly(days: number): string {
  return daysFromNow(days).slice(0, 10);
}

async function createUser(
  admin: SupabaseClient,
  email: string,
  password: string,
  fullName: string,
): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error) throw new Error(`createUser ${email}: ${error.message}`);
  if (!data.user) throw new Error(`createUser ${email}: no user returned`);
  return data.user.id;
}

/** Creates the two demo logins + roster users and flags every profile as is_demo. */
export async function createDemoPeople(admin: SupabaseClient, accounts: DemoAccounts): Promise<PeopleIds> {
  const ids: PeopleIds = new Map();

  ids.set("officer", await createUser(admin, accounts.officer.email, accounts.officer.password, DEMO_OFFICER_NAME));
  ids.set("member", await createUser(admin, accounts.member.email, accounts.member.password, DEMO_MEMBER_NAME));

  for (const r of ROSTER) {
    // Roster members never sign in; a random throwaway password keeps them unusable.
    const throwaway = randomBytes(24).toString("base64url");
    ids.set(r.slug, await createUser(admin, rosterEmail(r.fullName), throwaway, r.fullName));
  }

  // handle_new_user (auth trigger) already inserted the profile rows.
  const { error } = await admin.from("profiles").update({ is_demo: true }).in("id", [...ids.values()]);
  if (error) throw error;

  return ids;
}

function id(ids: PeopleIds, key: PersonKey): string {
  const v = ids.get(key);
  if (!v) throw new Error(`Missing demo person ${key}`);
  return v;
}

export async function seedDemoClubs(admin: SupabaseClient, ids: PeopleIds): Promise<void> {
  const permByKey = await loadPermissionMap(admin);
  for (const plan of CLUB_PLANS) {
    await seedClub(admin, ids, plan, permByKey);
    console.log(`  ✓ ${plan.name}`);
  }
}

async function seedClub(
  admin: SupabaseClient,
  ids: PeopleIds,
  plan: ClubPlan,
  permByKey: Map<string, string>,
): Promise<void> {
  const presidentId = id(ids, plan.president);

  // ── Club + roles + membership ─────────────────────────────────────────────
  const { data: club, error: clubErr } = await admin
    .from("clubs")
    .insert({
      name: plan.name,
      description: plan.description,
      join_code: plan.joinCode,
      created_by: presidentId,
      is_listed: true,
      is_demo: true,
    })
    .select("id")
    .single();
  if (clubErr) throw clubErr;
  const clubId = club.id as string;

  // on_club_created already added the president to club_members.
  await seedSystemRolesForClub(admin, clubId, presidentId);

  const officerKeys: PersonKey[] = ["officer", ...plan.officers];
  const memberKeys: PersonKey[] = ["member", ...plan.members];
  const allKeys: PersonKey[] = [plan.president, ...officerKeys, ...memberKeys];

  // assign_rbac_role_on_member_insert maps legacy role → Officer / Member system role.
  const { error: cmErr } = await admin.from("club_members").insert([
    ...officerKeys.map((k) => ({ club_id: clubId, user_id: id(ids, k), role: "officer" })),
    ...memberKeys.map((k) => ({ club_id: clubId, user_id: id(ids, k), role: "member" })),
  ]);
  if (cmErr) throw cmErr;

  // The stock Officer role can't see dues; a Treasurer role lets the demo officer show off that page.
  const treasurerRoleId = await createCustomRole(
    admin,
    clubId,
    "Treasurer",
    "Manages club dues and payment tracking",
    ["members.view", "dues.manage", "members.manage_member_dues"],
    permByKey,
  );
  const { error: trErr } = await admin
    .from("member_roles")
    .insert({ user_id: id(ids, "officer"), club_id: clubId, role_id: treasurerRoleId });
  if (trErr) throw trErr;

  // ── Announcements ─────────────────────────────────────────────────────────
  const { data: anns, error: annErr } = await admin
    .from("announcements")
    .insert(
      plan.announcements.map((a) => ({
        club_id: clubId,
        title: a.title,
        content: a.content,
        created_by: presidentId,
        created_at: daysFromNow(-a.daysAgo, 15),
        is_pinned: a.pinned ?? false,
        pinned_at: a.pinned ? daysFromNow(-a.daysAgo, 15) : null,
      })),
    )
    .select("id, title, created_at");
  if (annErr) throw annErr;

  // ── Events, RSVPs, attendance ─────────────────────────────────────────────
  const { data: events, error: evErr } = await admin
    .from("events")
    .insert(
      plan.events.map((e) => ({
        club_id: clubId,
        title: e.title,
        description: e.description,
        location: e.location,
        event_date: daysFromNow(e.days),
        event_type: e.type,
        capacity: e.capacity ?? null,
        created_by: presidentId,
        created_at: daysFromNow(Math.min(e.days, 0) - 10, 15),
      })),
    )
    .select("id");
  if (evErr) throw evErr;
  if (events.length !== plan.events.length) throw new Error("events insert returned unexpected row count");

  const rsvps: Array<{ event_id: string; user_id: string; status: string }> = [];
  const attendance: Array<{ event_id: string; user_id: string; marked_by: string; marked_at: string }> = [];
  let upcomingIndex = 0;

  plan.events.forEach((spec, i) => {
    const eventId = events[i].id as string;
    if (spec.days >= 0) {
      allKeys.forEach((k, j) => {
        // Leave the demo member's later RSVPs open so visitors can try the control.
        if (k === "member") {
          if (upcomingIndex === 0) rsvps.push({ event_id: eventId, user_id: id(ids, k), status: "yes" });
          if (upcomingIndex === 1) rsvps.push({ event_id: eventId, user_id: id(ids, k), status: "maybe" });
          return;
        }
        if ((i + j) % 5 === 4) return; // some people haven't responded
        const status = (i + j) % 4 === 3 ? "maybe" : (i + j) % 7 === 6 ? "no" : "yes";
        rsvps.push({ event_id: eventId, user_id: id(ids, k), status });
      });
      upcomingIndex += 1;
    } else {
      allKeys.forEach((k, j) => {
        if ((i + j) % 4 === 0 && k !== "member") return; // a few absences
        attendance.push({
          event_id: eventId,
          user_id: id(ids, k),
          marked_by: id(ids, "officer"),
          marked_at: daysFromNow(spec.days, 23),
        });
      });
    }
  });

  const { error: rsvpErr } = await admin.from("rsvps").insert(rsvps);
  if (rsvpErr) throw rsvpErr;
  const { error: attErr } = await admin.from("event_attendance").insert(attendance);
  if (attErr) throw attErr;

  // ── Tasks ─────────────────────────────────────────────────────────────────
  for (const t of plan.tasks) {
    const { data: task, error: tErr } = await admin
      .from("club_tasks")
      .insert({
        club_id: clubId,
        title: t.title,
        description: t.description,
        status: t.status,
        priority: t.priority,
        due_at: daysFromNow(t.dueDays),
        completed_at: t.status === "completed" ? daysFromNow(t.dueDays - 1) : null,
        created_by: presidentId,
      })
      .select("id")
      .single();
    if (tErr) throw tErr;
    const { error: aErr } = await admin
      .from("club_task_assignees")
      .insert({ task_id: task.id as string, user_id: id(ids, t.assignee) });
    if (aErr) throw aErr;
  }

  // ── Dues: officer tracker + Stripe-style payment request ──────────────────
  const { error: dsErr } = await admin.from("club_dues_settings").insert({
    club_id: clubId,
    label: plan.dues.title,
    amount_cents: plan.dues.amountCents,
    due_date: dateOnly(plan.dues.dueDays),
    updated_by: presidentId,
  });
  if (dsErr) throw dsErr;

  const trackerRows = [...officerKeys, ...memberKeys].map((k) => ({
    club_id: clubId,
    user_id: id(ids, k),
    status: plan.dues.tracker[k] ?? "unpaid",
    updated_by: id(ids, "officer"),
  }));
  const { error: cmdErr } = await admin.from("club_member_dues").insert(trackerRows);
  if (cmdErr) throw cmdErr;

  const { data: dues, error: duesErr } = await admin
    .from("dues")
    .insert({
      club_id: clubId,
      title: plan.dues.title,
      description: "Covers supplies and event costs for the semester. Demo data only.",
      amount_cents: plan.dues.amountCents,
      due_date: dateOnly(plan.dues.dueDays),
      created_by: presidentId,
      created_at: daysFromNow(-10, 15),
    })
    .select("id")
    .single();
  if (duesErr) throw duesErr;

  const paymentRows = (Object.entries(plan.dues.payments) as Array<[PersonKey, "paid" | "pending"]>).map(
    ([k, status], i) => ({
      dues_id: dues.id as string,
      club_id: clubId,
      user_id: id(ids, k),
      amount_cents: plan.dues.amountCents,
      status,
      paid_at: status === "paid" ? daysFromNow(-8 + i, 18) : null,
    }),
  );
  if (paymentRows.length) {
    const { error: payErr } = await admin.from("dues_payments").insert(paymentRows);
    if (payErr) throw payErr;
  }

  // ── Notifications + activity feed ─────────────────────────────────────────
  const latest = anns[0];
  const notifications = (["officer", "member"] as const).map((k) => ({
    user_id: id(ids, k),
    club_id: clubId,
    type: "announcement_created",
    title: `New announcement in ${plan.name}`,
    body: latest.title as string,
    href: `/clubs/${clubId}/announcements`,
    is_read: false,
  }));
  const officerTask = plan.tasks.find((t) => t.assignee === "officer");
  if (officerTask) {
    notifications.push({
      user_id: id(ids, "officer"),
      club_id: clubId,
      type: "task_assigned",
      title: "Task assigned to you",
      body: officerTask.title,
      href: `/clubs/${clubId}/tasks`,
      is_read: false,
    });
  }
  const { error: nErr } = await admin.from("notifications").insert(notifications);
  if (nErr) throw nErr;

  const activity = [
    ...anns.map((a) => ({
      type: "announcement.created",
      actor_id: presidentId,
      club_id: clubId,
      entity_id: a.id as string,
      target_label: a.title as string,
      href: `/clubs/${clubId}/announcements#announcement-${a.id as string}`,
      metadata: { seeded: true },
      created_at: a.created_at as string,
    })),
    ...plan.events.map((e, i) => ({
      type: "event.created",
      actor_id: presidentId,
      club_id: clubId,
      entity_id: events[i].id as string,
      target_label: e.title,
      href: `/clubs/${clubId}/events#event-${events[i].id as string}`,
      metadata: { seeded: true },
      created_at: daysFromNow(Math.min(e.days, 0) - 10, 15),
    })),
  ];
  const { error: actErr } = await admin.from("activity_events").insert(activity);
  if (actErr) throw actErr;
}
