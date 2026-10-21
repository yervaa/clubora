# Clubora demo seed data

Realistic **local / staging** data for UI and product testing. All accounts use the **`@clubora.test`** email domain and join codes prefixed with the **`DMO`** series so they can be removed without touching real members.

## Safety

- The script **refuses to run** if `NODE_ENV=production` or `VERCEL_ENV=production` unless you set **`ALLOW_DEMO_SEED=true`**.
- If **`NEXT_PUBLIC_SUPABASE_URL`** points at a **non-loopback** host (e.g. `*.supabase.co`), the script also requires **`DEMO_SEED_TARGET_OK=true`**. This blocks accidental wipes when your local `NODE_ENV=development` but `.env` targets a shared hosted project.
- **Never** set these flags on a production database that holds real users unless you fully intend to delete demo join-code clubs and `*.demo@clubora.test` users on that project.

## Requirements

- **Database:** apply Supabase migrations through **`022_demo_seed_club_delete.sql`** (adds `delete_demo_clubs_by_join_codes`). Without it, reset fails because RBAC triggers block deleting clubs that still have system roles.
- Also apply **`059_cleanup_orphaned_profiles.sql`** (adds `cleanup_orphaned_profiles`). Without it, a second `npm run seed:demo` run fails: the fixed demo emails collide with `profiles` rows orphaned by the previous run's deleted auth users.
- `.env.local` (or `.env`) with:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY` (service role — required for `auth.admin`, the delete RPC, and bypassing RLS on inserts)

## Commands

```bash
# Remove all demo clubs (by join code) + all *.demo@clubora.test users, then reseed
npm run seed:demo

# Seed only (will error on duplicate join codes if demo clubs already exist)
npm run seed:demo:no-reset
```

## Login

- **Password (all demo users):** `DemoClubora!2026`
- **Examples:** `yunus.demo@clubora.test`, `aaliyah.demo@clubora.test`, `omar.demo@clubora.test`

## What gets created

- **5 clubs:** Demo Robotics, Debate, MSA, Student Council, Photography (join codes `DMOBOT`, `DMODEB`, `DMOMSA`, `DMOSTU`, `DMOPHO`).
- **24 users** with varied memberships; **Yunus** is in multiple clubs and gets task assignments.
- **System RBAC** (President / Officer / Member) plus **custom roles** (Treasurer, Build Captain, etc.) on selected clubs.
- **Announcements, events** (upcoming / recent / past), **RSVPs**, **attendance** (with one **Student Council** recent event intentionally **without** attendance for “needs review”).
- **Reflections** on several older past events.
- **Tasks** (todo / in progress / blocked / completed), assignees, some **overdue** due dates.
- **Notifications** (announcement + task types) and **audit log** samples (role assigned, presidency transfer on Student Council).

## Reset behavior

`npm run seed:demo` deletes:

1. Clubs whose `join_code` is in the fixed demo list via **`delete_demo_clubs_by_join_codes`** (cascades events, tasks, RBAC rows, etc.).
2. Auth users whose email ends with `@clubora.test`.

It does **not** delete non-demo users or clubs.

## Idempotency

- **`seed:demo`:** Idempotent — wipe + full reseed.
- **`seed:demo:no-reset`:** Not idempotent — expect unique violations if data already exists.

## Limitations

- Does **not** create real email inboxes; magic links are irrelevant — use password login.
- **Recent activity** RPC is derived from tables; no separate activity table to seed.
- If Supabase Auth returns “already registered”, the script **reuses** that user and updates `profiles`.
