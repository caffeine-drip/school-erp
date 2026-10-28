import type { Prisma } from "@prisma/client";
import { applyLeave, cancelLeave, reviewLeave } from "@/app/actions/operations";
import { ActionForm } from "@/components/ActionForm";
import { SubmitButton } from "@/components/SubmitButton";
import { Badge, Empty, PageHeader, formatDate } from "@/components/ui";
import { schoolIds } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ROLE_LABEL } from "@/lib/roles";

const TONE = { PENDING: "amber", APPROVED: "green", REJECTED: "red" } as const;

function days(from: Date, to: Date) {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
}

export default async function LeavePage() {
  const user = await requireUser(["OWNER", "PRINCIPAL", "TEACHER"]);
  const canApply = user.role !== "OWNER";
  const reviewScope: Prisma.LeaveWhereInput | null =
    user.role === "OWNER"
      ? { user: { schoolId: { in: schoolIds(user) }, role: { in: ["PRINCIPAL", "TEACHER"] } } }
      : user.role === "PRINCIPAL"
        ? { user: { schoolId: { in: schoolIds(user) }, role: "TEACHER" } }
        : null;

  const [mine, toReview] = await Promise.all([
    canApply ? db.leave.findMany({ where: { userId: user.id }, include: { reviewedBy: { select: { name: true } } }, orderBy: { fromDate: "desc" } }) : Promise.resolve([]),
    reviewScope
      ? db.leave.findMany({
          where: reviewScope,
          include: { user: { select: { name: true, role: true } }, reviewedBy: { select: { name: true } } },
          orderBy: [{ status: "asc" }, { fromDate: "desc" }],
          take: 100,
        })
      : Promise.resolve([]),
  ]);

  return (
    <>
      <PageHeader title="Staff leave" subtitle={reviewScope ? "Approve or reject leave requests from your staff." : "Apply for leave and track your requests."} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {reviewScope && (
            <section className="card overflow-x-auto">
              <h2 className="mb-3 font-semibold">Requests to review</h2>
              {toReview.length === 0 ? (
                <Empty>No leave requests.</Empty>
              ) : (
                <table className="table">
                  <thead>
                    <tr><th>Staff</th><th>Dates</th><th>Type</th><th>Reason</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {toReview.map((l) => (
                      <tr key={l.id}>
                        <td>
                          <div className="font-medium">{l.user.name}</div>
                          <div className="text-xs text-slate-500">{ROLE_LABEL[l.user.role]}</div>
                        </td>
                        <td>
                          {formatDate(l.fromDate)} – {formatDate(l.toDate)}
                          <div className="text-xs text-slate-500">{days(l.fromDate, l.toDate)} day(s)</div>
                        </td>
                        <td>{l.type}</td>
                        <td className="max-w-xs">{l.reason}</td>
                        <td>
                          {l.status === "PENDING" ? (
                            <div className="flex gap-2">
                              <form action={reviewLeave.bind(null, l.id, "APPROVED")}>
                                <button className="btn-ghost">Approve</button>
                              </form>
                              <form action={reviewLeave.bind(null, l.id, "REJECTED")}>
                                <button className="btn-danger">Reject</button>
                              </form>
                            </div>
                          ) : (
                            <Badge tone={TONE[l.status]}>{l.status.toLowerCase()}{l.reviewedBy ? ` by ${l.reviewedBy.name}` : ""}</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          )}
          {canApply && (
            <section className="card overflow-x-auto">
              <h2 className="mb-3 font-semibold">My requests</h2>
              {mine.length === 0 ? (
                <Empty>You haven't applied for leave.</Empty>
              ) : (
                <table className="table">
                  <thead>
                    <tr><th>Dates</th><th>Type</th><th>Reason</th><th>Status</th><th /></tr>
                  </thead>
                  <tbody>
                    {mine.map((l) => (
                      <tr key={l.id}>
                        <td>{formatDate(l.fromDate)} – {formatDate(l.toDate)}</td>
                        <td>{l.type}</td>
                        <td className="max-w-xs">{l.reason}</td>
                        <td><Badge tone={TONE[l.status]}>{l.status.toLowerCase()}</Badge></td>
                        <td className="text-right">
                          {l.status === "PENDING" && (
                            <form action={cancelLeave.bind(null, l.id)}>
                              <button className="btn-ghost">Cancel</button>
                            </form>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          )}
        </div>
        {canApply && (
          <section className="card h-fit">
            <h2 className="mb-3 font-semibold">Apply for leave</h2>
            <ActionForm action={applyLeave} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">From</label>
                  <input name="fromDate" type="date" required className="input" />
                </div>
                <div>
                  <label className="label">To</label>
                  <input name="toDate" type="date" required className="input" />
                </div>
              </div>
              <div>
                <label className="label">Type</label>
                <select name="type" className="input" defaultValue="Casual">
                  {["Casual", "Sick", "Earned", "Unpaid", "Other"].map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Reason</label>
                <textarea name="reason" required rows={3} className="input" />
              </div>
              <SubmitButton>Send request</SubmitButton>
            </ActionForm>
          </section>
        )}
      </div>
    </>
  );
}
