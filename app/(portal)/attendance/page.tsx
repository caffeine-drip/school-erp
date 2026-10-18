import Link from "next/link";
import { Badge, Empty, PageHeader, formatDate } from "@/components/ui";
import { isStaff } from "@/lib/roles";
import { visibleStudentIds } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { classesFor, todayUTC } from "@/lib/queries";

const TONE = { PRESENT: "green", ABSENT: "red", LATE: "amber" } as const;

export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const user = await requireUser();
  const dateParam = (await searchParams).date;
  const date = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? new Date(dateParam) : todayUTC();
  const dateStr = date.toISOString().slice(0, 10);

  if (isStaff(user.role)) {
    const classes = await classesFor(user);
    const counts = await db.attendance.groupBy({
      by: ["status"],
      where: { date, student: { classId: { in: classes.map((c) => c.id) } } },
      _count: true,
    });
    const perClass = await Promise.all(
      classes.map(async (c) => {
        const rows = await db.attendance.groupBy({ by: ["status"], where: { date, student: { classId: c.id } }, _count: true });
        const get = (s: string) => rows.find((r) => r.status === s)?._count ?? 0;
        return { c, present: get("PRESENT"), absent: get("ABSENT"), late: get("LATE") };
      }),
    );
    const total = (s: string) => counts.find((r) => r.status === s)?._count ?? 0;

    return (
      <>
        <PageHeader title="Attendance" subtitle={`Summary for ${formatDate(date)}. Open a class to mark attendance.`}>
          <form className="flex gap-2">
            <input type="date" name="date" defaultValue={dateStr} className="input py-1" />
            <button className="btn-ghost">Go</button>
          </form>
        </PageHeader>
        <div className="mb-4 flex gap-2">
          <Badge tone="green">{total("PRESENT")} present</Badge>
          <Badge tone="red">{total("ABSENT")} absent</Badge>
          <Badge tone="amber">{total("LATE")} late</Badge>
        </div>
        <section className="card overflow-x-auto">
          {classes.length === 0 ? (
            <Empty>No classes.</Empty>
          ) : (
            <table className="table">
              <thead>
                <tr><th>Class</th><th>Students</th><th>Present</th><th>Absent</th><th>Late</th><th>Not marked</th><th /></tr>
              </thead>
              <tbody>
                {perClass.map(({ c, present, absent, late }) => (
                  <tr key={c.id}>
                    <td className="font-medium">{c.name}-{c.section}</td>
                    <td>{c._count.students}</td>
                    <td>{present}</td>
                    <td>{absent}</td>
                    <td>{late}</td>
                    <td>{Math.max(0, c._count.students - present - absent - late)}</td>
                    <td className="text-right">
                      <Link href={`/classes/${c.id}?date=${dateStr}`} className="btn-ghost">Mark</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </>
    );
  }

  const ids = await visibleStudentIds(user);
  const records = await db.attendance.findMany({
    where: { studentId: { in: ids } },
    include: { student: { select: { name: true } } },
    orderBy: { date: "desc" },
    take: 100,
  });
  return (
    <>
      <PageHeader title="Attendance" subtitle="The last 100 recorded days." />
      <section className="card overflow-x-auto">
        {records.length === 0 ? (
          <Empty>No attendance recorded yet.</Empty>
        ) : (
          <table className="table">
            <thead>
              <tr><th>Date</th>{ids.length > 1 && <th>Student</th>}<th>Status</th></tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.id}>
                  <td>{formatDate(r.date)}</td>
                  {ids.length > 1 && <td>{r.student.name}</td>}
                  <td><Badge tone={TONE[r.status]}>{r.status.toLowerCase()}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
