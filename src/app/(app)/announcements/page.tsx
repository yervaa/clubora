import { GlobalAnnouncementsList } from "@/components/ui/global-announcements-list";
import { EmptyState } from "@/components/ui/empty-state";
import { getDashboardData } from "@/lib/clubs/queries";

export default async function AnnouncementsPage() {
  const { recentAnnouncements } = await getDashboardData();

  return (
    <>
      <h1 className="app-page-title">Announcements</h1>
      <div className="page-sections">
        {recentAnnouncements.length === 0 ? (
          <EmptyState
            icon="ti-speakerphone"
            title="All quiet here"
            description="No announcements from your clubs yet."
          />
        ) : (
          <GlobalAnnouncementsList announcements={recentAnnouncements} />
        )}
      </div>
    </>
  );
}
