import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <section className="hidden flex-col justify-between bg-brand-700 p-12 text-white lg:flex">
        <div className="text-lg font-semibold">School ERP</div>
        <div>
          <h1 className="text-4xl font-bold leading-tight">One portal for the whole school.</h1>
          <p className="mt-4 max-w-md text-brand-100">
            Owners, principals, teachers, students and parents sign in here. Each person sees and manages exactly
            what sits below them.
          </p>
        </div>
        <ol className="flex flex-wrap gap-2 text-sm text-brand-100">
          {["Owner", "Principal", "Teacher", "Student", "Parent"].map((r, i) => (
            <li key={r} className="rounded-full bg-white/10 px-3 py-1">
              {i + 1}. {r}
            </li>
          ))}
        </ol>
      </section>
      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <h2 className="text-2xl font-semibold">Sign in</h2>
          <p className="mb-6 mt-1 text-sm text-slate-500">Use the account your school gave you.</p>
          <LoginForm />
          <p className="mt-6 text-center text-sm text-slate-500">
            New family? <a href="/apply" className="text-brand-600 hover:underline">Make an admission enquiry</a>
          </p>
        </div>
      </section>
    </main>
  );
}
