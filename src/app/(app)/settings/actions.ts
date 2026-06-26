"use server";

import { revalidatePath } from "next/cache";
import { enforceRateLimit, getRateLimitErrorMessage } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { notificationPreferencesFormSchema } from "@/lib/validation/notification-preferences";
import { changePasswordSchema, updateDisplayNameSchema } from "@/lib/validation/profile-settings";

export type NotificationPreferencesActionState =
  | { ok: true; message?: string }
  | { ok: false; message: string }
  | null;

function parseCheckbox(formData: FormData, name: string): boolean {
  return formData.get(name) === "on";
}

export async function updateNotificationPreferencesAction(
  _prev: NotificationPreferencesActionState,
  formData: FormData,
): Promise<NotificationPreferencesActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, message: "You must be signed in to update notification settings." };
  }

  const raw = {
    in_app_announcements: parseCheckbox(formData, "in_app_announcements"),
    email_announcements: parseCheckbox(formData, "email_announcements"),
    in_app_events: parseCheckbox(formData, "in_app_events"),
    email_events: parseCheckbox(formData, "email_events"),
    in_app_reminders: parseCheckbox(formData, "in_app_reminders"),
    email_reminders: parseCheckbox(formData, "email_reminders"),
    in_app_role_membership: parseCheckbox(formData, "in_app_role_membership"),
    email_role_membership: parseCheckbox(formData, "email_role_membership"),
    in_app_activity: parseCheckbox(formData, "in_app_activity"),
    email_activity: parseCheckbox(formData, "email_activity"),
    quiet_hours_enabled: parseCheckbox(formData, "quiet_hours_enabled"),
    quiet_hours_start: String(formData.get("quiet_hours_start") ?? "").trim(),
    quiet_hours_end: String(formData.get("quiet_hours_end") ?? "").trim(),
    timezone: String(formData.get("timezone") ?? "").trim() || "UTC",
    weekly_digest_enabled: parseCheckbox(formData, "weekly_digest_enabled"),
  };

  const parsed = notificationPreferencesFormSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, message: first?.message ?? "Invalid notification settings." };
  }

  const v = parsed.data;
  const quietOn = v.quiet_hours_enabled;

  const { error } = await supabase.from("notification_preferences").upsert(
    {
      user_id: user.id,
      in_app_announcements: v.in_app_announcements,
      email_announcements: v.email_announcements,
      in_app_events: v.in_app_events,
      email_events: v.email_events,
      in_app_reminders: v.in_app_reminders,
      email_reminders: v.email_reminders,
      in_app_role_membership: v.in_app_role_membership,
      email_role_membership: v.email_role_membership,
      in_app_activity: v.in_app_activity,
      email_activity: v.email_activity,
      quiet_hours_enabled: quietOn,
      quiet_hours_start: quietOn ? v.quiet_hours_start!.trim() : null,
      quiet_hours_end: quietOn ? v.quiet_hours_end!.trim() : null,
      timezone: v.timezone,
      weekly_digest_enabled: v.weekly_digest_enabled,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) {
    console.error("[settings] notification preferences upsert failed:", error.message);
    return { ok: false, message: "Could not save notification settings. Please try again." };
  }

  revalidatePath("/settings");
  return { ok: true, message: "Notification settings saved." };
}

export type ProfileActionState = { ok: true; message?: string } | { ok: false; message: string } | null;

function firstValidationMessage(result: { error: { issues: Array<{ message: string }> } }) {
  return result.error.issues[0]?.message ?? "Please review your input and try again.";
}

export async function updateDisplayNameAction(
  _prev: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, message: "You must be signed in to update your profile." };
  }

  const parsed = updateDisplayNameSchema.safeParse({
    fullName: formData.get("full_name"),
  });

  if (!parsed.success) {
    return { ok: false, message: firstValidationMessage(parsed) };
  }

  const fullName = parsed.data.fullName;

  const { error: authError } = await supabase.auth.updateUser({
    data: { full_name: fullName },
  });

  if (authError) {
    console.error("[settings] display name auth update failed:", authError.message);
    return { ok: false, message: "Could not save your display name. Please try again." };
  }

  const { error: profileError } = await supabase
    .from("profiles")
    .update({ full_name: fullName })
    .eq("id", user.id);

  if (profileError) {
    console.error("[settings] display name profile update failed:", profileError.message);
    return { ok: false, message: "Could not save your display name. Please try again." };
  }

  revalidatePath("/settings");
  revalidatePath("/dashboard");
  revalidatePath("/", "layout");
  return { ok: true, message: "Display name saved." };
}

export async function changePasswordAction(
  _prev: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return { ok: false, message: "You must be signed in with an email account to change your password." };
  }

  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("current_password"),
    newPassword: formData.get("new_password"),
    confirmPassword: formData.get("confirm_password"),
  });

  if (!parsed.success) {
    return { ok: false, message: firstValidationMessage(parsed) };
  }

  const { currentPassword, newPassword } = parsed.data;

  const rateLimit = await enforceRateLimit({ policy: "passwordChange", userId: user.id });
  if (!rateLimit.success) {
    return { ok: false, message: getRateLimitErrorMessage() };
  }

  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });

  if (verifyError) {
    const ml = verifyError.message.toLowerCase();
    if (ml.includes("invalid login credentials") || ml.includes("invalid credentials")) {
      return { ok: false, message: "Current password is incorrect." };
    }
    console.error("[settings] password verification failed:", verifyError.message);
    return { ok: false, message: "Could not update your password. Please try again." };
  }

  const { error: updateError } = await supabase.auth.updateUser({
    password: newPassword,
  });

  if (updateError) {
    console.error("[settings] password update failed:", updateError.message);
    return { ok: false, message: "Could not update your password. Please try again." };
  }

  return { ok: true, message: "Password updated." };
}
