import Link from "next/link";
import { saveTimetable } from "@/app/actions/academics";
import { ActionForm } from "@/components/ActionForm";
import { SubmitButton } from "@/components/SubmitButton";
import { Empty, PageHeader } from "@/components/ui";
import { visibleClassesWhere } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { DAYS, PERIODS } from "@/lib/grading";

const periods = Array.from({ length: PERIODS }, (_, i) => i + 1);

export default async function TimetablePage({ searchParams }: { searchParams: Promise<{ class?: string; view?: string }> }) {
  const user = await requireUser();
  const { class: classParam, view } = await searchParams;
  const classes = await db.classRoom.findMany({ where: visibleClassesWhere(user), orderBy: [{ name: "asc" }, { section: "asc" }] });
  const manage = user.role === "OWNER" || user.role === "PRINCIPAL";
  const showMine = user.role === "TEACHER" && view !== "class";

  if (showMine) {
    const slots = await db.timetableSlot.findMany({
      where: { subject: { teacherId: user.id } },
      include: { subject: true, classRoom: true },
    });
    const at = (d: number, p: number) => slots.filter((s) => s.day === d && s.period === p);
    return (
      <>
        <PageHeader title="My timetable" subtitle="Periods where you teach a subject.">
          <ClassPicker classes={classes} selected={undefined} extra={<Link href="/timetable" className="btn-ghost">My week</Link>} />
        </PageHeader>
        <Grid render={(d, p) => at(d, p).map((s) => (
          <div key={s.id}>
            <div className="font-medium">{s.subject.name}</div>
            <div className="text-xs text-slate-500">{s.classRoom.name}-{s.classRoom.section}</div>
          </div>
        ))} />
      </>
    );
  }

  const cls = classes.find((c) => c.id === classParam) ?? classes[0];
  if (!cls) {
    return (
      <>
        <PageHeader title="Timetable" />
        <div className="card"><Empty>No classes yet.</Empty></div>
      </>
    );
  }
  const [subjects, slots] = await Promise.all([
    db.subject.findMany({ where: { classId: cls.id }, include: { teacher: { select: { name: true } } }, orderBy: { name: "asc" } }),
    db.timetableSlot.findMany({ where: { classId: cls.id }, include: { subject: { include: { teacher: { select: { name: true } } } } } }),
  ]);
  const slot = (d: number, p: number) => slots.find((s) => s.day === d && s.period === p);

  return (
    <>
      <PageHeader title={`Timetable · ${cls.name}-${cls.section}`} subtitle={manage ? "Pick a subject for each period, then save." : undefined}>
        <ClassPicker
          classes={classes}
          selected={cls.id}
          extra={user.role === "TEACHER" ? <Link href="/timetable" className="btn-ghost">My week</Link> : null}
        />
      </PageHeader>
      {manage ? (
        subjects.length === 0 ? (
          <div className="card">
            <Empty>
              Add subjects to this class first on its <Link href={`/classes/${cls.id}`} className="text-brand-600 underline">class page</Link>.
            </Empty>
          </div>
        ) : (
          <ActionForm action={saveTimetable} className="space-y-4">
            <input type="hidden" name="classId" value={cls.id} />
            <Grid
              render={(d, p) => (
                <select name={`cell_${d}_${p}`} defaultValue={slot(d, p)?.subjectId ?? ""} className="input px-1 py-1 text-xs">
                  <option value="">—</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              )}
            />
            <SubmitButton>Save timetable</SubmitButton>
          </ActionForm>
        )
      ) : (
        <Grid
          render={(d, p) => {
            const s = slot(d, p);
            return s ? (
              <div>
                <div className="font-medium">{s.subject.name}</div>
                <div className="text-xs text-slate-500">{s.subject.teacher?.name}</div>
              </div>
            ) : null;
          }}
        />
      )}
    </>
  );
}

function Grid({ render }: { render: (day: number, period: number) => React.ReactNode }) {
  return (
    <div className="card overflow-x-auto p-0">
      <table className="table min-w-[720px]">
        <thead>
          <tr>
            <th className="w-16">Day</th>
            {periods.map((p) => (
              <th key={p}>P{p}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {DAYS.map((day, i) => (
            <tr key={day}>
              <td className="font-semibold text-slate-500">{day}</td>
              {periods.map((p) => (
                <td key={p} className="align-top">{render(i + 1, p)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ClassPicker({ classes, selected, extra }: { classes: { id: string; name: string; section: string }[]; selected?: string; extra?: React.ReactNode }) {
  if (classes.length <= 1 && !extra) return null;
  return (
    <form className="flex gap-2">
      {extra}
      {classes.length > 0 && (
        <>
          <input type="hidden" name="view" value="class" />
          <select name="class" defaultValue={selected ?? ""} className="input py-1">
            {!selected && <option value="" disabled>Class view</option>}
            {classes.map((c) => (
              <option key={c.id} value={c.id}>{c.name}-{c.section}</option>
            ))}
          </select>
          <button className="btn-ghost">View</button>
        </>
      )}
    </form>
  );
}
