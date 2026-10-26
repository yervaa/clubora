"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { enforceRateLimit, getRateLimitErrorMessage } from "@/lib/rate-limit";
import { getSafeNextPath } from "@/lib/auth/redirects";
import { upsertCurrentUserProfile } from "@/lib/profiles";
import { createClient } from "@/lib/supabase/server";
import { getDemoCredentials, type DemoRole } from "@/lib/demo";
import { loginSchema } from "@/lib/validation/auth";

function getAuthErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.toLowerCase().includes("fetch failed")) {
    return "Network error reaching Supabase. Check your internet/DNS and try again.";
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Unexpected authentication error. Please try again.";
}

function normalizeSupabaseErrorMessage(message: string) {
  if (message.toLowerCase().includes("fetch failed")) {
    return "Network error reaching Supabase. Check your internet/DNS and try again.";
  }

  return message;
}

/** Avoid leaking unusual Supabase/internal text; keep actionable messages short. */
function sanitizeAuthFlowError(message: string, flow: "login" | "signup"): string {
  const m = normalizeSupabaseErrorMessage(message);
  const ml = m.toLowerCase();

  if (flow === "login") {
    if (ml.includes("invalid login credentials") || ml.includes("invalid credentials")) {
      return "Invalid email or password.";
    }
  }

  if (m.length > 220) {
    return flow === "login"
      ? "Could not sign in. Please try again."
      : "Could not create your account. Please try again.";
  }

  return m;
}

function getSafeValidationErrorMessage(result: { error: { issues: Array<{ message: string }> } }) {
  return result.error.issues[0]?.message ?? "Please review your input and try again.";
}

export async function loginAction(formData: FormData) {
  const rawNext = formData.get("next");
  const nextPath = getSafeNextPath(
    typeof rawNext === "string" ? rawNext : null,
  );
  const rawEmail = formData.get("email");
  const rawPassword = formData.get("password");

  const parsed = loginSchema.safeParse({
    email: rawEmail,
    password: rawPassword,
  });

  if (!parsed.success) {
    redirect(`/login?error=${encodeURIComponent(getSafeValidationErrorMessage(parsed))}&next=${encodeURIComponent(nextPath)}`);
  }

  const rateLimit = await enforceRateLimit({
    policy: "login",
    hint: parsed.data.email,
  });
  if (!rateLimit.success) {
    redirect(`/login?error=${encodeURIComponent(getRateLimitErrorMessage())}&next=${encodeURIComponent(nextPath)}`);
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword(parsed.data);

    if (error) {
      redirect(
        `/login?error=${encodeURIComponent(sanitizeAuthFlowError(error.message, "login"))}&next=${encodeURIComponent(nextPath)}`,
      );
    }

    if (data.user) {
      const { error: profileError } = await upsertCurrentUserProfile(supabase, data.user);
      if (profileError) {
        redirect(`/login?error=Could+not+prepare+your+profile.+Please+retry.&next=${encodeURIComponent(nextPath)}`);
      }
    }
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    redirect(
      `/login?error=${encodeURIComponent(sanitizeAuthFlowError(getAuthErrorMessage(error), "login"))}&next=${encodeURIComponent(nextPath)}`,
    );
  }

  redirect(nextPath);
}

/**
 * One-click demo sign-in. Credentials come from server-only env vars and never reach
 * the browser. Public signups are disabled on the demo site (here and in Supabase Auth).
 */
export async function demoSignInAction(formData: FormData) {
  const rawRole = formData.get("role");
  const role: DemoRole | null = rawRole === "officer" || rawRole === "member" ? rawRole : null;
  if (!role) {
    redirect("/?error=Unknown+demo+account.");
  }

  const credentials = getDemoCredentials(role);
  if (!credentials) {
    console.error(`[demo] DEMO_${role.toUpperCase()}_EMAIL / _PASSWORD not configured`);
    redirect("/?error=The+demo+is+temporarily+unavailable.");
  }

  const rateLimit = await enforceRateLimit({ policy: "demoLogin" });
  if (!rateLimit.success) {
    redirect(`/?error=${encodeURIComponent(getRateLimitErrorMessage())}`);
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword(credentials);
    if (error) {
      console.error("[demo] sign-in failed:", error.message);
      redirect("/?error=Could+not+start+the+demo.+Please+try+again.");
    }
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    console.error("[demo] sign-in failed:", getAuthErrorMessage(error));
    redirect("/?error=Could+not+start+the+demo.+Please+try+again.");
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function logoutAction() {
  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
  } catch {
    // Still send the user to login; session cookies may already be invalid.
  }
  revalidatePath("/", "layout");
  revalidatePath("/dashboard");
  revalidatePath("/clubs");
  redirect("/login?message=You+have+been+logged+out.");
}
