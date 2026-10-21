# Pilot showcase seed

**Destructive:** removes **all clubs** (and cascaded data), **notifications**, **audit logs**, then **every auth user** on the project, then recreates:

- **9 accounts** (2 primary + 7 roster members with visible names)
- **3 clubs** (no “Demo” in names) with distinct announcements, events, tasks, RSVPs, attendance, reflections, notifications, and sample audit rows

## Role matrix (each primary)

Using only **three** clubs, both primaries get President / Officer / Member coverage:

| Account | Muslim Student Association | DECA | Photography Club |
|--------|----------------------------|------|------------------|
| **Primary 1** (`pilot`, Jordan Park) | **President** | **Member** | **Officer** (Marcus is President) |
| **Primary 2** (`pilot2`, Alex Rivera) | **Member** | **President** | **Officer** (Marcus is President) |

## Prerequisites

1. Apply `supabase/023_pilot_showcase_reset.sql` in the Supabase SQL editor (adds or updates `pilot_showcase_reset` RPC). If you applied an older version and see `DELETE requires a WHERE clause`, run the **whole file again** so the function uses `DELETE … WHERE true`.
2. Apply `supabase/059_cleanup_orphaned_profiles.sql` too (adds `cleanup_orphaned_profiles` RPC). Without it, a second reset-and-reseed run on the same project fails: the fixed roster emails collide with the previous run's leftover `profiles` rows.
3. `.env.local` with `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` for **this** project only.

## Run

```bash
# Local Supabase (loopback URL)
ALLOW_PILOT_SHOWCASE=true npm run seed:pilot-showcase

# Hosted *.supabase.co (also set this)
ALLOW_PILOT_SHOWCASE=true PILOT_SHOWCASE_TARGET_OK=true npm run seed:pilot-showcase
```

### Optional env (override defaults in `constants.ts`)

| Variable | Purpose |
|----------|---------|
| `PILOT_SHOWCASE_EMAIL` | Primary 1 email (default `showcase.pilot@clubora.local`) |
| `PILOT_SHOWCASE_PASSWORD` | Primary 1 password |
| `PILOT_SHOWCASE_EMAIL_2` | Primary 2 email (default `showcase.pilot2@clubora.local`) |
| `PILOT_SHOWCASE_PASSWORD_2` | Primary 2 password |
| `PILOT_SHOWCASE_ROSTER_PASSWORD` | Shared password for the 7 non-primary roster accounts |

Other roster accounts use `showcase.{elena,marcus,...}@clubora.local` with a shared password — default in `constants.ts`, overridable via `PILOT_SHOWCASE_ROSTER_PASSWORD`.

Join codes: **MSACLB**, **DECACL**, **PHOCLB**.

**Do not** run against a Supabase project that has real users you need to keep.
