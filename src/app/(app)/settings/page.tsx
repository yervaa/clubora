import Link from "next/link";
import { NotificationSettingsForm } from "@/components/ui/notification-settings-form";
import { ProfileSettingsForm } from "@/components/ui/profile-settings-form";
import { CardSection, SectionHeader } from "@/components/ui/page-patterns";
import { getCurrentUserClubs } from "@/lib/clubs/queries";
import {
  NOTIFICATION_PREFERENCES_FORM_DEFAULTS,
  type NotificationPreferencesRow,
} from "@/lib/notifications/preference-model";
import { sanitizeInlineText } from "@/lib/sanitize";
import { createClient } from "@/lib/supabase/server";

export default async function SettingsPage() {
  const [clubs, supabase] = await Promise.all([getCurrentUserClubs(), createClient()]);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const manageableClubs = clubs.filter((club) => club.role === "officer");

  let notificationDefaults: Omit<NotificationPreferencesRow, "user_id"> = NOTIFICATION_PREFERENCES_FORM_DEFAULTS;
  let profileFullName = "";
  let profileEmail = user?.email ?? "";

  if (user) {
    const [{ data: prefRow }, { data: profileRow }] = await Promise.all([
      supabase.from("notification_preferences").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("profiles").select("full_name, email").eq("id", user.id).maybeSingle(),
    ]);

    if (prefRow) {
      const { user_id: _uid, ...rest } = prefRow as NotificationPreferencesRow;
      notificationDefaults = rest;
    }

    const metaName =
      typeof user.user_metadata?.full_name === "string"
        ? sanitizeInlineText(user.user_metadata.full_name).slice(0, 80)
        : "";
    profileFullName = profileRow?.full_name?.trim() || metaName;
    profileEmail = profileRow?.email?.trim() || user.email || "";
  }

  return (
    <>
      <h1 className="app-page-title">Settings</h1>
      <div className="page-sections">
      <CardSection>
        <SectionHeader
          title="Your account"
          description="Update how you appear in clubs and manage your sign-in password."
        />
        {user ? (
          <ProfileSettingsForm email={profileEmail} fullName={profileFullName} />
        ) : (
          <p className="mt-3 text-sm text-slate-600">Sign in to manage your profile.</p>
        )}
      </CardSection>

      <CardSection>
        <SectionHeader
          title="Alerts & email"
          description="Choose how ClubHub reaches you. Quiet hours only affect immediate emails, not in-app notifications."
        />
        {user ? (
          <div className="mt-4">
            <NotificationSettingsForm defaults={notificationDefaults} />
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-600">Sign in to manage notification preferences.</p>
        )}
      </CardSection>

      <CardSection>
        <SectionHeader
          title="Manage clubs"
          action={<span className="badge-soft">{manageableClubs.length}</span>}
        />
        {manageableClubs.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600">
            You currently do not have club management permissions.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {manageableClubs.map((club) => (
              <li key={club.id}>
                <Link
                  href={`/clubs/${club.id}/settings`}
                  className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2.5 text-sm transition hover:bg-slate-100"
                >
                  <span className="font-medium text-slate-900">{club.name}</span>
                  <span className="text-slate-500">Open</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardSection>
      </div>
    </>
  );
}
