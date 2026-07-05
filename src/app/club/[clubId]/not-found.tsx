import Link from "next/link";
import { Navbar } from "@/components/layout/navbar";

export default function PublicClubNotFound() {
  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <main className="page-shell" id="main-content">
        <div className="mx-auto max-w-lg rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Club link</p>
          <h1 className="mt-2 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">We could not find that club</h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            This club link is not valid. The club may be unavailable, no longer listed, or the link may be mistyped.
          </p>
          <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-slate-600">
            <li>Check the link you were sent for typos.</li>
            <li>Ask an officer for an updated invite or join code.</li>
          </ul>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link href="/login" className="btn-primary inline-flex min-h-11 items-center justify-center px-5 text-center text-sm font-semibold">
              Log in
            </Link>
            <Link href="/signup" className="btn-secondary inline-flex min-h-11 items-center justify-center px-5 text-center text-sm font-semibold">
              Create account
            </Link>
          </div>
          <p className="mt-6 text-center text-xs text-slate-500">
            <Link href="/" className="font-medium text-indigo-700 underline-offset-2 hover:underline">
              Clubora home
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
