import Link from "next/link";
import { AnnouncementComposerCollapsible } from "@/components/ui/announcement-composer-collapsible";
import { AnnouncementGenerator } from "@/components/ui/announcement-generator";
import { AnnouncementFeedItem } from "@/components/ui/announcement-feed-item";
import { ClubPageStickyActions } from "@/components/ui/club-page-sticky-actions";
import { PollOptionFields } from "@/components/ui/poll-option-fields";
import { ScrollToInputButton } from "@/components/ui/scroll-to-input-button";
import { createAnnouncementAction } from "@/app/(app)/clubs/actions";
import type { ClubDetail } from "@/lib/clubs/queries";
import { EmptyState } from "@/components/ui/empty-state";
import { CardSection, SectionHeader } from "@/components/ui/page-patterns";
import { PageIntro } from "@/components/ui/page-intro";
import { ActionFeedbackBanner } from "@/components/ui/action-feedback-banner";
import { FormDraftPersistence } from "@/components/ui/form-draft-persistence";

type ClubAnnouncementsPermissions = {
  canPostAnnouncements: boolean;
  canEditAnnouncements?: boolean;
  canDeleteAnnouncements?: boolean;
  /** Can expand “who read this” (officers + announcements.edit). */
  canViewReadersList?: boolean;
};

type ClubAnnouncementsSectionProps = {
  club: ClubDetail;
  permissions?: ClubAnnouncementsPermissions;
  query: {
    annError?: string;
    annSuccess?: string;
  };
};

