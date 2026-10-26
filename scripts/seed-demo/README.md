# Demo site seed / reset

`npm run reset-demo` **wipes the entire database** and inserts one clean, fictional dataset. It is safe to re-run at any time: every run starts from empty, so it also works as the reset script.

## What it deletes

Every club and everything that cascades from it, plus notifications, audit logs, **all auth users**, orphaned profiles, and every file in the `announcement-attachments` bucket.

## What it creates

- **2 demo logins** (from env): `Demo Officer` and `Demo Member`.
- **13 roster members** with obviously fake names (`Avery Example`, `Blake Sample`, …) at `@demo.clubora.test`. They get random throwaway passwords that are never stored, so nobody can sign in as them.
- **3 clubs:** Robotics Club (`DEMROB`), Debate Society (`DEMDEB`), Photography Club (`DEMPHO`), all `is_demo = true` and listed on Discover.
  - The demo officer has the **Officer** role in every club, plus a **Treasurer** custom role (`dues.manage`, `members.manage_member_dues`) so the Dues page is visible. The demo member has the **Member** role.
  - Each club gets 3 announcements (1 pinned), 4 upcoming events with RSVPs (the demo member's later RSVPs are left open to try), 2 past events with attendance, and 3 tasks.
  - **Dues:** a dues term, an officer roster tracker (`paid` / `unpaid` / `partial` / `exempt`), and a Stripe-style payment request with a mix of `paid` and `pending` payments. The demo member is paid in Robotics and unpaid in Debate and Photography.

## Requirements

`.env.local`:

| Var | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Service-role access (auth admin, bypasses RLS) |
| `DEMO_SUPABASE_PROJECT_REF` | Must match the project in the URL, or the script refuses to run |
| `DEMO_OFFICER_EMAIL`, `DEMO_OFFICER_PASSWORD` | Officer login (email must end with `@demo.clubora.test`) |
| `DEMO_MEMBER_EMAIL`, `DEMO_MEMBER_PASSWORD` | Member login |
| `ALLOW_DEMO_SEED=true` | Only needed when `NODE_ENV` / `VERCEL_ENV` is `production` |

Database migrations: `023_pilot_showcase_reset.sql` (club wipe RPC), `059_cleanup_orphaned_profiles.sql`, and `060_demo_mode.sql` (`is_demo` flags, demo isolation RLS, shared-account lockdown).

## Shared-account lockdown (migration 060)

The demo accounts are shared by every visitor, so the database blocks the actions that would break the demo for everyone else:

- creating clubs
- changing display name or email in `profiles`
- changing email, phone, password, or user metadata in `auth.users`, including direct Auth API calls

The app also returns a friendly message for these actions.

If you need to change a demo password, update the env vars and re-run `npm run reset-demo`. Don't try to edit the existing user.
