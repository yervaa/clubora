/**
 * Demo site seed + reset (`npm run reset-demo`).
 *
 * Wipes the ENTIRE database (all clubs, all auth users, uploads) and inserts one
 * fictional dataset: 3 clubs, 15 people, events/RSVPs, tasks, and paid/unpaid dues.
 * Safe to re-run any time — every run starts from an empty database.
 *
 * Requires in .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   DEMO_SUPABASE_PROJECT_REF   must match the project in NEXT_PUBLIC_SUPABASE_URL
 *   DEMO_OFFICER_EMAIL / DEMO_OFFICER_PASSWORD
 *   DEMO_MEMBER_EMAIL / DEMO_MEMBER_PASSWORD
 * Safety: refuses production unless ALLOW_DEMO_SEED=true.
 * Database: migrations 023, 059 and 060 must be applied.
 */

import path from "path";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { DEMO_ACCOUNT_ENV, DEMO_EMAIL_DOMAIN, DEMO_PROJECT_REF_ENV, DEMO_SEED_ENV_FLAG } from "./constants";
import { resetDemoDatabase } from "./reset";
import { createDemoPeople, seedDemoClubs, type DemoAccounts } from "./seed";

config({ path: path.resolve(process.cwd(), ".env.local") });
config({ path: path.resolve(process.cwd(), ".env") });

function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing required env var ${name} (set it in .env.local).`);
  return v;
}

function assertSafeToRun(url: string): void {
  const explicit = process.env[DEMO_SEED_ENV_FLAG] === "true";
  if (!explicit && (process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production")) {
    throw new Error(`Refused: demo reset is blocked in production. Set ${DEMO_SEED_ENV_FLAG}=true to override.`);
  }

  const expectedRef = requireEnv(DEMO_PROJECT_REF_ENV);
  const host = new URL(url).hostname.toLowerCase();
  const isLoopback = host === "localhost" || host === "127.0.0.1" || host === "[::1]";
  if (!isLoopback && host.split(".")[0] !== expectedRef.toLowerCase()) {
    throw new Error(
      `Refused: NEXT_PUBLIC_SUPABASE_URL host (${host}) does not match ${DEMO_PROJECT_REF_ENV}=${expectedRef}. ` +
        `This script deletes every user and club on the target project.`,
    );
  }
}

function readDemoAccounts(): DemoAccounts {
  const accounts: DemoAccounts = {
    officer: {
      email: requireEnv(DEMO_ACCOUNT_ENV.officerEmail).toLowerCase(),
      password: requireEnv(DEMO_ACCOUNT_ENV.officerPassword),
    },
    member: {
      email: requireEnv(DEMO_ACCOUNT_ENV.memberEmail).toLowerCase(),
      password: requireEnv(DEMO_ACCOUNT_ENV.memberPassword),
    },
  };
  for (const a of [accounts.officer, accounts.member]) {
    if (!a.email.endsWith(DEMO_EMAIL_DOMAIN)) {
      throw new Error(`Demo account emails must end with ${DEMO_EMAIL_DOMAIN} (got ${a.email}).`);
    }
  }
  return accounts;
}

async function main(): Promise<void> {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  assertSafeToRun(url);
  const accounts = readDemoAccounts();

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log("Wiping demo database…");
  const { usersRemoved, objectsRemoved } = await resetDemoDatabase(admin);
  console.log(`  Removed all clubs, ${usersRemoved} user(s), ${objectsRemoved} uploaded file(s).`);

  console.log("Creating demo accounts + roster…");
  const ids = await createDemoPeople(admin, accounts);
  console.log(`  ${ids.size} people ready.`);

  console.log("Seeding clubs…");
  await seedDemoClubs(admin, ids);

  console.log(`\nDone. Sign in with "Try as officer" / "Try as member" on the landing page.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
