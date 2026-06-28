import { AppBrandHeader } from "@/components/layout/app-brand-header";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav";
import { GlobalSearch } from "@/components/ui/global-search";
import type { UserClub } from "@/lib/clubs/queries";

type AppShellProps = {
  clubs: UserClub[];
  children: React.ReactNode;
};

export async function AppShell({ children }: AppShellProps) {
  return (
    <div className="app-shell flex min-h-screen flex-row">
      <GlobalSearch />
      <AppSidebar />
      <div className="app-shell-main flex min-h-screen min-w-0 flex-1 flex-col">
        <AppBrandHeader />
        <main className="app-page-main flex-1 overflow-y-auto">{children}</main>
        <MobileBottomNav unreadNotificationCount={0} className="md:hidden" />
      </div>
    </div>
  );
}
