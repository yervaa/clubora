import Link from "next/link";
import { redirect } from "next/navigation";
import { CluboraLogo } from "@/components/brand/clubora-logo";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-8 flex justify-center">
          <CluboraLogo variant="full" theme="dark" height={48} />
        </div>
        <p className="mt-4 text-base leading-7 text-slate-600">
          One place to run your school clubs — announcements, events, and members in a clean workspace.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link href="/discover" className="btn-secondary px-8 py-3 text-base">
            Browse Clubs
          </Link>
          <Link href="/signup" className="btn-primary px-8 py-3 text-base">
            Get Started
          </Link>
          <Link href="/login" className="btn-secondary px-8 py-3 text-base">
            Log In
          </Link>
        </div>
      </div>
    </div>
  );
}
