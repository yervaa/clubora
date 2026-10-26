import Link from "next/link";
import { redirect } from "next/navigation";
import { demoSignInAction } from "@/app/auth/actions";
import { CluboraLogo } from "@/components/brand/clubora-logo";
import { createClient } from "@/lib/supabase/server";

type HomeProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function Home({ searchParams }: HomeProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  }

  const params = await searchParams;

  return (
    <div className="flex min-h-[calc(100vh-2.5rem)] flex-col items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-8 flex justify-center">
          <CluboraLogo variant="full" theme="dark" height={48} />
        </div>
        <p className="mt-4 text-base leading-7 text-slate-600">
          One place to run your school clubs — announcements, events, and members in a clean workspace.
        </p>
        <p className="mt-3 text-sm text-slate-500">
          Explore with a shared demo account. No signup needed.
        </p>

        {params.error ? <p className="alert-error mt-6 text-left">{params.error}</p> : null}

        <form action={demoSignInAction} className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button type="submit" name="role" value="officer" className="btn-primary px-8 py-3 text-base">
            Try as officer
          </button>
          <button type="submit" name="role" value="member" className="btn-secondary px-8 py-3 text-base">
            Try as member
          </button>
        </form>

        <Link
          href="/discover"
          className="mt-6 inline-block text-sm font-medium text-slate-600 underline-offset-2 hover:text-slate-900 hover:underline"
        >
          Browse clubs
        </Link>
      </div>
    </div>
  );
}
