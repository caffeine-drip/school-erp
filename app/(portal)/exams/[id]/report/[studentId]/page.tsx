import Link from "next/link";
import { notFound } from "next/navigation";
import { saveRemark } from "@/app/actions/academics";
import { ActionForm } from "@/components/ActionForm";
import { PrintButton } from "@/components/PrintButton";
import { SubmitButton } from "@/components/SubmitButton";
import { canAccessSchool, canSeeStudent } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { gradeFor, percent } from "@/lib/grading";
import { attendanceRate } from "@/lib/queries";
import { isStaff } from "@/lib/roles";

export default async function ReportCard({ params }: { params: Promise<{ id: string; studentId: string }> }) {
  const user = await requireUser();
  const { id, studentId } = await params;
  const [exam, student] = await Promise.all([
    db.exam.findUnique({ where: { id }, include: { school: true } }),
    db.user.findUnique({
      where: { id: studentId },
      include: {
        classRoom: { include: { teacher: true, subjects: { orderBy: { name: "asc" } } } },
        parents: { include: { parent: true } },
      },
    }),
  ]);
  if (!exam || !student || !canAccessSchool(user, exam.schoolId) || !(await canSeeStudent(user, studentId))) notFound();
  if (!isStaff(user.role) && !exam.published) notFound();

  const [marks, remark, attendance] = await Promise.all([
    db.examMark.findMany({ where: { examId: exam.id, studentId }, include: { subject: true } }),
    db.examRemark.findUnique({ where: { examId_studentId: { examId: exam.id, studentId } } }),
    attendanceRate([studentId]),
  ]);
  const subjects = student.classRoom?.subjects ?? [];
  const rows = subjects.map((s) => ({ subject: s.name, mark: marks.find((m) => m.subjectId === s.id) }));
  const scored = rows.filter((r) => r.mark);
  const total = scored.reduce((n, r) => n + r.mark!.score, 0);
  const max = scored.reduce((n, r) => n + r.mark!.maxScore, 0);
  const overall = percent(total, max);
  const canRemark = user.role === "OWNER" || user.role === "PRINCIPAL" || student.classRoom?.teacherId === user.id;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link href={`/exams/${exam.id}`} className="text-sm text-brand-600 hover:underline">← {exam.name}</Link>
        <PrintButton label="Print report card" />
      </div>
      <article className="card space-y-6 print:border-0 print:shadow-none">
        <header className="border-b border-slate-200 pb-4 text-center">
          <div className="text-xl font-bold">{exam.school.name}</div>
          {exam.school.address && <div className="text-sm text-slate-500">{exam.school.address}</div>}
          <div className="mt-2 text-sm font-semibold uppercase tracking-wide text-brand-700">Report card · {exam.name} · {exam.term}</div>
        </header>
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Item label="Student" value={student.name} />
          <Item label="Class" value={student.classRoom ? `${student.classRoom.name}-${student.classRoom.section}` : "—"} />
          <Item label="Roll no." value={student.rollNo ?? "—"} />
          <Item label="Parent" value={student.parents.map((p) => p.parent.name).join(", ") || "—"} />
        </dl>
        {rows.length === 0 ? (
          <p className="text-sm text-slate-500">This class has no subjects set up.</p>
        ) : (
          <table className="table">
            <thead>
              <tr><th>Subject</th><th className="text-right">Marks</th><th className="text-right">Max</th><th className="text-right">%</th><th className="text-right">Grade</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const p = r.mark ? percent(r.mark.score, r.mark.maxScore) : null;
                return (
                  <tr key={r.subject}>
                    <td>{r.subject}</td>
                    <td className="text-right">{r.mark?.score ?? "—"}</td>
                    <td className="text-right">{r.mark?.maxScore ?? "—"}</td>
                    <td className="text-right">{p ?? "—"}</td>
                    <td className="text-right font-semibold">{p === null ? "—" : gradeFor(p)}</td>
                  </tr>
                );
              })}
              <tr className="font-semibold">
                <td>Total</td>
                <td className="text-right">{total}</td>
                <td className="text-right">{max}</td>
                <td className="text-right">{max ? overall : "—"}</td>
                <td className="text-right">{max ? gradeFor(overall) : "—"}</td>
              </tr>
            </tbody>
          </table>
        )}
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <Item label="Attendance" value={attendance === null ? "—" : `${attendance}%`} />
          <Item label="Class teacher" value={student.classRoom?.teacher?.name ?? "—"} />
        </dl>
        <div>
          <div className="label">Class teacher's remark</div>
          {canRemark ? (
            <ActionForm action={saveRemark} className="space-y-2 print:hidden">
              <input type="hidden" name="examId" value={exam.id} />
              <input type="hidden" name="studentId" value={student.id} />
              <textarea name="remark" rows={2} defaultValue={remark?.remark} className="input" />
              <SubmitButton className="btn-ghost">Save remark</SubmitButton>
            </ActionForm>
          ) : null}
          <p className={`text-sm ${canRemark ? "hidden print:block" : ""}`}>{remark?.remark ?? "—"}</p>
        </div>
        <p className="text-xs text-slate-400">Grades: A1 91–100, A2 81–90, B1 71–80, B2 61–70, C1 51–60, C2 41–50, D 33–40, E below 33.</p>
      </article>
    </div>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
