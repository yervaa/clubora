/**
 * Demo site seed constants. No credentials live here — the two public demo
 * logins come from env vars (see run.ts), and roster members get random
 * passwords that are never stored or printed.
 */

export const DEMO_EMAIL_DOMAIN = "@demo.clubora.test";

/** Required to run the seed when NODE_ENV=production or VERCEL_ENV=production. */
export const DEMO_SEED_ENV_FLAG = "ALLOW_DEMO_SEED";

/**
 * Supabase project ref the seed is allowed to wipe. The seed deletes ALL clubs
 * and ALL auth users, so it refuses to run unless NEXT_PUBLIC_SUPABASE_URL
 * points at exactly this project.
 */
export const DEMO_PROJECT_REF_ENV = "DEMO_SUPABASE_PROJECT_REF";

export const DEMO_ACCOUNT_ENV = {
  officerEmail: "DEMO_OFFICER_EMAIL",
  officerPassword: "DEMO_OFFICER_PASSWORD",
  memberEmail: "DEMO_MEMBER_EMAIL",
  memberPassword: "DEMO_MEMBER_PASSWORD",
} as const;

/** Storage buckets whose objects are cleared on reset (club-scoped uploads). */
export const DEMO_STORAGE_BUCKETS = ["announcement-attachments"] as const;