export function ClubAnnouncementsSection({ club, query, permissions }: ClubAnnouncementsSectionProps) {
  const count = club.announcements.length;
  const latestAnnouncement = club.announcements[0] ?? null;
  const olderAnnouncements = club.announcements.slice(1);

  const legacyIsOfficer = club.currentUserRole === "officer";
  const canPostAnnouncements = permissions?.canPostAnnouncements ?? legacyIsOfficer;
  const canEditAnnouncements = permissions?.canEditAnnouncements ?? legacyIsOfficer;
  const canDeleteAnnouncements = permissions?.canDeleteAnnouncements ?? legacyIsOfficer;
  const canViewReadersList =
    permissions?.canViewReadersList ??
    ((permissions?.canEditAnnouncements ?? false) || legacyIsOfficer);

  const statsParts: string[] = [`${count} post${count === 1 ? "" : "s"}`];
  if (latestAnnouncement) {
    statsParts.push(`Latest: ${latestAnnouncement.title}`);
  }

  return (
    <section className={`page-sections ${canPostAnnouncements ? "pb-24 lg:pb-0" : ""}`}>
      <ClubPageStickyActions
        visible={canPostAnnouncements}
        href="#post-announcement"
        label="Post announcement"
      />

      <PageIntro
        title="Announcements"
        actions={<span className="badge-soft tabular-nums">{statsParts.join(" · ")}</span>}
      />

      {query.annSuccess ? (
        <ActionFeedbackBanner
          variant="success"
          title="Announcement saved"
          message={query.annSuccess}
          actions={
            <>
              <a href="#announcements" className="btn-secondary text-xs">
                View announcement feed
              </a>
              <Link href="/notifications" className="btn-secondary text-xs">
                Open inbox
              </Link>
            </>
          }
        />
      ) : null}
      {query.annError ? (
        <ActionFeedbackBanner
          variant="error"
          title="Announcement update failed"
          message={`${query.annError} Your draft is still here, so you can fix it and retry.`}
        />
      ) : null}

      {canPostAnnouncements && (
        <AnnouncementComposerCollapsible defaultOpen={count === 0}>
          <CardSection className="sm:p-6">
            <SectionHeader
              kicker="Compose"
              title="Post an update"
              description="Fast path: write a title and message, then publish. Advanced options stay optional."
            />

            <form id="create-announcement-form" action={createAnnouncementAction} className="mt-5 space-y-4">
              <input type="hidden" name="club_id" value={club.id} />
              <div>
                <label htmlFor="ann-title" className="mb-1.5 block text-sm font-medium text-slate-700">
                  Title *
                </label>
                <input
                  id="ann-title"
                  name="title"
                  type="text"
                  required
                  minLength={3}
                  maxLength={160}
                  className="input-control"
                  placeholder="e.g. Meeting room changed"
                  aria-describedby="ann-title-hint"
                />
                <p id="ann-title-hint" className="mt-1 text-xs text-slate-500">
                  Keep it short so members can scan it from notifications.
                </p>
              </div>
              <div>
                <label htmlFor="ann-content" className="mb-1.5 block text-sm font-medium text-slate-700">
                  Message *
                </label>
                <textarea
                  id="ann-content"
                  name="content"
                  rows={4}
                  required
                  className="textarea-control"
                  placeholder="What should members know right now?"
                  minLength={6}
                  maxLength={2000}
                  aria-describedby="ann-content-hint"
                />
                <p id="ann-content-hint" className="mt-1 text-xs text-slate-500">
                  Start with the key change first, then include details or next actions.
                </p>
              </div>

              <details className="rounded-xl border border-slate-200 bg-slate-50/60 open:bg-slate-50/80">
                <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-slate-900 [&::-webkit-details-marker]:hidden">
                  Optional announcement tools
                  <span className="ml-2 text-xs font-medium text-slate-500">Schedule, poll, attachments, AI draft</span>
                </summary>
                <div className="space-y-4 border-t border-slate-200 px-4 py-4">
                  <AnnouncementGenerator
                    titleSelector='input[name="title"]'
                    contentSelector='textarea[name="content"]'
                  />

                  <div>
                    <label htmlFor="ann-schedule" className="mb-1.5 block text-sm font-medium text-slate-700">
                      Schedule publish
                    </label>
                    <input
                      id="ann-schedule"
                      name="scheduled_for"
                      type="datetime-local"
                      className="input-control min-h-11 w-full sm:max-w-md"
                    />
                    <p className="mt-1 text-xs text-slate-500">Leave empty to publish now.</p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                      <input type="checkbox" name="is_urgent" />
                      Mark as urgent
                    </label>
                    <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                      <input type="checkbox" name="is_pinned" />
                      Pin when published
                    </label>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white/80 p-4">
                    <p className="text-sm font-semibold text-slate-900">Poll</p>
                    <p className="mt-0.5 text-xs text-slate-500">Add a question to collect quick member feedback.</p>
                    <div className="mt-3">
                      <label htmlFor="ann-poll-q" className="mb-1.5 block text-sm font-medium text-slate-700">
                        Poll question
                      </label>
                      <input
                        id="ann-poll-q"
                        name="poll_question"
                        type="text"
                        className="input-control"
                        placeholder="e.g. Which meeting time works best?"
                        maxLength={500}
                      />
                    </div>
                    <div className="mt-3">
                      <PollOptionFields />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="ann-files" className="mb-1.5 block text-sm font-medium text-slate-700">
                      Attachments
                    </label>
                    <input
                      id="ann-files"
                      name="attachments"
                      type="file"
                      multiple
                      accept="image/jpeg,image/png,image/gif,image/webp,application/pdf"
                      className="block w-full text-sm text-slate-600 file:mr-3 file:min-h-11 file:rounded-lg file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-slate-800"
                    />
                    <p className="mt-1 text-xs text-slate-500">Up to 5 files, 5 MB each (images or PDF).</p>
                  </div>
                </div>
              </details>

              <FormDraftPersistence
                formId="create-announcement-form"
                storageKey={`clubhub:draft:announcement:${club.id}`}
                fields={["title", "content", "scheduled_for", "poll_question", "is_urgent", "is_pinned"]}
                successSignal={query.annSuccess}
              />

              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="submit"
                  className="btn-primary w-full sm:w-auto"
                  name="announcement_intent"
                  value="publish_now"
                >
                  Publish now
                </button>
                <button
                  type="submit"
                  className="btn-secondary w-full sm:w-auto"
                  name="announcement_intent"
                  value="save_draft"
                >
                  Save as draft
                </button>
              </div>
            </form>
          </CardSection>
        </AnnouncementComposerCollapsible>
      )}

      {count === 0 ? (
        <div id="announcements">
          <EmptyState
            icon="ti-speakerphone"
            title="Nothing posted yet"
            description={
              canPostAnnouncements
                ? "Share the first update so members know what's going on."
                : "Officers haven't posted anything here yet."
            }
            action={
              canPostAnnouncements
                ? { label: "Post announcement", href: "#post-announcement" }
                : undefined
            }
          />
        </div>
      ) : (
        <div className="space-y-4" id="announcements">
          {latestAnnouncement ? (
            <AnnouncementFeedItem
              clubId={club.id}
              announcement={latestAnnouncement}
              canOpenReadersList={canViewReadersList}
              canEditAnnouncement={canEditAnnouncements}
              canDeleteAnnouncement={canDeleteAnnouncements}
              variant="featured"
            />
          ) : null}

          {olderAnnouncements.length > 0 && (
            <CardSection>
              <SectionHeader
                kicker="History"
                title="Older posts"
                action={<span className="badge-soft">{olderAnnouncements.length}</span>}
              />
              <div className="mt-3 divide-y divide-slate-100 sm:mt-4 sm:flex sm:flex-col sm:gap-3 sm:divide-y-0">
                {olderAnnouncements.map((announcement) => (
                  <AnnouncementFeedItem
                    key={announcement.id}
                    clubId={club.id}
                    announcement={announcement}
                    canOpenReadersList={canViewReadersList}
                    canEditAnnouncement={canEditAnnouncements}
                    canDeleteAnnouncement={canDeleteAnnouncements}
                    variant="compact"
                  />
                ))}
              </div>
            </CardSection>
          )}
        </div>
      )}
    </section>
  );
}
