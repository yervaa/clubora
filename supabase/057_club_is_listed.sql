-- 057: Public directory opt-in flag for clubs.
--
-- Clubs are NOT publicly listed by default. Only clubs with is_listed = true
-- appear in the unauthenticated /discover directory. Join codes are private
-- join credentials and are no longer exposed in any public/unauthenticated
-- payload (directory or public club page); public surfaces identify clubs by id.
--
-- Reversible: `alter table public.clubs drop column if exists is_listed;`

alter table public.clubs
  add column if not exists is_listed boolean not null default false;

comment on column public.clubs.is_listed is
  'When true, the club appears in the public unauthenticated /discover directory. Default false (unlisted).';
