# President test handoff

Use this checklist **before** you give a president (or pilot tester) a URL to try Clubora. Tick items in Supabase, Vercel, and your notes—nothing here runs automatically.

See also [LAUNCH_READINESS.md](./LAUNCH_READINESS.md) for production-oriented risks and [../README.md](../README.md) for env vars and general smoke tests.

---

## 1. Database (operator)

**Target:** the Supabase project whose URL is in `NEXT_PUBLIC_SUPABASE_URL` for the deploy the tester will use.

- [ ] Applied all numbered SQL files under [`supabase/`](../supabase/) **in order**: `001` → `025` (in the Supabase SQL Editor, or your usual migration pipeline). Skipping a file causes drift; `001` alone is not enough.
- [ ] **Roster / clubmate visibility:** confirm at least [`024_profiles_select_clubmates.sql`](../supabase/024_profiles_select_clubmates.sql) and [`025_get_club_members_for_view_row_security.sql`](../supabase/025_get_club_members_for_view_row_security.sql) are applied on that project. Missing these often shows empty rosters or permission errors for members.
- [ ] **If using the demo seed:** apply migrations through [`060_demo_mode.sql`](../supabase/060_demo_mode.sql), then follow [scripts/seed-demo/README.md](../scripts/seed-demo/README.md). `npm run reset-demo` deletes **every** user and club. Do **not** run it on a project that must keep real users.

---

## 2. Vercel and secrets (operator)

**Target:** the Vercel environment (Preview and/or Production) that matches the URL you share.

- [ ] `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` point at the same project you checked in section 1.
- [ ] `SUPABASE_SERVICE_ROLE_KEY` is set (server-only; never shared with testers).
- [ ] `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are set for durable rate limiting on serverless.
- [ ] Redeployed after any env change.

---

## 3. Supabase Auth (operator)

- [ ] **Site URL** matches the primary URL you use for this environment (e.g. production domain).
- [ ] **Redirect URLs** include every URL the tester might hit (production domain; if you use a **preview** URL, note that it can change per deployment unless you use a stable alias—add the exact URL they will open).
- [ ] If testers use **real signup** (not pilot accounts): email confirmation and provider/templates match what you expect; test one inbox flow yourself.
- [ ] Pilot seed accounts are created with confirmed email via the Admin API; they do not need to receive mail for those addresses.

---

## 4. How the tester signs in (choose one)

| Path | When | You do |
|------|------|--------|
| **Demo seed** | Throwaway Supabase project; full fixture (clubs, roster, events, dues) | Run `npm run reset-demo` per [scripts/seed-demo/README.md](../scripts/seed-demo/README.md). Visitors use the one-click demo buttons; credentials are env-only (`DEMO_*`). Never share the service role key. |
| **Real accounts** | Closer to production | Sign up (or have them sign up), create or join a club, ensure they have president/officer access where you want it tested. Optionally add a second account for member-only flows. |

- [ ] Chosen path recorded: _________________________
- [ ] Credentials shared securely (password manager or private channel), not in public tickets.

---

## 5. Script to send the president (smoke test)

Copy and adjust URLs or club names as needed.

1. Open the app URL: `_________________________`
2. Log in with the account we gave you.
3. Open **Dashboard** — your clubs should appear.
4. Open a **club** you manage.
5. **Roster / members** — you should see member **names** (and roles); **email addresses are not shown** in the member list UI.
6. **Announcements** — create or read a post (if you have permission).
7. **Events** — open events; try **RSVP** if there is an event.
8. **Tasks** — open tasks; create or update if your role allows.
9. **Governance / settings** — only if you are a **President** (role assignment, co-president, etc., per what we enabled).

If something fails, note the **page URL**, **what you clicked**, and **what you expected** (screenshots help).

---

## 6. Privacy expectation (set with testers who are also admins)

Hiding email in the app UI does **not** remove emails from the database. Anyone with **Supabase dashboard** or database access can still see profile email fields. Set expectations if the tester has project admin access.
