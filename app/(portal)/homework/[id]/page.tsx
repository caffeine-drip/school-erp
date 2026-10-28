import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteHomework, reviewSubmission, submitHomework } from "@/app/actions/academics";
import { ActionForm } from "@/components/ActionForm";
import { SubmitButton } from "@/components/SubmitButton";
import { Badge, Empty, PageHeader, formatDate } from "@/components/ui";
import { canTeachClass, visibleClassesWhere, visibleStudentIds } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export default async function HomeworkDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const hw = await db.homework.findFirst({
    where: { id, classRoom: visibleClassesWhere(user) },
    include: { classRoom: { include: { students: { orderBy: { name: "asc" } } } }, subject: true, createdBy: { select: { name: true } } },
  });
  if (!hw) notFound();
  const teaches = await canTeachClass(user, hw.classId);
  const visible = teaches ? hw.classRoom.students.map((s) => s.id) : await visibleStudentIds(user);
  const submissions = await db.submission.findMany({ where: { homeworkId: hw.id, studentId: { in: visible } } });
  const byStudent = new Map(submissions.map((s) => [s.studentId, s]));
  const mine = user.role === "STUDENT" ? byStudent.get(user.id) : undefined;

  return (
    <>
      <div className="mb-2 text-sm">
        <Link href="/homework" className="text-brand-600 hover:underline">← All homework</Link>
      </div>
      <PageHeader
        title={hw.title}
        subtitle={`${hw.classRoom.name}-${hw.classRoom.section} · ${hw.subject?.name ?? "General"} · set by ${hw.createdBy.name} · due ${formatDate(hw.dueDate)}${hw.maxScore ? ` · out of ${hw.maxScore}` : ""}`}
      >
        {teaches && (user.role !== "TEACHER" || hw.createdById === user.id) && (
          <form action={deleteHomework.bind(null, hw.id)}>
            <button className="btn-danger">Delete</button>
          </form>
        )}
      </PageHeader>
      <section className="card mb-6">
        <p className="whitespace-pre-line text-sm">{hw.details}</p>
      </section>

      {user.role === "STUDENT" && (
        <section className="card">
          <h2 className="mb-3 font-semibold">Your answer</h2>
          {mine?.score != null || mine?.feedback ? (
            <div className="mb-4 rounded-lg bg-brand-50 p-3 text-sm">
              {mine.score != null && <div className="font-semibold">Score: {mine.score}{hw.maxScore ? ` / ${hw.maxScore}` : ""}</div>}
              {mine.feedback && <div>Feedback: {mine.feedback}</div>}
            </div>
          ) : null}
          <ActionForm action={submitHomework} className="space-y-3">
            <input type="hidden" name="homeworkId" value={hw.id} />
            <textarea name="content" required rows={6} defaultValue={mine?.content} className="input" disabled={mine?.score != null} />
            {mine?.score == null && <SubmitButton>{mine ? "Update submission" : "Submit"}</SubmitButton>}
          </ActionForm>
        </section>
      )}

      {user.role === "PARENT" && (
        <section className="card">
          <h2 className="mb-3 font-semibold">Your child's work</h2>
          {submissions.length === 0 ? (
            <Empty>Not submitted yet.</Empty>
          ) : (
            submissions.map((s) => (
              <div key={s.id} className="space-y-1 text-sm">
                <p className="whitespace-pre-line">{s.content}</p>
                {s.score != null && <p className="font-semibold">Score: {s.score}{hw.maxScore ? ` / ${hw.maxScore}` : ""}</p>}
                {s.feedback && <p>Feedback: {s.feedback}</p>}
              </div>
            ))
          )}
        </section>
      )}

      {teaches && (
        <section className="card overflow-x-auto">
          <h2 className="mb-3 font-semibold">
            Submissions ({submissions.length} of {hw.classRoom.students.length})
          </h2>
          <table className="table">
            <thead>
              <tr><th>Student</th><th>Answer</th><th>Review</th></tr>
            </thead>
            <tbody>
              {hw.classRoom.students.map((st) => {
                const sub = byStudent.get(st.id);
                return (
                  <tr key={st.id}>
                    <td className="font-medium">{st.name}</td>
                    <td className="max-w-md">
                      {sub ? (
                        <>
                          <p className="whitespace-pre-line">{sub.content}</p>
                          <div className="text-xs text-slate-500">{formatDate(sub.submittedAt)}</div>
                        </>
                      ) : (
                        <Badge tone="amber">Not submitted</Badge>
                      )}
                    </td>
                    <td>
                      {sub && (
                        <ActionForm action={reviewSubmission} className="flex flex-wrap gap-2">
                          <input type="hidden" name="submissionId" value={sub.id} />
                          <input name="score" type="number" step="any" min={0} max={hw.maxScore ?? undefined} defaultValue={sub.score ?? ""} placeholder="Score" className="input w-20 py-1" />
                          <input name="feedback" defaultValue={sub.feedback ?? ""} placeholder="Feedback" className="input w-48 py-1" />
                          <SubmitButton className="btn-ghost">Save</SubmitButton>
                        </ActionForm>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}
