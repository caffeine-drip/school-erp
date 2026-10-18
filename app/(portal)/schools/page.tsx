import { createSchool } from "@/app/actions/manage";
import { ActionForm } from "@/components/ActionForm";
import { SubmitButton } from "@/components/SubmitButton";
import { Empty, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export default async function SchoolsPage() {
  const user = await requireUser(["OWNER"]);
  const schools = await db.school.findMany({
    where: { ownerId: user.id },
    include: {
      members: { where: { role: "PRINCIPAL" }, select: { name: true } },
      _count: { select: { members: true, classes: true } },
    },
    orderBy: { name: "asc" },
  });

  return (
    <>
      <PageHeader title="Schools" subtitle="Every school you own. Add a principal to each from the Principals page." />
      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card lg:col-span-2">
          {schools.length === 0 ? (
            <Empty>Add your first school to get started.</Empty>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>School</th>
                  <th>Principal</th>
                  <th>Classes</th>
                  <th>People</th>
                </tr>
              </thead>
              <tbody>
                {schools.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <div className="font-medium">{s.name}</div>
                      <div className="text-xs text-slate-500">{s.address}</div>
                    </td>
                    <td>{s.members.map((m) => m.name).join(", ") || <span className="text-slate-400">Not assigned</span>}</td>
                    <td>{s._count.classes}</td>
                    <td>{s._count.members}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        <section className="card">
          <h2 className="mb-3 font-semibold">Add a school</h2>
          <ActionForm action={createSchool} className="space-y-3">
            <div>
              <label className="label">Name</label>
              <input name="name" required className="input" />
            </div>
            <div>
              <label className="label">Address</label>
              <input name="address" className="input" />
            </div>
            <SubmitButton>Add school</SubmitButton>
          </ActionForm>
        </section>
      </div>
    </>
  );
}
