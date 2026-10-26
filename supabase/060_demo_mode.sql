-- ─── 060: Demo-only site — demo club isolation + shared-account lockdown ──────
-- The public site runs on two shared demo logins (officer + member). This migration:
--   1. Flags demo rows: clubs.is_demo, profiles.is_demo (set only by the service-role
--      seed, scripts/seed-demo). Nobody else can flip either flag.
--   2. Adds RESTRICTIVE RLS policies: a demo user may only read/write rows that belong
--      to a demo club. Restrictive policies are AND-ed with the existing permissive
--      ones, so normal RBAC still applies on top.
--   3. Locks the shared accounts: demo users cannot create clubs, rename themselves,
--      or change email / password / user metadata (including via the Auth API directly).
--
-- "Privileged" = not an end-user JWT request (service_role, postgres, migrations).

begin;

-- ─── 1. Flags ────────────────────────────────────────────────────────────────

alter table public.clubs    add column if not exists is_demo boolean not null default false;
alter table public.profiles add column if not exists is_demo boolean not null default false;

-- ─── Helpers ─────────────────────────────────────────────────────────────────

create or replace function public.is_privileged_request()
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce(auth.role(), '') not in ('authenticated', 'anon');
$$;

create or replace function public.is_demo_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.is_demo from public.profiles p where p.id = auth.uid()), false);
$$;

