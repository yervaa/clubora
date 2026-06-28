import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { logoutAction } from "@/app/auth/actions";
import { createClient } from "@/lib/supabase/server";
import type { UserClub } from "@/lib/clubs/queries";
import { getRecentNotifications, getUnreadNotificationCount } from "@/lib/notifications/queries";
import { MobileNavDrawer } from "@/components/layout/mobile-nav-drawer";
import { NotificationBell } from "@/components/ui/notification-bell";
import { CluboraLogo } from "@/components/brand/clubora-logo";

type NavbarProps = {
  /** Passed from the authenticated app shell so mobile users can reach clubs without the desktop sidebar. */
  clubs?: UserClub[];
};

export async function Navbar({ clubs = [] }: NavbarProps) {
  noStore();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [notifications, unreadCount] = user
    ? await Promise.all([getRecentNotifications(10), getUnreadNotificationCount()])
    : [[], 0];

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/95 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-white/90">
      <nav className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between gap-2 px-2.5 sm:h-16 sm:gap-3 sm:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
          {user ? <MobileNavDrawer clubs={clubs} /> : null}
          <Link href={user ? "/dashboard" : "/"} className="flex min-w-0 shrink-0 items-center">
            <CluboraLogo variant="full" theme="dark" height={36} />
          </Link>
        </div>
        <ul className="flex flex-shrink-0 items-center gap-0.5 sm:gap-2">
          {user ? (
            <>
              <li>
                <NotificationBell unreadCount={unreadCount} notifications={notifications} />
              </li>
              <li className="hidden max-w-[14rem] truncate rounded-full border border-slate-200 bg-white px-3 py-1 text-sm text-slate-500 md:block">
                {user.email}
              </li>
              <li>
                <form action={logoutAction}>
                  <button
                    type="submit"
                    className="min-h-10 rounded-lg px-2.5 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 sm:min-h-0 sm:px-3"
                  >
                    Log out
                  </button>
                </form>
              </li>
            </>
          ) : (
            <>
              <li className="hidden sm:block">
                <Link
                  href="/discover"
                  className="rounded-md px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
                >
                  Discover Clubs
                </Link>
              </li>
              <li>
                <Link
                  href="/login"
                  className="inline-flex min-h-10 items-center rounded-md px-2.5 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 sm:min-h-0 sm:px-3"
                >
                  Log In
                </Link>
              </li>
              <li>
                <Link href="/signup" className="btn-primary min-h-10 px-3 py-2 text-sm sm:min-h-0 sm:px-4">
                  Sign Up
                </Link>
              </li>
            </>
          )}
        </ul>
      </nav>
    </header>
  );
}
