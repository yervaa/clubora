"use client";

import { CopyJoinCodeButton } from "@/components/ui/copy-join-code-button";
import { CopyInviteLinkButton } from "@/components/ui/copy-invite-link-button";
import { CopyPublicClubPageButton } from "@/components/ui/copy-public-club-page-button";

type MemberInviteProps = {
  clubId: string;
  joinCode: string;
  membersCount: number;
  requireJoinApproval?: boolean;
};

export function MemberInvite({ clubId, joinCode, membersCount, requireJoinApproval = false }: MemberInviteProps) {
  const isLowMembers = membersCount <= 5;

  return (
    <div className="card-surface p-6">
      <div className="section-card-header">
        <div>
          <p className="section-kicker">Invite</p>
          <h3 className="mt-1 text-base font-semibold tracking-tight text-slate-900">Invite members</h3>
          <p className="mt-1 text-sm text-slate-600">
            Fastest path: copy the invite link and share it in chat.
          </p>
          {requireJoinApproval ? (
            <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50/90 px-3 py-2 text-xs font-medium text-amber-950">
              <strong>Approval required:</strong> invitees submit a request first. They are added only after officer approval.
            </p>
          ) : null}
        </div>
        {isLowMembers && (
          <span className="feedback-pill feedback-pill-fresh">Let&apos;s grow</span>
        )}
      </div>

      <div className="mt-5 space-y-4">
        <div className="rounded-xl border border-slate-200 bg-gradient-to-b from-slate-50 to-white p-4 shadow-inner">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Recommended</p>
          <p className="mt-1 text-sm text-slate-700">Share one link. Students can sign in and request to join in one step.</p>
          <div className="mt-3">
            <CopyInviteLinkButton joinCode={joinCode} className="btn-primary w-full sm:w-auto">
              Copy invite link
            </CopyInviteLinkButton>
          </div>
        </div>

        <details className="rounded-xl border border-slate-200 bg-slate-50/60 open:bg-slate-50/80">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-slate-900 [&::-webkit-details-marker]:hidden">
            More invite options
            <span className="ml-2 text-xs font-medium text-slate-500">Join code and public club page</span>
          </summary>
          <div className="space-y-4 border-t border-slate-200 px-4 py-4">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Join code</p>
              <div className="rounded-xl border border-slate-200 bg-white px-6 py-5 text-center shadow-inner">
                <p className="font-mono text-3xl font-bold tracking-[0.22em] text-slate-900 select-all">
                  {joinCode}
                </p>
              </div>
            </div>

            <fieldset className="min-w-0 border-0 p-0">
              <legend className="mb-2 w-full text-xs font-semibold uppercase tracking-wide text-slate-500">Copy for sharing</legend>
              <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap">
                <CopyJoinCodeButton joinCode={joinCode} className="btn-secondary flex-1 min-w-[10rem]" />
                <CopyPublicClubPageButton clubId={clubId} className="btn-secondary flex-1 min-w-[10rem]" />
              </div>
            </fieldset>
          </div>
        </details>

        {isLowMembers && (
          <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <strong className="text-slate-900">Tip:</strong> Start with classmates already in your chat group, then share
            the public page for broader recruiting.
          </p>
        )}
      </div>
    </div>
  );
}
