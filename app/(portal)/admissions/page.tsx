import Link from "next/link";
import type { EnquiryStage } from "@prisma/client";
import { addEnquiry, admitEnquiry, moveEnquiry } from "@/app/actions/operations";
import { ActionForm } from "@/components/ActionForm";
import { EnquiryFields } from "@/components/EnquiryFields";
import { SubmitButton } from "@/components/SubmitButton";
import { Badge, PageHeader, formatDate } from "@/components/ui";
import { schoolIds } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { classesFor, schoolsFor } from "@/lib/queries";

const STAGES: { key: EnquiryStage; label: string }[] = [
  { key: "ENQUIRY", label: "Enquiry" },
  { key: "APPLIED", label: "Applied" },
  { key: "TEST", label: "Test / interaction" },
  { key: "OFFERED", label: "Offered" },
  { key: "ADMITTED", label: "Admitted" },
  { key: "REJECTED", label: "Rejected" },
];
const NEXT: Partial<Record<EnquiryStage, EnquiryStage>> = { ENQUIRY: "APPLIED", APPLIED: "TEST", TEST: "OFFERED" };

export default async function AdmissionsPage({ searchParams }: { searchParams: Promise<{ stage?: string; admitted?: string }> }) {
  const user = await requireUser(["OWNER", "PRINCIPAL"]);
  const { stage: stageParam, admitted } = (await searchParams) as { stage?: EnquiryStage; admitted?: string };
  const active = STAGES.find((s) => s.key === stageParam)?.key ?? "ENQUIRY";
  const [counts, enquiries, schools, classes] = await Promise.all([
    db.enquiry.groupBy({ by: ["stage"], where: { schoolId: { in: schoolIds(user) } }, _count: true }),
    db.enquiry.findMany({
      where: { schoolId: { in: schoolIds(user) }, stage: active },
      include: {
        school: { select: { name: true } },
        student: { select: { id: true, email: true, parents: { select: { parent: { select: { email: true } } } } } },
      },
      orderBy: { updatedAt: "desc" },
    }),
    schoolsFor(user),
    classesFor(user),
  ]);
  const count = (k: EnquiryStage) => counts.find((c) => c.stage === k)?._count ?? 0;
  const total = counts.reduce((n, c) => n + c._count, 0);
  const conversion = total ? Math.round((count("ADMITTED") / total) * 100) : 0;

  return (
    <>
      <PageHeader title="Admissions" subtitle={`${total} enquiries · ${conversion}% admitted`}>
        <div className="text-sm text-slate-500">
          Public form: <Link href="/apply" className="font-mono text-brand-600 hover:underline">/apply</Link>
        </div>
      </PageHeader>
      <div className="mb-4 flex flex-wrap gap-2">
        {STAGES.map((s) => (
          <Link key={s.key} href={`/admissions?stage=${s.key}`} className={s.key === active ? "btn" : "btn-ghost"}>
            {s.label} <span className="opacity-70">({count(s.key)})</span>
          </Link>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <section className="space-y-4 lg:col-span-2">
          {enquiries.length === 0 && <div className="card text-center text-sm text-slate-500">Nothing at this stage.</div>}
          {enquiries.map((e) => (
            <article key={e.id} className={`card ${e.id === admitted ? "ring-2 ring-emerald-300" : ""}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="text-lg font-semibold">{e.studentName}</div>
                  <div className="text-sm text-slate-500">
                    Applying for {e.gradeApplied}
                    {e.dateOfBirth && ` · born ${formatDate(e.dateOfBirth)}`}
                    {schools.length > 1 && ` · ${e.school.name}`}
                  </div>
                </div>
                <div className="text-right text-xs text-slate-500">
                  Received {formatDate(e.createdAt)}
                  {e.source && <div>Source: {e.source}</div>}
                </div>
              </div>
              <div className="mt-3 text-sm">
                {e.parentName} · {e.parentPhone} · {e.parentEmail}
              </div>
              {e.notes && <p className="mt-2 whitespace-pre-line text-sm text-slate-600">{e.notes}</p>}
              {e.stage === "ADMITTED" ? (
                <div className="mt-3 space-y-1 text-sm">
                  <div>
                    <Badge tone="green">Admitted</Badge>{" "}
                    {e.id === admitted && <span className="text-emerald-700">Accounts created. Share the temporary password with the family.</span>}
                  </div>
                  {e.student && (
                    <div>
                      Student login:{" "}
                      <Link href={`/people/student/${e.student.id}`} className="text-brand-600 hover:underline">{e.student.email}</Link>
                      {e.student.parents.length > 0 && <> · Parent login: {e.student.parents.map((p) => p.parent.email).join(", ")}</>}
                    </div>
                  )}
                </div>
              ) : (
                <div className="mt-4 space-y-3 border-t border-slate-100 pt-3">
                  <div className="flex flex-wrap gap-2">
                    {NEXT[e.stage] && (
                      <form action={moveEnquiry.bind(null, e.id, NEXT[e.stage] as "APPLIED")}>
                        <button className="btn-ghost">Move to {STAGES.find((s) => s.key === NEXT[e.stage])?.label}</button>
                      </form>
                    )}
                    {e.stage !== "REJECTED" ? (
                      <form action={moveEnquiry.bind(null, e.id, "REJECTED")}>
                        <button className="btn-danger">Reject</button>
                      </form>
                    ) : (
                      <form action={moveEnquiry.bind(null, e.id, "ENQUIRY")}>
                        <button className="btn-ghost">Reopen</button>
                      </form>
                    )}
                  </div>
                  {e.stage !== "REJECTED" && (
                    <details>
                      <summary className="cursor-pointer text-sm font-medium text-brand-700">Admit and create accounts</summary>
                      <ActionForm action={admitEnquiry} className="mt-3 grid gap-3 sm:grid-cols-2">
                        <input type="hidden" name="enquiryId" value={e.id} />
                        <div>
                          <label className="label">Student login email</label>
                          <input name="studentEmail" type="email" required className="input" />
                        </div>
                        <div>
                          <label className="label">Temporary password</label>
                          <input name="password" required minLength={8} className="input" />
                        </div>
                        <div>
                          <label className="label">Class</label>
                          <select name="classId" className="input" defaultValue="">
                            <option value="">Assign later</option>
                            {classes
                              .filter((c) => c.schoolId === e.schoolId)
                              .map((c) => (
                                <option key={c.id} value={c.id}>{c.name}-{c.section}</option>
                              ))}
                          </select>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="label">Roll no.</label>
                            <input name="rollNo" className="input" />
                          </div>
                          <div>
                            <label className="label">Parent is</label>
                            <input name="relation" placeholder="Mother" className="input" />
                          </div>
                        </div>
                        <div className="col-span-full">
                          <SubmitButton>Admit {e.studentName}</SubmitButton>
                        </div>
                      </ActionForm>
                    </details>
                  )}
                </div>
              )}
            </article>
          ))}
        </section>
        <section className="card h-fit">
          <h2 className="mb-3 font-semibold">Log a walk-in or phone enquiry</h2>
          <ActionForm action={addEnquiry} className="space-y-3">
            <EnquiryFields schools={schools} />
            <SubmitButton>Add enquiry</SubmitButton>
          </ActionForm>
        </section>
      </div>
    </>
  );
}
