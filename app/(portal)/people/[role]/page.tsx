import Link from "next/link";
import { notFound } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { createPerson, setActive } from "@/app/actions/manage";
import { ActionForm } from "@/components/ActionForm";
import { SchoolSelect } from "@/components/SchoolSelect";
import { SubmitButton } from "@/components/SubmitButton";
import { Badge, Empty, PageHeader } from "@/components/ui";
import { schoolIds, visibleStudentsWhere } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { classesFor, schoolsFor } from "@/lib/queries";
import { ROLE_LABEL, ROLE_PLURAL, canManage, parseRole, viewableRoles } from "@/lib/roles";

export default async function PeoplePage({
  params,
  searchParams,
}: {
  params: Promise<{ role: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await requireUser();
  const role = parseRole((await params).role);
  if (!role || !viewableRoles(user.role).includes(role)) notFound();
  const q = (await searchParams).q?.trim();

  // Teachers only see the students in their classes and those students' parents.
  let scope: Prisma.UserWhereInput = { role, schoolId: { in: schoolIds(user) } };
  if (user.role === "TEACHER") {
    scope =
      role === "STUDENT"
        ? visibleStudentsWhere(user)
        : { ...scope, children: { some: { student: visibleStudentsWhere(user) } } };
  }
  const where: Prisma.UserWhereInput = q
    ? { AND: [scope, { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] }] }
    : scope;

  const [people, schools, classes, students] = await Promise.all([
    db.user.findMany({
      where,
      include: {
        school: { select: { name: true } },
        classRoom: { select: { name: true, section: true } },
        classesTaught: { select: { name: true, section: true } },
        children: { include: { student: { select: { name: true } } } },
        parents: { include: { parent: { select: { name: true } } } },
      },
      orderBy: { name: "asc" },
    }),
    schoolsFor(user),
    role === "STUDENT" ? classesFor(user) : Promise.resolve([]),
    role === "PARENT" ? db.user.findMany({ where: visibleStudentsWhere(user), orderBy: { name: "asc" } }) : Promise.resolve([]),
  ]);
  const manage = canManage(user.role, role);
  const multiSchool = schools.length > 1;

  return (
    <>
      <PageHeader title={ROLE_PLURAL[role]} subtitle={`${people.length} ${people.length === 1 ? ROLE_LABEL[role].toLowerCase() : ROLE_PLURAL[role].toLowerCase()}`}>
        <form className="flex gap-2">
          <input name="q" defaultValue={q} placeholder="Search name or email" className="input w-56" />
          <button className="btn-ghost">Search</button>
        </form>
      </PageHeader>
      <div className={`grid gap-6 ${manage ? "lg:grid-cols-3" : ""}`}>
        <section className="card overflow-x-auto lg:col-span-2">
          {people.length === 0 ? (
            <Empty>No {ROLE_PLURAL[role].toLowerCase()} yet.</Empty>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  {multiSchool && <th>School</th>}
                  {role === "TEACHER" && <th>Class teacher of</th>}
                  {role === "STUDENT" && <th>Class</th>}
                  {role === "STUDENT" && <th>Parents</th>}
                  {role === "PARENT" && <th>Children</th>}
                  <th>Status</th>
                  {manage && <th />}
                </tr>
              </thead>
              <tbody>
                {people.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <Link href={`/people/${role.toLowerCase()}/${p.id}`} className="font-medium text-brand-700 hover:underline">
                        {p.name}
                      </Link>
                      <div className="text-xs text-slate-500">{p.email}</div>
                    </td>
                    {multiSchool && <td>{p.school?.name}</td>}
                    {role === "TEACHER" && <td>{p.classesTaught.map((c) => `${c.name}-${c.section}`).join(", ") || "—"}</td>}
                    {role === "STUDENT" && (
                      <td>
                        {p.classRoom ? `${p.classRoom.name}-${p.classRoom.section}` : "—"}
                        {p.rollNo && <span className="text-xs text-slate-500"> · #{p.rollNo}</span>}
                      </td>
                    )}
                    {role === "STUDENT" && <td>{p.parents.map((l) => l.parent.name).join(", ") || "—"}</td>}
                    {role === "PARENT" && <td>{p.children.map((l) => l.student.name).join(", ") || "—"}</td>}
                    <td>{p.active ? <Badge tone="green">Active</Badge> : <Badge tone="red">Disabled</Badge>}</td>
                    {manage && (
                      <td className="text-right">
                        <form action={setActive.bind(null, p.id, !p.active)}>
                          <button className={p.active ? "btn-danger" : "btn-ghost"}>{p.active ? "Disable" : "Enable"}</button>
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
            <h2 className="mb-3 font-semibold">Add a {ROLE_LABEL[role].toLowerCase()}</h2>
            {schools.length === 0 ? (
              <Empty>Add a school first.</Empty>
            ) : (
              <ActionForm action={createPerson} className="space-y-3">
                <input type="hidden" name="role" value={role} />
                <SchoolSelect schools={schools} />
                <div>
                  <label className="label">Full name</label>
                  <input name="name" required className="input" />
                </div>
                <div>
                  <label className="label">Email (used to sign in)</label>
                  <input name="email" type="email" required className="input" />
                </div>
                <div>
                  <label className="label">Temporary password</label>
                  <input name="password" type="text" required minLength={8} className="input" />
                </div>
                <div>
                  <label className="label">Phone</label>
                  <input name="phone" className="input" />
                </div>
                {role === "STUDENT" && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label">Class</label>
                      <select name="classId" className="input" defaultValue="">
                        <option value="">None yet</option>
                        {classes.map((c) => (
                          <option key={c.id} value={c.id}>
                            {multiSchool ? `${c.school.name}: ` : ""}
                            {c.name}-{c.section}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="label">Roll no.</label>
                      <input name="rollNo" className="input" />
                    </div>
                  </div>
                )}
                {role === "PARENT" && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label">Child</label>
                      <select name="childId" className="input" defaultValue="">
                        <option value="">Link later</option>
                        {students.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="label">Relation</label>
                      <input name="relation" placeholder="Mother, Father…" className="input" />
                    </div>
                  </div>
                )}
                <SubmitButton>Add {ROLE_LABEL[role].toLowerCase()}</SubmitButton>
              </ActionForm>
            )}
          </section>
        )}
      </div>
    </>
  );
}
