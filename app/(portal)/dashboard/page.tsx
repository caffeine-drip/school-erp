import Link from "next/link";
import { AnnouncementList } from "@/components/AnnouncementList";
import { Badge, Empty, PageHeader, Stat, formatDate, formatMoney } from "@/components/ui";
import { schoolIds, visibleStudentIds } from "@/lib/access";
import { requireUser, type CurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { announcementsFor, attendanceRate, classesFor } from "@/lib/queries";
import { ROLE_LABEL } from "@/lib/roles";

export default async function Dashboard() {
  const user = await requireUser();
  const announcements = await announcementsFor(user, 5);

  return (
    <>
      <PageHeader title={`Welcome, ${user.name.split(" ")[0]}`} subtitle={`${ROLE_LABEL[user.role]} dashboard`} />
      {user.role === "OWNER" || user.role === "PRINCIPAL" ? (
        <AdminStats user={user} />
      ) : user.role === "TEACHER" ? (
        <TeacherStats user={user} />
      ) : (
        <FamilyStats user={user} />
      )}
      <section className="card mt-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-semibold">Latest announcements</h2>
          <Link href="/announcements" className="text-sm text-brand-600 hover:underline">
            View all
          </Link>
        </div>
        <AnnouncementList items={announcements} />
      </section>
    </>
  );
}

async function AdminStats({ user }: { user: CurrentUser }) {
  const ids = schoolIds(user);
  const inSchools = { schoolId: { in: ids }, active: true };
  const [principals, teachers, students, parents, classes, unpaid, enquiries, leaves, overdueBooks] = await Promise.all([
    db.user.count({ where: { ...inSchools, role: "PRINCIPAL" } }),
    db.user.count({ where: { ...inSchools, role: "TEACHER" } }),
    db.user.count({ where: { ...inSchools, role: "STUDENT" } }),
    db.user.count({ where: { ...inSchools, role: "PARENT" } }),
    db.classRoom.count({ where: { schoolId: { in: ids } } }),
    db.fee.aggregate({ where: { status: "UNPAID", student: { schoolId: { in: ids } } }, _sum: { amount: true, concession: true } }),
    db.enquiry.count({ where: { schoolId: { in: ids }, stage: { in: ["ENQUIRY", "APPLIED", "TEST", "OFFERED"] } } }),
    db.leave.count({ where: { status: "PENDING", user: { schoolId: { in: ids }, role: user.role === "OWNER" ? { in: ["PRINCIPAL", "TEACHER"] } : "TEACHER" } } }),
    db.bookIssue.count({ where: { returnedAt: null, dueDate: { lt: new Date() }, book: { schoolId: { in: ids } } } }),
  ]);
  const rate = await attendanceRate(await visibleStudentIds(user));

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
      {user.role === "OWNER" && <Stat label="Schools" value={ids.length} />}
      {user.role === "OWNER" && <Stat label="Principals" value={principals} />}
      <Stat label="Teachers" value={teachers} />
      <Stat label="Students" value={students} />
      <Stat label="Parents" value={parents} />
      <Stat label="Classes" value={classes} />
      <Stat label="Attendance" value={rate === null ? "—" : `${rate}%`} hint="All recorded days" />
      <Stat label="Fees outstanding" value={formatMoney((unpaid._sum.amount ?? 0) - (unpaid._sum.concession ?? 0))} />
      <LinkStat href="/admissions" label="Open admissions" value={enquiries} />
      <LinkStat href="/leave" label="Leave to review" value={leaves} />
      <LinkStat href="/library" label="Overdue books" value={overdueBooks} />
    </div>
  );
}

function LinkStat({ href, label, value }: { href: string; label: string; value: number }) {
  return (
    <Link href={href} className="block rounded-xl transition hover:ring-2 hover:ring-brand-100">
      <Stat label={label} value={value} hint="Open →" />
    </Link>
  );
}

async function TeacherStats({ user }: { user: CurrentUser }) {
  const classes = await classesFor(user);
  const students = classes.reduce((n, c) => n + c._count.students, 0);
  const rate = await attendanceRate(await visibleStudentIds(user));
  return (
    <>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <Stat label="My classes" value={classes.length} />
        <Stat label="My students" value={students} />
        <Stat label="Attendance" value={rate === null ? "—" : `${rate}%`} />
      </div>
      <section className="card mt-6">
        <h2 className="mb-3 font-semibold">My classes</h2>
        {classes.length === 0 ? (
          <Empty>You haven't been assigned a class yet.</Empty>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {classes.map((c) => (
              <Link key={c.id} href={`/classes/${c.id}`} className="rounded-lg border border-slate-200 p-4 hover:border-brand-500">
                <div className="font-medium">
                  {c.name}-{c.section}
                </div>
                <div className="text-sm text-slate-500">{c._count.students} students</div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

async function FamilyStats({ user }: { user: CurrentUser }) {
  const ids = await visibleStudentIds(user);
  const students = await db.user.findMany({
    where: { id: { in: ids } },
    include: {
      grades: { orderBy: { createdAt: "desc" }, take: 3 },
      classRoom: {
        include: {
          teacher: { select: { name: true } },
          homework: { where: { dueDate: { gte: new Date(Date.now() - 86_400_000) } }, orderBy: { dueDate: "asc" }, take: 3 },
        },
      },
      fees: { where: { status: "UNPAID" } },
    },
    orderBy: { name: "asc" },
  });
  const rates = await Promise.all(students.map((s) => attendanceRate([s.id])));

  if (students.length === 0) return <div className="card"><Empty>No student records are linked to your account yet.</Empty></div>;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {students.map((s, i) => {
        const due = s.fees.reduce((n, f) => n + f.amount, 0);
        return (
          <div key={s.id} className="card">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-lg font-semibold">{s.name}</div>
                <div className="text-sm text-slate-500">
                  {s.classRoom ? `Class ${s.classRoom.name}-${s.classRoom.section}` : "No class assigned"}
                  {s.classRoom?.teacher && ` · Class teacher ${s.classRoom.teacher.name}`}
                </div>
              </div>
              {due > 0 ? <Badge tone="amber">{formatMoney(due)} due</Badge> : <Badge tone="green">Fees clear</Badge>}
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-slate-500">Attendance</dt>
                <dd className="text-xl font-semibold">{rates[i] === null ? "—" : `${rates[i]}%`}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Recent marks</dt>
                <dd>
                  {s.grades.length === 0
                    ? "—"
                    : s.grades.map((g) => (
                        <div key={g.id}>
                          {g.subject}: {g.score}/{g.maxScore}
                        </div>
                      ))}
                </dd>
              </div>
            </dl>
            {s.classRoom && s.classRoom.homework.length > 0 && (
              <div className="mt-4 border-t border-slate-100 pt-3 text-sm">
                <div className="mb-1 text-slate-500">Homework due</div>
                {s.classRoom.homework.map((h) => (
                  <Link key={h.id} href={`/homework/${h.id}`} className="block text-brand-700 hover:underline">
                    {h.title} · {formatDate(h.dueDate)}
                  </Link>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
