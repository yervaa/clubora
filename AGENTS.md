# ClubHub

A Next.js 16 (App Router) + Supabase web app for school club management (announcements, events, RSVPs, member roles).

## Cursor Cloud specific instructions

### Services

| Service | How to run | Notes |
|---------|-----------|-------|
| Next.js dev server | `npm run dev` (port 3000) | Primary app; requires `.env.local` |

### Key commands

- **Install deps:** `npm install`
- **Lint:** `npm run lint` (ESLint 9 with `eslint-config-next`)
- **Build:** `npm run build`
- **Dev server:** `npm run dev`

### Environment variables

The app requires a `.env.local` file (see `.env.example`). Three Supabase variables are mandatory for the app to function:

- `NEXT_PUBLIC_SUPABASE_URL` — full `https://` URL of the Supabase project
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase anon/public key
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase service-role key (server-only)

Upstash Redis variables (`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`) are optional; the app falls back to an in-memory rate limiter when they are absent.

Without real Supabase credentials the app starts and renders all pages, but auth actions (login/signup) fail with a "Network error reaching Supabase" message. This is expected.

### Caveats

- The repo also contains a legacy Flask app (`app.py`, `requirements.txt`, `templates/`). This is **not** the active application — ignore it for development purposes.
- The middleware (`middleware.ts`) calls `getSupabaseEnv()` on every request, which throws if `NEXT_PUBLIC_SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_ANON_KEY` are missing. Always ensure `.env.local` exists before starting the dev server.
- The `npm run build` command succeeds with placeholder Supabase values since all pages are dynamically rendered (no static data fetching at build time).
