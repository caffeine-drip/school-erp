import Link from "next/link";
import { createHomework } from "@/app/actions/academics";
import { ActionForm } from "@/components/ActionForm";
import { SubmitButton } from "@/components/SubmitButton";
import { Badge, Empty, PageHeader, formatDate } from "@/components/ui";
import { visibleClassesWhere, visibleStudentIds } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isStaff } from "@/lib/roles";
import { todayUTC } from "@/lib/queries";

export default async function HomeworkPage() {
  const user = await requireUser();
  const staff = isStaff(user.role);
  const classes = await db.classRoom.findMany({
    where: visibleClassesWhere(user),
    include: { subjects: { orderBy: { name: "asc" } } },
    orderBy: [{ name: "asc" }, { section: "asc" }],
  });
  const studentIds = staff ? [] : await visibleStudentIds(user);
  const homework = await db.homework.findMany({
    where: { classId: { in: classes.map((c) => c.id) } },
    include: {
      classRoom: true,
      subject: true,
      createdBy: { select: { name: true } },
      submissions: { where: staff ? {} : { studentId: { in: studentIds } }, select: { studentId: true, score: true } },
      _count: { select: { submissions: true } },
    },
    orderBy: { dueDate: "desc" },
    take: 100,
  });
  const studentCounts = staff
    ? await db.user.groupBy({ by: ["classId"], where: { role: "STUDENT", classId: { in: classes.map((c) => c.id) } }, _count: true })
    : [];
  const today = todayUTC();

  return (
    <>
      <PageHeader title="Homework" subtitle={staff ? "Set work for your classes and review submissions." : "Work set by your teachers."} />
      <div className={`grid gap-6 ${staff ? "lg:grid-cols-3" : ""}`}>
        <section className="card overflow-x-auto lg:col-span-2">
          {homework.length === 0 ? (
            <Empty>No homework yet.</Empty>
          ) : (
            <table className="table">
              <thead>
                <tr><th>Work</th><th>Class</th><th>Due</th><th>{staff ? "Submitted" : "Status"}</th></tr>
              </thead>
              <tbody>
                {homework.map((h) => {
                  const total = studentCounts.find((c) => c.classId === h.classId)?._count ?? 0;
                  const mine = h.submissions;
                  return (
                    <tr key={h.id}>
                      <td>
                        <Link href={`/homework/${h.id}`} className="font-medium text-brand-700 hover:underline">{h.title}</Link>
                        <div className="text-xs text-slate-500">{h.subject?.name ?? "General"} · {h.createdBy.name}</div>
                      </td>
                      <td>{h.classRoom.name}-{h.classRoom.section}</td>
                      <td>{formatDate(h.dueDate)}</td>
                      <td>
                        {staff ? (
                          `${h._count.submissions} / ${total}`
                        ) : mine.length > 0 && mine.every((m) => m.score != null) ? (
                          <Badge tone="green">Marked</Badge>
                        ) : mine.length > 0 ? (
                          <Badge tone="blue">Submitted</Badge>
                        ) : h.dueDate < today ? (
                          <Badge tone="red">Overdue</Badge>
                        ) : (
                          <Badge tone="amber">To do</Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
        {staff && (
          <section className="card h-fit">
            <h2 className="mb-3 font-semibold">Set homework</h2>
            {classes.length === 0 ? (
              <Empty>You don't teach any classes yet.</Empty>
            ) : (
              <ActionForm action={createHomework} className="space-y-3">
                <div>
                  <label className="label">Class and subject</label>
                  <select name="target" required className="input" defaultValue="">
                    <option value="" disabled>Choose</option>
                    {classes.map((c) => (
                      <optgroup key={c.id} label={`${c.name}-${c.section}`}>
                        <option value={`${c.id}:`}>{c.name}-{c.section} · General</option>
                        {c.subjects
                          .filter((s) => user.role !== "TEACHER" || s.teacherId === user.id || c.teacherId === user.id)
                          .map((s) => (
                            <option key={s.id} value={`${c.id}:${s.id}`}>{c.name}-{c.section} · {s.name}</option>
                          ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Title</label>
                  <input name="title" required className="input" />
                </div>
                <div>
                  <label className="label">Instructions</label>
                  <textarea name="details" required rows={4} className="input" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Due date</label>
                    <input name="dueDate" type="date" required className="input" />
                  </div>
                  <div>
                    <label className="label">Marks (optional)</label>
                    <input name="maxScore" type="number" min={1} step="any" className="input" />
                  </div>
                </div>
                <SubmitButton>Set homework</SubmitButton>
              </ActionForm>
            )}
          </section>
        )}
      </div>
    </>
  );
}
