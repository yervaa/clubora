import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";
import { loginAction } from "@/app/auth/actions";
import { getSafeNextPath } from "@/lib/auth/redirects";
import { createClient } from "@/lib/supabase/server";
import { Navbar } from "@/components/layout/navbar";

type LoginPageProps = {
  searchParams: Promise<{ error?: string; message?: string; next?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  noStore();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const params = await searchParams;
  const nextPath = getSafeNextPath(params.next);

  if (user) {
    redirect(nextPath);
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <main className="page-shell">
        <div className="card-surface max-w-lg p-8 sm:p-9">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Welcome Back</p>
          <h1 className="section-title mt-2">Login</h1>
          <p className="section-subtitle">Access your Clubora dashboard.</p>

          {params.message ? <p className="alert-success mt-6">{params.message}</p> : null}
          {params.error ? <p className="alert-error mt-4">{params.error}</p> : null}

          <form action={loginAction} className="mt-7 space-y-4">
            <input type="hidden" name="next" value={nextPath} />
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-slate-700">
                Email
              </label>
              <input id="email" name="email" type="email" required className="input-control" placeholder="you@school.edu" />
            </div>
            <div>
              <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-slate-700">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                className="input-control"
                placeholder="Enter your password"
              />
            </div>
            <button type="submit" className="btn-primary w-full">
              Log in
            </button>
          </form>

          <p className="mt-6 text-sm text-slate-600">
            Just exploring?{" "}
            <Link href="/" className="font-semibold text-slate-900 hover:text-slate-700">
              Try the demo with one click
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
