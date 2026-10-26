import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";
import { Navbar } from "@/components/layout/navbar";
import { getSafeNextPath } from "@/lib/auth/redirects";
import { createClient } from "@/lib/supabase/server";

type JoinPageProps = {
  searchParams: Promise<{
    code?: string;
    error?: string;
    success?: string;
    clubId?: string;
    pending?: string;
  }>;
};

export default async function JoinPage({ searchParams }: JoinPageProps) {
  noStore();

  const params = await searchParams;
  const joinCode = typeof params.code === "string" ? params.code.toUpperCase() : "";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const next = new URLSearchParams();
    if (params.code) next.set("code", params.code);
    if (params.error) next.set("error", params.error);
    if (params.success) next.set("success", params.success);
    if (params.clubId) next.set("clubId", params.clubId);
    if (params.pending) next.set("pending", params.pending);
    redirect(`/clubs/join${next.size ? `?${next.toString()}` : ""}`);
  }

  const nextPath = getSafeNextPath(joinCode ? `/join?code=${encodeURIComponent(joinCode)}` : "/join");

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <main className="page-shell">
        <section className="space-y-6">
          <div className="card-surface max-w-2xl p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Join a club</p>
            <h1 className="section-title mt-2">You&apos;re invited</h1>
            <p className="section-subtitle">
              Sign in or create an account, then enter the join code (or use the link again after you&apos;re logged in).
            </p>

            {joinCode ? (
              <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-5">
                <p className="text-sm font-medium text-slate-700">Join code</p>
                <p className="mt-2 text-2xl font-bold tracking-[0.2em] text-slate-900">{joinCode}</p>
                <p className="mt-2 text-xs text-slate-500">
                  If this club requires approval, you&apos;ll submit a request after you sign in — not an instant join.
                </p>
              </div>
            ) : null}

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Link href={`/login?next=${encodeURIComponent(nextPath)}`} className="btn-primary text-center">
                Log in to continue
              </Link>
              <Link href="/" className="btn-secondary text-center">
                Try the demo
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
