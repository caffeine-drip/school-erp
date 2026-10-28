import Link from "next/link";
import { createFee, recordPayment, undoPayment } from "@/app/actions/manage";
import { ActionForm } from "@/components/ActionForm";
import { SubmitButton } from "@/components/SubmitButton";
import { Badge, Empty, PageHeader, Stat, formatDate, formatMoney } from "@/components/ui";
import { visibleStudentsWhere } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { classesFor } from "@/lib/queries";

export default async function FeesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const user = await requireUser(["OWNER", "PRINCIPAL", "STUDENT", "PARENT"]);
  const manage = user.role === "OWNER" || user.role === "PRINCIPAL";
  const status = (await searchParams).status;
  const studentScope = visibleStudentsWhere(user);

  const [fees, classes, students, paid, unpaid] = await Promise.all([
    db.fee.findMany({
      where: { student: studentScope, ...(status === "PAID" || status === "UNPAID" ? { status } : {}) },
      include: { student: { select: { name: true, classRoom: { select: { name: true, section: true } } } } },
      orderBy: [{ status: "asc" }, { dueDate: "asc" }],
      take: 300,
    }),
    manage ? classesFor(user) : Promise.resolve([]),
    manage ? db.user.findMany({ where: studentScope, orderBy: { name: "asc" } }) : Promise.resolve([]),
    db.fee.aggregate({ where: { student: studentScope, status: "PAID" }, _sum: { amount: true, concession: true } }),
    db.fee.aggregate({ where: { student: studentScope, status: "UNPAID" }, _sum: { amount: true } }),
  ]);

  return (
    <>
      <PageHeader title="Fees" subtitle={manage ? "Raise fees for a class or a student and record payments." : "Fees for your account."}>
        <form className="flex gap-2">
          <select name="status" defaultValue={status ?? ""} className="input py-1">
            <option value="">All</option>
            <option value="UNPAID">Unpaid</option>
            <option value="PAID">Paid</option>
          </select>
          <button className="btn-ghost">Filter</button>
        </form>
      </PageHeader>
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3">
        <Stat label="Collected" value={formatMoney((paid._sum.amount ?? 0) - (paid._sum.concession ?? 0))} hint={paid._sum.concession ? `after ${formatMoney(paid._sum.concession)} concessions` : undefined} />
        <Stat label="Outstanding" value={formatMoney(unpaid._sum.amount ?? 0)} />
      </div>
      <div className={`grid gap-6 ${manage ? "lg:grid-cols-3" : ""}`}>
        <section className="card overflow-x-auto lg:col-span-2">
          {fees.length === 0 ? (
            <Empty>No fees.</Empty>
          ) : (
            <table className="table">
              <thead>
                <tr><th>Student</th><th>Fee</th><th>Due</th><th>Amount</th><th>Status</th><th /></tr>
              </thead>
              <tbody>
                {fees.map((f) => (
                  <tr key={f.id}>
                    <td>
                      {f.student.name}
                      {f.student.classRoom && (
                        <div className="text-xs text-slate-500">{f.student.classRoom.name}-{f.student.classRoom.section}</div>
                      )}
                    </td>
                    <td>{f.title}</td>
                    <td>{formatDate(f.dueDate)}</td>
                    <td>
                      {formatMoney(f.amount - f.concession)}
                      {f.concession > 0 && <div className="text-xs text-slate-500">{formatMoney(f.concession)} concession</div>}
                    </td>
                    <td>
                      {f.status === "PAID" ? (
                        <Badge tone="green">Paid{f.paidAt ? ` ${formatDate(f.paidAt)}` : ""}</Badge>
                      ) : f.dueDate < new Date() ? (
                        <Badge tone="red">Overdue</Badge>
                      ) : (
                        <Badge tone="amber">Unpaid</Badge>
                      )}
                    </td>
                    <td className="text-right">
                      {f.status === "PAID" ? (
                        <div className="flex justify-end gap-2">
                          <Link href={`/fees/${f.id}/receipt`} className="btn-ghost">Receipt</Link>
                          {manage && (
                            <form action={undoPayment.bind(null, f.id)}>
                              <button className="btn-danger">Undo</button>
                            </form>
                          )}
                        </div>
                      ) : manage ? (
                        <details className="text-left">
                          <summary className="btn-ghost cursor-pointer list-none">Record payment</summary>
                          <ActionForm action={recordPayment} className="mt-2 space-y-2">
                          <input type="hidden" name="feeId" value={f.id} />
                          <select name="mode" className="input py-1" defaultValue="CASH">
                            <option value="CASH">Cash</option>
                            <option value="UPI">UPI</option>
                            <option value="CARD">Card</option>
                            <option value="BANK_TRANSFER">Bank</option>
                            <option value="CHEQUE">Cheque</option>
                          </select>
                          <input name="concession" type="number" min={0} step="any" placeholder="Concession (optional)" className="input py-1" />
                          <SubmitButton>Save and view receipt</SubmitButton>
                          </ActionForm>
                        </details>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        {manage && (
          <section className="card h-fit">
            <h2 className="mb-3 font-semibold">Raise a fee</h2>
            <ActionForm action={createFee} className="space-y-3">
              <div>
                <label className="label">For</label>
                <select name="target" required className="input" defaultValue="">
                  <option value="" disabled>Choose a class or student</option>
                  <optgroup label="Whole class">
                    {classes.map((c) => (
                      <option key={c.id} value={`class:${c.id}`}>{c.name}-{c.section} ({c._count.students} students)</option>
                    ))}
                  </optgroup>
                  <optgroup label="One student">
                    {students.map((s) => (
                      <option key={s.id} value={`student:${s.id}`}>{s.name}</option>
                    ))}
                  </optgroup>
                </select>
              </div>
              <div>
                <label className="label">Title</label>
                <input name="title" required placeholder="Term 1 tuition" className="input" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Amount</label>
                  <input name="amount" type="number" step="any" min={0} required className="input" />
                </div>
                <div>
                  <label className="label">Due date</label>
                  <input name="dueDate" type="date" required className="input" />
                </div>
              </div>
              <SubmitButton>Raise fee</SubmitButton>
            </ActionForm>
          </section>
        )}
      </div>
    </>
  );
}
