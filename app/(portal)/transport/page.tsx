import { addRoute, assignRoute, removeRider } from "@/app/actions/operations";
import { ActionForm } from "@/components/ActionForm";
import { SchoolSelect } from "@/components/SchoolSelect";
import { SubmitButton } from "@/components/SubmitButton";
import { Empty, PageHeader } from "@/components/ui";
import { schoolIds, visibleStudentsWhere } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { schoolsFor } from "@/lib/queries";

const stopsOf = (s: string) => s.split(/\r?\n|,/).map((x) => x.trim()).filter(Boolean);

export default async function TransportPage() {
  const user = await requireUser();
  const manage = user.role === "OWNER" || user.role === "PRINCIPAL";
  const studentScope = visibleStudentsWhere(user);
  const [routes, students, schools] = await Promise.all([
    db.route.findMany({
      where: { schoolId: { in: schoolIds(user) }, ...(manage ? {} : { riders: { some: studentScope } }) },
      include: {
        riders: { where: studentScope, include: { classRoom: { select: { name: true, section: true } } }, orderBy: { name: "asc" } },
        _count: { select: { riders: true } },
      },
      orderBy: { name: "asc" },
    }),
    manage ? db.user.findMany({ where: studentScope, orderBy: { name: "asc" } }) : Promise.resolve([]),
    manage ? schoolsFor(user) : Promise.resolve([]),
  ]);

  return (
    <>
      <PageHeader title="Transport" subtitle={manage ? "Bus routes, vehicles and who rides them." : "Your bus route and stop."} />
      <div className={`grid gap-6 ${manage ? "lg:grid-cols-3" : ""}`}>
        <section className="space-y-4 lg:col-span-2">
          {routes.length === 0 && (
            <div className="card"><Empty>{manage ? "No routes yet." : "No bus route assigned."}</Empty></div>
          )}
          {routes.map((r) => (
            <article key={r.id} className="card">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="text-lg font-semibold">{r.name}</div>
                  <div className="text-sm text-slate-500">Vehicle {r.vehicleNo} · Driver {r.driverName} ({r.driverPhone})</div>
                </div>
                {manage && <div className="text-sm text-slate-500">{r._count.riders} riders</div>}
              </div>
              <ol className="mt-3 flex flex-wrap gap-2 text-sm">
                {stopsOf(r.stops).map((s, i) => (
                  <li key={s} className="rounded-full bg-slate-100 px-3 py-1">{i + 1}. {s}</li>
                ))}
              </ol>
              {r.riders.length > 0 && (
                <table className="table mt-3">
                  <thead>
                    <tr><th>Student</th><th>Class</th><th>Stop</th>{manage && <th />}</tr>
                  </thead>
                  <tbody>
                    {r.riders.map((s) => (
                      <tr key={s.id}>
                        <td>{s.name}</td>
                        <td>{s.classRoom ? `${s.classRoom.name}-${s.classRoom.section}` : "—"}</td>
                        <td>{s.stop}</td>
                        {manage && (
                          <td className="text-right">
                            <form action={removeRider.bind(null, s.id)}>
                              <button className="btn-danger">Remove</button>
                            </form>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {manage && (
                <ActionForm action={assignRoute} className="mt-4 grid items-end gap-3 border-t border-slate-100 pt-3 sm:grid-cols-3">
                  <input type="hidden" name="routeId" value={r.id} />
                  <div>
                    <label className="label">Student</label>
                    <select name="studentId" required className="input" defaultValue="">
                      <option value="" disabled>Choose</option>
                      {students.filter((s) => s.schoolId === r.schoolId).map((s) => (
                        <option key={s.id} value={s.id}>{s.name}{s.routeId ? " (on a route)" : ""}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label">Stop</label>
                    <select name="stop" required className="input" defaultValue="">
                      <option value="" disabled>Choose</option>
                      {stopsOf(r.stops).map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                  <SubmitButton className="btn-ghost">Add rider</SubmitButton>
                </ActionForm>
              )}
            </article>
          ))}
        </section>
        {manage && (
          <section className="card h-fit">
            <h2 className="mb-3 font-semibold">Add a route</h2>
            <ActionForm action={addRoute} className="space-y-3">
              <SchoolSelect schools={schools} />
              <input name="name" required placeholder="Route 1: North" className="input" />
              <div className="grid grid-cols-2 gap-3">
                <input name="vehicleNo" required placeholder="Vehicle no." className="input" />
                <input name="driverName" required placeholder="Driver" className="input" />
              </div>
              <input name="driverPhone" required placeholder="Driver phone" className="input" />
              <div>
                <label className="label">Stops, one per line, in pickup order</label>
                <textarea name="stops" required rows={4} className="input" />
              </div>
              <SubmitButton>Add route</SubmitButton>
            </ActionForm>
          </section>
        )}
      </div>
    </>
  );
}
