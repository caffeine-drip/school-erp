import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { saveExamMarks } from "@/app/actions/academics";
import { ActionForm } from "@/components/ActionForm";
import { SubmitButton } from "@/components/SubmitButton";
import { Badge, Empty, PageHeader } from "@/components/ui";
import { canAccessSchool, visibleClassesWhere, visibleStudentsWhere } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isStaff } from "@/lib/roles";

export default async function ExamPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ subject?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const subjectParam = (await searchParams).subject;
  const exam = await db.exam.findUnique({ where: { id } });
  if (!exam || !canAccessSchool(user, exam.schoolId) || (!isStaff(user.role) && !exam.published)) notFound();

  if (!isStaff(user.role)) {
    const students = await db.user.findMany({ where: visibleStudentsWhere(user), orderBy: { name: "asc" } });
    if (students.length === 1) redirect(`/exams/${exam.id}/report/${students[0].id}`);
    return (
      <>
        <PageHeader title={exam.name} subtitle={exam.term} />
        <section className="card">
          <ul className="divide-y divide-slate-100">
            {students.map((s) => (
              <li key={s.id} className="flex items-center justify-between py-2">
                <span className="font-medium">{s.name}</span>
                <Link href={`/exams/${exam.id}/report/${s.id}`} className="btn-ghost">Report card</Link>
              </li>
            ))}
          </ul>
        </section>
      </>
    );
  }

  // Teachers see subjects they teach, plus every subject in classes where they are class teacher.
  const subjects = await db.subject.findMany({
    where: {
      classRoom: { ...visibleClassesWhere(user), schoolId: exam.schoolId },
      ...(user.role === "TEACHER" ? { OR: [{ teacherId: user.id }, { classRoom: { teacherId: user.id } }] } : {}),
    },
    include: { classRoom: true, _count: { select: { examMarks: { where: { examId: exam.id } } } } },
    orderBy: [{ classRoom: { name: "asc" } }, { name: "asc" }],
  });
  const subject = subjects.find((s) => s.id === subjectParam);
  const students = subject
    ? await db.user.findMany({
        where: { classId: subject.classId, role: "STUDENT" },
        include: { examMarks: { where: { examId: exam.id, subjectId: subject.id } } },
        orderBy: [{ rollNo: "asc" }, { name: "asc" }],
      })
    : [];
  const reportClasses = await db.classRoom.findMany({
    where: { ...(user.role === "TEACHER" ? { teacherId: user.id } : {}), schoolId: exam.schoolId },
    include: { students: { orderBy: [{ rollNo: "asc" }, { name: "asc" }] } },
    orderBy: [{ name: "asc" }, { section: "asc" }],
  });

  return (
    <>
      <div className="mb-2 text-sm">
        <Link href="/exams" className="text-brand-600 hover:underline">← All exams</Link>
      </div>
      <PageHeader title={exam.name} subtitle={exam.term}>
        {exam.published ? <Badge tone="green">Published</Badge> : <Badge tone="slate">Draft: students and parents can't see it yet</Badge>}
      </PageHeader>
      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card h-fit">
          <h2 className="mb-3 font-semibold">Enter marks</h2>
          {subjects.length === 0 ? (
            <Empty>No subjects to mark. Subjects are set up on each class page.</Empty>
          ) : (
            <ul className="space-y-1 text-sm">
              {subjects.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/exams/${exam.id}?subject=${s.id}`}
                    className={`flex justify-between rounded-lg px-3 py-2 ${s.id === subject?.id ? "bg-brand-50 text-brand-700" : "hover:bg-slate-100"}`}
                  >
                    <span>{s.classRoom.name}-{s.classRoom.section} · {s.name}</span>
                    <span className="text-slate-500">{s._count.examMarks}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card overflow-x-auto lg:col-span-2">
          {!subject ? (
            <Empty>Pick a subject on the left to enter marks.</Empty>
          ) : (
            <ActionForm action={saveExamMarks} className="space-y-3">
              <h2 className="font-semibold">{subject.classRoom.name}-{subject.classRoom.section} · {subject.name}</h2>
              <input type="hidden" name="examId" value={exam.id} />
              <input type="hidden" name="subjectId" value={subject.id} />
              <div className="w-32">
                <label className="label">Max marks</label>
                <input name="maxScore" type="number" step="any" min={1} defaultValue={students.find((s) => s.examMarks[0])?.examMarks[0].maxScore ?? 100} required className="input" />
              </div>
              <table className="table">
                <thead>
                  <tr><th>#</th><th>Student</th><th>Marks</th></tr>
                </thead>
                <tbody>
                  {students.map((s) => (
                    <tr key={s.id}>
                      <td className="text-slate-500">{s.rollNo}</td>
                      <td>{s.name}</td>
                      <td>
                        <input name={`score_${s.id}`} type="number" step="any" min={0} defaultValue={s.examMarks[0]?.score ?? ""} className="input w-24 py-1" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <SubmitButton>Save marks</SubmitButton>
            </ActionForm>
          )}
        </section>
      </div>
      {reportClasses.length > 0 && (
        <section className="card mt-6">
          <h2 className="mb-3 font-semibold">Report cards</h2>
          <div className="space-y-4">
            {reportClasses.map((c) => (
              <div key={c.id}>
                <div className="mb-2 text-sm font-medium text-slate-500">{c.name}-{c.section}</div>
                <div className="flex flex-wrap gap-2">
                  {c.students.length === 0 && <span className="text-sm text-slate-400">No students</span>}
                  {c.students.map((s) => (
                    <Link key={s.id} href={`/exams/${exam.id}/report/${s.id}`} className="btn-ghost">{s.name}</Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
