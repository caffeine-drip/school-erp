import Link from "next/link";
import { submitEnquiry } from "@/app/actions/operations";
import { ActionForm } from "@/components/ActionForm";
import { EnquiryFields } from "@/components/EnquiryFields";
import { SubmitButton } from "@/components/SubmitButton";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function ApplyPage({ searchParams }: { searchParams: Promise<{ school?: string }> }) {
  const schoolParam = (await searchParams).school;
  const all = await db.school.findMany({ orderBy: { name: "asc" } });
  const schools = all.filter((s) => !schoolParam || s.id === schoolParam);

  return (
    <main className="mx-auto max-w-2xl p-6">
      <div className="mb-6">
        <div className="text-sm font-bold text-brand-700">School ERP</div>
        <h1 className="mt-2 text-3xl font-semibold">Admission enquiry</h1>
        <p className="mt-1 text-sm text-slate-500">Tell us about your child and the school will get back to you.</p>
      </div>
      <section className="card">
        {schools.length === 0 ? (
          <p className="text-sm text-slate-500">Admissions are not open yet.</p>
        ) : (
          <ActionForm action={submitEnquiry} className="space-y-3">
            <EnquiryFields schools={schools} />
            <SubmitButton>Send enquiry</SubmitButton>
          </ActionForm>
        )}
      </section>
      <p className="mt-4 text-center text-sm text-slate-500">
        Already at the school? <Link href="/login" className="text-brand-600 hover:underline">Sign in</Link>
      </p>
    </main>
  );
}
