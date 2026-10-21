-- ─── 059: Clean up profiles orphaned by demo/pilot-showcase auth user resets ──
-- Problem: pilot_showcase_reset() (023) and delete_demo_clubs_by_join_codes() (022)
-- never touch public.profiles, and there is no FK/trigger cascading auth.users
-- deletes into profiles (handle_new_user only runs on INSERT, "on conflict (id)
-- do nothing"). So after a seed script deletes auth users and later recreates
-- accounts with the same fixed emails (showcase.*@clubora.local, *.demo@clubora.test),
-- the leftover profile row's UNIQUE(email) constraint collides and createUser()
-- fails on the very next reset-and-reseed run.
--
-- Fix: a service-role-only RPC that deletes profiles with no matching auth.users
-- row. Called after auth users are deleted, before new ones are created.

create or replace function public.cleanup_orphaned_profiles()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer := 0;
begin
  delete from public.profiles p
  where not exists (select 1 from auth.users u where u.id = p.id);

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

comment on function public.cleanup_orphaned_profiles() is
  'Demo seed / pilot-showcase only: deletes profiles rows with no matching auth.users row, called after bulk auth user deletion so re-seeding with fixed emails does not hit the profiles.email unique constraint.';

revoke all on function public.cleanup_orphaned_profiles() from public, anon, authenticated;
grant execute on function public.cleanup_orphaned_profiles() to service_role;
