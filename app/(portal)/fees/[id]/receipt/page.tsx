import { notFound } from "next/navigation";
import { PrintButton } from "@/components/PrintButton";
import { formatDate, formatMoney } from "@/components/ui";
import { canSeeStudent } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

const MODE: Record<string, string> = { CASH: "Cash", UPI: "UPI", CARD: "Card", BANK_TRANSFER: "Bank transfer", CHEQUE: "Cheque" };

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(["OWNER", "PRINCIPAL", "STUDENT", "PARENT"]);
  const { id } = await params;
  const fee = await db.fee.findUnique({
    where: { id },
    include: { student: { include: { school: true, classRoom: true } } },
  });
  if (!fee || fee.status !== "PAID" || !(await canSeeStudent(user, fee.studentId))) notFound();

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-4 flex justify-end print:hidden">
        <PrintButton label="Print receipt" />
      </div>
      <article className="card space-y-6 print:border-0 print:shadow-none">
        <header className="flex items-start justify-between border-b border-slate-200 pb-4">
          <div>
            <div className="text-lg font-bold">{fee.student.school?.name}</div>
            <div className="text-sm text-slate-500">{fee.student.school?.address}</div>
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-wide text-slate-500">Fee receipt</div>
            <div className="font-mono font-semibold">{fee.receiptNo}</div>
          </div>
        </header>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <Item label="Student" value={fee.student.name} />
          <Item label="Class" value={fee.student.classRoom ? `${fee.student.classRoom.name}-${fee.student.classRoom.section}` : "—"} />
          <Item label="Paid on" value={fee.paidAt ? formatDate(fee.paidAt) : "—"} />
          <Item label="Payment mode" value={fee.paymentMode ? MODE[fee.paymentMode] : "—"} />
        </dl>
        <table className="table">
          <tbody>
            <tr><td>{fee.title}</td><td className="text-right">{formatMoney(fee.amount)}</td></tr>
            {fee.concession > 0 && <tr><td>Concession</td><td className="text-right">− {formatMoney(fee.concession)}</td></tr>}
            <tr className="font-semibold"><td>Amount paid</td><td className="text-right">{formatMoney(fee.amount - fee.concession)}</td></tr>
          </tbody>
        </table>
        <p className="text-xs text-slate-500">This is a computer-generated receipt.</p>
      </article>
    </div>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
