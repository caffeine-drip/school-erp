import Link from "next/link";
import { createExam, setExamPublished } from "@/app/actions/academics";
import { ActionForm } from "@/components/ActionForm";
import { SchoolSelect } from "@/components/SchoolSelect";
import { SubmitButton } from "@/components/SubmitButton";
import { Badge, Empty, PageHeader, formatDate } from "@/components/ui";
import { schoolIds } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { schoolsFor } from "@/lib/queries";
import { isStaff } from "@/lib/roles";

export default async function ExamsPage() {
  const user = await requireUser();
  const staff = isStaff(user.role);
  const manage = user.role === "OWNER" || user.role === "PRINCIPAL";
  const [exams, schools] = await Promise.all([
    db.exam.findMany({
      where: { schoolId: { in: schoolIds(user) }, ...(staff ? {} : { published: true }) },
      include: { school: { select: { name: true } }, _count: { select: { marks: true } } },
      orderBy: { createdAt: "desc" },
    }),
    manage ? schoolsFor(user) : Promise.resolve([]),
  ]);

  return (
    <>
      <PageHeader
        title="Exams & report cards"
        subtitle={staff ? "Teachers enter marks per subject. Publish an exam to show report cards to students and parents." : "Published report cards."}
      />
      <div className={`grid gap-6 ${manage ? "lg:grid-cols-3" : ""}`}>
        <section className="card overflow-x-auto lg:col-span-2">
          {exams.length === 0 ? (
            <Empty>{staff ? "No exams yet." : "No results published yet."}</Empty>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Exam</th>
                  <th>Term</th>
                  {staff && <th>Marks entered</th>}
                  <th>Status</th>
                  {manage && <th />}
                </tr>
              </thead>
              <tbody>
                {exams.map((e) => (
                  <tr key={e.id}>
                    <td>
                      <Link href={`/exams/${e.id}`} className="font-medium text-brand-700 hover:underline">{e.name}</Link>
                      <div className="text-xs text-slate-500">{schools.length > 1 ? `${e.school.name} · ` : ""}{formatDate(e.createdAt)}</div>
                    </td>
                    <td>{e.term}</td>
                    {staff && <td>{e._count.marks}</td>}
                    <td>{e.published ? <Badge tone="green">Published</Badge> : <Badge tone="slate">Draft</Badge>}</td>
                    {manage && (
                      <td className="text-right">
                        <form action={setExamPublished.bind(null, e.id, !e.published)}>
                          <button className={e.published ? "btn-ghost" : "btn"}>{e.published ? "Unpublish" : "Publish"}</button>
                        </form>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        {manage && (
          <section className="card h-fit">
            <h2 className="mb-3 font-semibold">Create an exam</h2>
            <ActionForm action={createExam} className="space-y-3">
              <SchoolSelect schools={schools} />
              <div>
                <label className="label">Name</label>
                <input name="name" required placeholder="Half-yearly examination" className="input" />
              </div>
              <div>
                <label className="label">Term</label>
                <input name="term" required placeholder="Term 1, 2026-27" className="input" />
              </div>
              <SubmitButton>Create exam</SubmitButton>
            </ActionForm>
          </section>
        )}
      </div>
    </>
  );
}
