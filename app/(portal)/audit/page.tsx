import { Empty, PageHeader } from "@/components/ui";
import { schoolIds } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ROLE_LABEL } from "@/lib/roles";

export default async function AuditPage() {
  const user = await requireUser(["OWNER", "PRINCIPAL"]);
  const logs = await db.auditLog.findMany({
    where: { schoolId: { in: schoolIds(user) } },
    include: { actor: { select: { name: true, role: true } }, school: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 300,
  });
  const multi = user.role === "OWNER" && user.ownedSchools.length > 1;

  return (
    <>
      <PageHeader title="Audit log" subtitle="The last 300 changes to accounts, classes, fees, exams, admissions and more." />
      <section className="card overflow-x-auto">
        {logs.length === 0 ? (
          <Empty>Nothing logged yet.</Empty>
        ) : (
          <table className="table">
            <thead>
              <tr><th>When</th><th>Who</th>{multi && <th>School</th>}<th>What</th></tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id}>
                  <td className="whitespace-nowrap text-slate-500">
                    {l.createdAt.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                  </td>
                  <td>
                    {l.actor.name} <span className="text-xs text-slate-500">({ROLE_LABEL[l.actor.role]})</span>
                  </td>
                  {multi && <td>{l.school?.name}</td>}
                  <td>{l.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
