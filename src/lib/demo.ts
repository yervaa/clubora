import "server-only";

import type { createClient } from "@/lib/supabase/server";

export type DemoRole = "officer" | "member";

export const DEMO_ACCOUNT_LOCKED_MESSAGE = "This is a shared demo account, so it can't be changed.";

/** Shared demo login credentials. Server-only env vars; never sent to the browser. */
export function getDemoCredentials(role: DemoRole): { email: string; password: string } | null {
  const email = (role === "officer" ? process.env.DEMO_OFFICER_EMAIL : process.env.DEMO_MEMBER_EMAIL)?.trim();
  const password = role === "officer" ? process.env.DEMO_OFFICER_PASSWORD : process.env.DEMO_MEMBER_PASSWORD;
  if (!email || !password) return null;
  return { email, password };
}

/**
 * Whether the user is a seeded demo account (profiles.is_demo). The database enforces the
 * same lockdown (supabase/060_demo_mode.sql); this only lets actions return a friendly message.
 */
export async function isDemoUser(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase.from("profiles").select("is_demo").eq("id", userId).maybeSingle();
  return data?.is_demo === true;
}
