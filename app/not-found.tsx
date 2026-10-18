import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="text-sm text-slate-500">It doesn't exist, or your account can't see it.</p>
      <Link href="/dashboard" className="btn">Back to dashboard</Link>
    </main>
  );
}
