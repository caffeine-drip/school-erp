import Link from "next/link";
import { assignTeacher, createClass } from "@/app/actions/manage";
import { ActionForm } from "@/components/ActionForm";
import { SchoolSelect } from "@/components/SchoolSelect";
import { SubmitButton } from "@/components/SubmitButton";
import { Empty, PageHeader } from "@/components/ui";
import { schoolIds } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { classesFor, schoolsFor } from "@/lib/queries";

export default async function ClassesPage() {
  const user = await requireUser(["OWNER", "PRINCIPAL", "TEACHER"]);
  const manage = user.role !== "TEACHER";
  const [classes, schools, teachers] = await Promise.all([
    classesFor(user),
    schoolsFor(user),
    manage
      ? db.user.findMany({ where: { role: "TEACHER", active: true, schoolId: { in: schoolIds(user) } }, orderBy: { name: "asc" } })
      : Promise.resolve([]),
  ]);
  const multiSchool = schools.length > 1;

  return (
    <>
      <PageHeader title="Classes" subtitle={manage ? "Create classes and choose a class teacher for each." : "Classes where you are the class teacher."} />
      <div className={`grid gap-6 ${manage ? "lg:grid-cols-3" : ""}`}>
        <section className="card overflow-x-auto lg:col-span-2">
          {classes.length === 0 ? (
            <Empty>No classes yet.</Empty>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Class</th>
                  {multiSchool && <th>School</th>}
                  <th>Students</th>
                  <th>Class teacher</th>
                </tr>
              </thead>
              <tbody>
                {classes.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Link href={`/classes/${c.id}`} className="font-medium text-brand-700 hover:underline">
                        {c.name}-{c.section}
                      </Link>
                    </td>
                    {multiSchool && <td>{c.school.name}</td>}
                    <td>{c._count.students}</td>
                    <td>
                      {manage ? (
                        <ActionForm action={assignTeacher} className="flex gap-2">
                          <input type="hidden" name="classId" value={c.id} />
                          <select name="teacherId" defaultValue={c.teacherId ?? ""} className="input py-1">
                            <option value="">Unassigned</option>
                            {teachers
                              .filter((t) => t.schoolId === c.schoolId)
                              .map((t) => (
                                <option key={t.id} value={t.id}>{t.name}</option>
                              ))}
                          </select>
                          <SubmitButton className="btn-ghost">Set</SubmitButton>
                        </ActionForm>
                      ) : (
                        c.teacher?.name
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        {manage && (
          <section className="card h-fit">
            <h2 className="mb-3 font-semibold">Add a class</h2>
            {schools.length === 0 ? (
              <Empty>Add a school first.</Empty>
            ) : (
              <ActionForm action={createClass} className="space-y-3">
                <SchoolSelect schools={schools} />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Class</label>
                    <input name="name" required placeholder="Grade 5" className="input" />
                  </div>
                  <div>
                    <label className="label">Section</label>
                    <input name="section" defaultValue="A" required className="input" />
                  </div>
                </div>
                <div>
                  <label className="label">Class teacher</label>
                  <select name="teacherId" className="input" defaultValue="">
                    <option value="">Assign later</option>
                    {teachers.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
                <SubmitButton>Add class</SubmitButton>
              </ActionForm>
            )}
          </section>
        )}
      </div>
    </>
  );
}