-- True when the caller may touch a row of this club: non-demo users always pass
-- (existing policies decide); demo users only for demo clubs. NULL club → demo users fail.
create or replace function public.demo_club_access_ok(p_club_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not public.is_demo_user()
      or coalesce((select c.is_demo from public.clubs c where c.id = p_club_id), false);
$$;

-- Parent lookups for child tables without a club_id column (bypass RLS on the parent).
create or replace function public.club_id_of_event(p_id uuid)
returns uuid language sql stable security definer set search_path = public
as $$ select club_id from public.events where id = p_id; $$;

create or replace function public.club_id_of_announcement(p_id uuid)
returns uuid language sql stable security definer set search_path = public
as $$ select club_id from public.announcements where id = p_id; $$;

create or replace function public.club_id_of_task(p_id uuid)
returns uuid language sql stable security definer set search_path = public
as $$ select club_id from public.club_tasks where id = p_id; $$;

create or replace function public.club_id_of_role(p_id uuid)
returns uuid language sql stable security definer set search_path = public
as $$ select club_id from public.club_roles where id = p_id; $$;

create or replace function public.club_id_of_member_tag(p_id uuid)
returns uuid language sql stable security definer set search_path = public
as $$ select club_id from public.club_member_tags where id = p_id; $$;

create or replace function public.club_id_of_team(p_id uuid)
returns uuid language sql stable security definer set search_path = public
as $$ select club_id from public.club_teams where id = p_id; $$;

revoke all on function public.demo_club_access_ok(uuid) from public, anon;
grant execute on function public.demo_club_access_ok(uuid) to authenticated, service_role;

-- ─── 2. Restrictive RLS: demo users only see demo clubs ──────────────────────

drop policy if exists "demo_isolation" on public.clubs;
create policy "demo_isolation" on public.clubs
  as restrictive for all to authenticated
  using (not public.is_demo_user() or is_demo)
  with check (not public.is_demo_user() or is_demo);

-- Tables with a NOT NULL club_id column.
do $$
declare
  t text;
begin
  foreach t in array array[
    'activity_events', 'announcements', 'club_audit_logs', 'club_dues_settings',
    'club_join_requests', 'club_member_availability_slots', 'club_member_contact',
    'club_member_dues', 'club_member_officer_notes', 'club_member_skills_interests',
    'club_member_tags', 'club_member_volunteer_hours', 'club_members', 'club_roles',
    'club_tasks', 'club_teams', 'dues', 'dues_payments', 'event_series', 'events',
    'member_roles'
  ]
  loop
    execute format('drop policy if exists "demo_isolation" on public.%I', t);
    execute format(
      'create policy "demo_isolation" on public.%I as restrictive for all to authenticated '
      'using (public.demo_club_access_ok(club_id)) with check (public.demo_club_access_ok(club_id))',
      t
    );
  end loop;
end;
$$;

-- notifications.club_id is nullable (non-club notifications stay visible to their owner).
drop policy if exists "demo_isolation" on public.notifications;
create policy "demo_isolation" on public.notifications
  as restrictive for all to authenticated
  using (club_id is null or public.demo_club_access_ok(club_id))
  with check (club_id is null or public.demo_club_access_ok(club_id));

-- Child tables, resolved through their parent's club.
do $$
declare
  spec text[];
begin
  foreach spec slice 1 in array array[
    array['rsvps',                       'club_id_of_event(event_id)'],
    array['event_attendance',            'club_id_of_event(event_id)'],
    array['event_reflections',           'club_id_of_event(event_id)'],
    array['event_reminder_dispatches',   'club_id_of_event(event_id)'],
    array['announcement_attachments',    'club_id_of_announcement(announcement_id)'],
    array['announcement_reads',          'club_id_of_announcement(announcement_id)'],
    array['poll_votes',                  'club_id_of_announcement(announcement_id)'],
    array['club_task_assignees',         'club_id_of_task(task_id)'],
    array['role_permissions',            'club_id_of_role(role_id)'],
    array['club_member_tag_assignments', 'club_id_of_member_tag(tag_id)'],
    array['club_team_members',           'club_id_of_team(team_id)']
  ]
  loop
    execute format('drop policy if exists "demo_isolation" on public.%I', spec[1]);
    execute format(
      'create policy "demo_isolation" on public.%I as restrictive for all to authenticated '
      'using (public.demo_club_access_ok(public.%s)) with check (public.demo_club_access_ok(public.%s))',
      spec[1], spec[2], spec[2]
    );
  end loop;
end;
$$;

-- Demo users only see demo profiles (plus their own row).
drop policy if exists "demo_isolation" on public.profiles;
create policy "demo_isolation" on public.profiles
  as restrictive for all to authenticated
  using (not public.is_demo_user() or is_demo or id = auth.uid())
  with check (not public.is_demo_user() or is_demo or id = auth.uid());

-- ─── 3. Shared-account lockdown ──────────────────────────────────────────────

-- clubs: demo users cannot create clubs (create_club_with_creator_membership is
-- SECURITY DEFINER, so RLS alone would not stop it); only privileged roles set is_demo.
create or replace function public.guard_demo_clubs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_privileged_request() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if public.is_demo_user() then
      raise exception 'Demo accounts cannot create clubs' using errcode = '42501';
    end if;
    new.is_demo := false;
  elsif new.is_demo is distinct from old.is_demo then
    raise exception 'clubs.is_demo can only be changed by the service role' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_demo_clubs on public.clubs;
create trigger guard_demo_clubs
  before insert or update on public.clubs
  for each row execute function public.guard_demo_clubs();

-- profiles: demo profiles are read-only to end users; only privileged roles set is_demo.
-- Same-value upserts (loginAction's upsertCurrentUserProfile) still pass.
create or replace function public.guard_demo_profiles()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_privileged_request() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.is_demo := false;
    return new;
  end if;

  if new.is_demo is distinct from old.is_demo then
    raise exception 'profiles.is_demo can only be changed by the service role' using errcode = '42501';
  end if;

  if old.is_demo and (new.full_name is distinct from old.full_name or new.email is distinct from old.email) then
    raise exception 'Demo account profiles cannot be changed' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_demo_profiles on public.profiles;
create trigger guard_demo_profiles
  before insert or update on public.profiles
  for each row execute function public.guard_demo_profiles();

-- auth.users: block email / phone / password / metadata changes for demo accounts, so a
-- visitor cannot lock others out by calling the Auth API (updateUser, recovery) directly.
-- GoTrue writes as supabase_auth_admin without JWT claims, so this cannot rely on
-- is_privileged_request(); the seed never updates demo users (it deletes + recreates).
-- Emergency bypass for manual maintenance: set local app.allow_demo_user_update = 'on'.
create or replace function public.guard_demo_auth_users()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('app.allow_demo_user_update', true), '') = 'on' then
    return new;
  end if;

  if not exists (select 1 from public.profiles p where p.id = old.id and p.is_demo) then
    return new;
  end if;

  if new.email is distinct from old.email
     or new.phone is distinct from old.phone
     or new.encrypted_password is distinct from old.encrypted_password
     or nullif(new.email_change, '') is distinct from nullif(old.email_change, '')
     or nullif(new.phone_change, '') is distinct from nullif(old.phone_change, '')
     or new.raw_user_meta_data is distinct from old.raw_user_meta_data
  then
    raise exception 'Demo accounts cannot be modified' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_demo_auth_users on auth.users;
create trigger guard_demo_auth_users
  before update on auth.users
  for each row execute function public.guard_demo_auth_users();

commit;
