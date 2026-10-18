import Link from "next/link";
import { notFound } from "next/navigation";
import { linkChild, resetPassword, unlinkChild, updatePerson } from "@/app/actions/manage";
import { ActionForm } from "@/components/ActionForm";
import { SubmitButton } from "@/components/SubmitButton";
import { Badge, Empty, PageHeader, formatDate, formatMoney } from "@/components/ui";
import { canAccessSchool, canSeeStudent, visibleStudentsWhere } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { attendanceRate, classesFor } from "@/lib/queries";
import { ROLE_LABEL, canManage, parseRole, viewableRoles } from "@/lib/roles";

export default async function PersonPage({ params }: { params: Promise<{ role: string; id: string }> }) {
  const user = await requireUser();
  const { role: roleParam, id } = await params;
  const role = parseRole(roleParam);
  if (!role || !viewableRoles(user.role).includes(role)) notFound();

  const person = await db.user.findUnique({
    where: { id },
    include: {
      school: true,
      classRoom: { include: { teacher: { select: { name: true } } } },
      classesTaught: true,
      children: { include: { student: { include: { classRoom: true } } } },
      parents: { include: { parent: true } },
      grades: { orderBy: { createdAt: "desc" }, take: 20 },
      fees: { orderBy: { dueDate: "desc" } },
      attendance: { orderBy: { date: "desc" }, take: 10 },
    },
  });
  if (!person || person.role !== role || !person.schoolId || !canAccessSchool(user, person.schoolId)) notFound();
  if (role === "STUDENT" && !(await canSeeStudent(user, person.id))) notFound();
  if (role === "PARENT" && user.role === "TEACHER") {
    const visible = await Promise.all(person.children.map((l) => canSeeStudent(user, l.studentId)));
    if (!visible.some(Boolean)) notFound();
  }

  const manage = canManage(user.role, role);
  const [classes, linkable, rate] = await Promise.all([
    manage && role === "STUDENT" ? classesFor(user) : Promise.resolve([]),
    manage && role === "PARENT"
      ? db.user.findMany({ where: { ...visibleStudentsWhere(user), schoolId: person.schoolId }, orderBy: { name: "asc" } })
      : Promise.resolve([]),
    role === "STUDENT" ? attendanceRate([person.id]) : Promise.resolve(null),
  ]);

  return (
    <>
      <div className="mb-2 text-sm">
        <Link href={`/people/${role.toLowerCase()}`} className="text-brand-600 hover:underline">
          ← All {ROLE_LABEL[role].toLowerCase()}s
        </Link>
      </div>
      <PageHeader title={person.name} subtitle={`${ROLE_LABEL[role]} · ${person.school?.name} · ${person.email}`}>
        {person.active ? <Badge tone="green">Active</Badge> : <Badge tone="red">Disabled</Badge>}
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {role === "STUDENT" && (
            <>
              <section className="card">
                <h2 className="mb-3 font-semibold">Overview</h2>
                <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
                  <Info label="Class" value={person.classRoom ? `${person.classRoom.name}-${person.classRoom.section}` : "—"} />
                  <Info label="Class teacher" value={person.classRoom?.teacher?.name ?? "—"} />
                  <Info label="Roll no." value={person.rollNo ?? "—"} />
                  <Info label="Attendance" value={rate === null ? "—" : `${rate}%`} />
                </dl>
                <div className="mt-4 text-sm">
                  <span className="text-slate-500">Parents: </span>
                  {person.parents.map((l) => `${l.parent.name} (${l.relation})`).join(", ") || "None linked"}
                </div>
              </section>
              <section className="card overflow-x-auto">
                <h2 className="mb-3 font-semibold">Recent marks</h2>
                {person.grades.length === 0 ? (
                  <Empty>No marks recorded.</Empty>
                ) : (
                  <table className="table">
                    <thead>
                      <tr><th>Subject</th><th>Exam</th><th>Score</th></tr>
                    </thead>
                    <tbody>
                      {person.grades.map((g) => (
                        <tr key={g.id}><td>{g.subject}</td><td>{g.exam}</td><td>{g.score} / {g.maxScore}</td></tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>
              {user.role !== "TEACHER" && (
                <section className="card overflow-x-auto">
                  <h2 className="mb-3 font-semibold">Fees</h2>
                  {person.fees.length === 0 ? (
                    <Empty>No fees.</Empty>
                  ) : (
                    <table className="table">
                      <thead>
                        <tr><th>Fee</th><th>Due</th><th>Amount</th><th>Status</th></tr>
                      </thead>
                      <tbody>
                        {person.fees.map((f) => (
                          <tr key={f.id}>
                            <td>{f.title}</td>
                            <td>{formatDate(f.dueDate)}</td>
                            <td>{formatMoney(f.amount)}</td>
                            <td>{f.status === "PAID" ? <Badge tone="green">Paid</Badge> : <Badge tone="amber">Unpaid</Badge>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </section>
              )}
            </>
          )}

          {role === "PARENT" && (
            <section className="card">
              <h2 className="mb-3 font-semibold">Children</h2>
              {person.children.length === 0 ? (
                <Empty>No children linked.</Empty>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {person.children.map((l) => (
                    <li key={l.studentId} className="flex items-center justify-between py-2 text-sm">
                      <Link href={`/people/student/${l.studentId}`} className="font-medium text-brand-700 hover:underline">
                        {l.student.name}
                      </Link>
                      <span className="text-slate-500">
                        {l.relation}
                        {l.student.classRoom && ` · ${l.student.classRoom.name}-${l.student.classRoom.section}`}
                      </span>
                      {manage && (
                        <form action={unlinkChild.bind(null, person.id, l.studentId)}>
                          <button className="btn-danger">Unlink</button>
                        </form>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {manage && (
                <ActionForm action={linkChild} className="mt-4 grid grid-cols-3 items-end gap-3">
                  <input type="hidden" name="parentId" value={person.id} />
                  <div>
                    <label className="label">Student</label>
                    <select name="studentId" required className="input" defaultValue="">
                      <option value="" disabled>Choose</option>
                      {linkable.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label">Relation</label>
                    <input name="relation" placeholder="Mother" className="input" />
                  </div>
                  <SubmitButton>Link child</SubmitButton>
                </ActionForm>
              )}
            </section>
          )}

          {role === "TEACHER" && (
            <section className="card">
              <h2 className="mb-3 font-semibold">Class teacher of</h2>
              {person.classesTaught.length === 0 ? (
                <Empty>Not assigned to a class.</Empty>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {person.classesTaught.map((c) => (
                    <Link key={c.id} href={`/classes/${c.id}`} className="btn-ghost">
                      {c.name}-{c.section}
                    </Link>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>

        {manage && (
          <div className="space-y-6">
            <section className="card">
              <h2 className="mb-3 font-semibold">Edit details</h2>
              <ActionForm action={updatePerson} className="space-y-3">
                <input type="hidden" name="userId" value={person.id} />
                <div>
                  <label className="label">Full name</label>
                  <input name="name" defaultValue={person.name} required className="input" />
                </div>
                <div>
                  <label className="label">Phone</label>
                  <input name="phone" defaultValue={person.phone ?? ""} className="input" />
                </div>
                {role === "STUDENT" && (
                  <>
                    <div>
                      <label className="label">Class</label>
                      <select name="classId" defaultValue={person.classId ?? ""} className="input">
                        <option value="">None</option>
                        {classes
                          .filter((c) => c.schoolId === person.schoolId)
                          .map((c) => (
                            <option key={c.id} value={c.id}>{c.name}-{c.section}</option>
                          ))}
                      </select>
                    </div>
                    <div>
                      <label className="label">Roll no.</label>
                      <input name="rollNo" defaultValue={person.rollNo ?? ""} className="input" />
                    </div>
                  </>
                )}
                <SubmitButton>Save</SubmitButton>
              </ActionForm>
            </section>
            <section className="card">
              <h2 className="mb-3 font-semibold">Reset password</h2>
              <ActionForm action={resetPassword} className="space-y-3">
                <input type="hidden" name="userId" value={person.id} />
                <input name="password" type="text" required minLength={8} placeholder="New temporary password" className="input" />
                <SubmitButton className="btn-ghost">Reset password</SubmitButton>
              </ActionForm>
            </section>
          </div>
        )}
      </div>
    </>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
