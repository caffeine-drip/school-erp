import { deleteGrade } from "@/app/actions/manage";
import { Empty, PageHeader, formatDate } from "@/components/ui";
import { visibleStudentsWhere } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isStaff } from "@/lib/roles";

export default async function GradesPage({ searchParams }: { searchParams: Promise<{ student?: string; subject?: string }> }) {
  const user = await requireUser();
  const { student, subject } = await searchParams;
  const students = await db.user.findMany({ where: visibleStudentsWhere(user), select: { id: true, name: true }, orderBy: { name: "asc" } });
  const ids = students.map((s) => s.id);

  const grades = await db.grade.findMany({
    where: {
      studentId: student && ids.includes(student) ? student : { in: ids },
      ...(subject ? { subject: { equals: subject, mode: "insensitive" } } : {}),
    },
    include: { student: { select: { name: true } }, gradedBy: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const staff = isStaff(user.role);

  return (
    <>
      <PageHeader title="Grades" subtitle={staff ? "Enter new marks from a class page." : "Marks recorded by teachers."}>
        {students.length > 1 && (
          <form className="flex gap-2">
            <select name="student" defaultValue={student ?? ""} className="input py-1">
              <option value="">All students</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <input name="subject" defaultValue={subject} placeholder="Subject" className="input w-32 py-1" />
            <button className="btn-ghost">Filter</button>
          </form>
        )}
      </PageHeader>
      <section className="card overflow-x-auto">
        {grades.length === 0 ? (
          <Empty>No marks yet.</Empty>
        ) : (
          <table className="table">
            <thead>
              <tr>
                {students.length > 1 && <th>Student</th>}
                <th>Subject</th><th>Exam</th><th>Score</th><th>%</th><th>By</th><th>Date</th>
                {staff && <th />}
              </tr>
            </thead>
            <tbody>
              {grades.map((g) => (
                <tr key={g.id}>
                  {students.length > 1 && <td>{g.student.name}</td>}
                  <td>{g.subject}</td>
                  <td>{g.exam}</td>
                  <td>{g.score} / {g.maxScore}</td>
                  <td>{Math.round((g.score / g.maxScore) * 100)}%</td>
                  <td className="text-slate-500">{g.gradedBy.name}</td>
                  <td className="text-slate-500">{formatDate(g.createdAt)}</td>
                  {staff && (
                    <td className="text-right">
                      <form action={deleteGrade.bind(null, g.id)}>
                        <button className="btn-danger">Delete</button>
                      </form>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
