import Link from "next/link";
import { MyClubsGrid } from "@/components/ui/my-clubs-grid";
import { PageEmptyState } from "@/components/ui/page-patterns";
import { getCurrentUserClubs } from "@/lib/clubs/queries";

export default async function MyClubsPage() {
  const clubs = await getCurrentUserClubs();

  return (
    <>
      <h1 className="app-page-title">My clubs</h1>
      <div className="page-sections">
        {clubs.length === 0 ? (
          <PageEmptyState
            title="Your club list is empty"
            copy="Join with an invite code to jump into a live workspace, or start your own club to organize events, announcements, and members."
            action={
              <Link href="/clubs/join" className="btn-primary">
                Join your first club
              </Link>
            }
          />
        ) : (
          <MyClubsGrid clubs={clubs} />
        )}
      </div>
    </>
  );
}
