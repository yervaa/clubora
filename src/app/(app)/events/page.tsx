import { EventSummaryListLink } from "@/components/ui/event-summary";
import { EmptyState } from "@/components/ui/empty-state";
import { getDashboardData } from "@/lib/clubs/queries";

export default async function EventsPage() {
  const { upcomingEvents } = await getDashboardData();

  return (
    <>
      <h1 className="app-page-title">Events</h1>
      <div className="page-sections">
        {upcomingEvents.length === 0 ? (
          <EmptyState
            icon="ti-calendar-event"
            title="Nothing coming up"
            description="Your clubs haven't scheduled anything yet. Check back soon."
          />
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200/95 bg-white shadow-[0_1px_2px_rgb(15_23_42/0.04)]">
            {upcomingEvents.map((event) => (
              <div key={event.id} className="border-b border-slate-100 last:border-b-0">
                <EventSummaryListLink
                  href={`/clubs/${event.clubId}/events`}
                  title={event.title}
                  clubName={event.clubName}
                  eventType={event.eventType}
                  at={event.eventDateRaw}
                  location={event.location}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
