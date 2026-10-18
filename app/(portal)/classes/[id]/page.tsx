import Link from "next/link";
import { notFound } from "next/navigation";
import { saveAttendance, saveGrades } from "@/app/actions/manage";
import { ActionForm } from "@/components/ActionForm";
import { SubmitButton } from "@/components/SubmitButton";
import { Empty, PageHeader } from "@/components/ui";
import { canAccessSchool } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { todayUTC } from "@/lib/queries";

export default async function ClassPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const user = await requireUser(["OWNER", "PRINCIPAL", "TEACHER"]);
  const { id } = await params;
  const dateParam = (await searchParams).date;
  const date = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? new Date(dateParam) : todayUTC();
  const dateStr = date.toISOString().slice(0, 10);

  const cls = await db.classRoom.findUnique({
    where: { id },
    include: {
      school: true,
      teacher: true,
      students: {
        orderBy: [{ rollNo: "asc" }, { name: "asc" }],
        include: { attendance: { where: { date } }, parents: { include: { parent: { select: { name: true, phone: true } } } } },
      },
    },
  });
  if (!cls || !canAccessSchool(user, cls.schoolId)) notFound();
  if (user.role === "TEACHER" && cls.teacherId !== user.id) notFound();

  return (
    <>
      <div className="mb-2 text-sm">
        <Link href="/classes" className="text-brand-600 hover:underline">← All classes</Link>
      </div>
      <PageHeader
        title={`Class ${cls.name}-${cls.section}`}
        subtitle={`${cls.school.name} · Class teacher: ${cls.teacher?.name ?? "not assigned"} · ${cls.students.length} students`}
      />

      {cls.students.length === 0 ? (
        <div className="card"><Empty>No students in this class yet. Add them from the Students page.</Empty></div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="card overflow-x-auto">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">Attendance</h2>
              <form className="flex gap-2">
                <input type="date" name="date" defaultValue={dateStr} className="input py-1" />
                <button className="btn-ghost">Go</button>
              </form>
            </div>
            <ActionForm action={saveAttendance} className="space-y-3">
              <input type="hidden" name="classId" value={cls.id} />
              <input type="hidden" name="date" value={dateStr} />
              <table className="table">
                <thead>
                  <tr><th>#</th><th>Student</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {cls.students.map((s) => {
                    const current = s.attendance[0]?.status ?? "PRESENT";
                    return (
                      <tr key={s.id}>
                        <td className="text-slate-500">{s.rollNo}</td>
                        <td>
                          <Link href={`/people/student/${s.id}`} className="hover:underline">{s.name}</Link>
                          {!s.attendance[0] && <span className="ml-1 text-xs text-slate-400">(not marked)</span>}
                        </td>
                        <td>
                          <div className="flex gap-3 text-sm">
                            {(["PRESENT", "ABSENT", "LATE"] as const).map((st) => (
                              <label key={st} className="flex items-center gap-1">
                                <input type="radio" name={`status_${s.id}`} value={st} defaultChecked={current === st} />
                                {st[0] + st.slice(1).toLowerCase()}
                              </label>
                            ))}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <SubmitButton>Save attendance for {dateStr}</SubmitButton>
            </ActionForm>
          </section>

          <section className="card overflow-x-auto">
            <h2 className="mb-3 font-semibold">Enter marks</h2>
            <ActionForm action={saveGrades} className="space-y-3">
              <input type="hidden" name="classId" value={cls.id} />
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="label">Subject</label>
                  <input name="subject" required placeholder="Maths" className="input" />
                </div>
                <div>
                  <label className="label">Exam</label>
                  <input name="exam" required placeholder="Unit test 1" className="input" />
                </div>
                <div>
                  <label className="label">Out of</label>
                  <input name="maxScore" type="number" step="any" defaultValue={100} required className="input" />
                </div>
              </div>
              <table className="table">
                <thead>
                  <tr><th>#</th><th>Student</th><th>Score</th></tr>
                </thead>
                <tbody>
                  {cls.students.map((s) => (
                    <tr key={s.id}>
                      <td className="text-slate-500">{s.rollNo}</td>
                      <td>{s.name}</td>
                      <td><input name={`score_${s.id}`} type="number" step="any" min={0} className="input w-24 py-1" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <SubmitButton>Save marks</SubmitButton>
            </ActionForm>
          </section>
        </div>
      )}
    </>
  );
}
