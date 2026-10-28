"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth";
import { canAccessSchool, canSeeStudent, canTeachClass } from "@/lib/access";
import { audit } from "@/lib/audit";
import { PERIODS } from "@/lib/grading";
import type { FormState } from "./auth";
import { actor, fail, optional } from "./shared";

async function adminClass(user: CurrentUser, classId: string) {
  const cls = await db.classRoom.findUnique({ where: { id: classId } });
  if (!cls || !canAccessSchool(user, cls.schoolId)) throw new Error("Not allowed");
  return cls;
}

async function teacherInSchool(teacherId: string | undefined, schoolId: string) {
  if (!teacherId) return;
  const t = await db.user.findUnique({ where: { id: teacherId } });
  if (t?.role !== "TEACHER" || t.schoolId !== schoolId) throw new Error("Pick a teacher from this school");
}

// ---------- Subjects ----------

const SubjectSchema = z.object({ classId: z.string(), name: z.string().trim().min(1, "Subject name is required"), teacherId: optional });

export async function addSubject(_: FormState, form: FormData): Promise<FormState> {
  try {
    const user = await actor(["OWNER", "PRINCIPAL"]);
    const data = SubjectSchema.parse(Object.fromEntries(form));
    const cls = await adminClass(user, data.classId);
    await teacherInSchool(data.teacherId, cls.schoolId);
    await db.subject.create({ data });
    await audit(user, "subject.create", `Added ${data.name} to ${cls.name}-${cls.section}`, cls.schoolId);
    revalidatePath(`/classes/${cls.id}`);
    return { ok: `Added ${data.name}.` };
  } catch (e) {
    return fail(e);
  }
}

export async function setSubjectTeacher(_: FormState, form: FormData): Promise<FormState> {
  try {
    const user = await actor(["OWNER", "PRINCIPAL"]);
    const subjectId = String(form.get("subjectId"));
    const teacherId = String(form.get("teacherId") || "") || undefined;
    const subject = await db.subject.findUnique({ where: { id: subjectId }, include: { classRoom: true } });
    if (!subject || !canAccessSchool(user, subject.classRoom.schoolId)) throw new Error("Not allowed");
    await teacherInSchool(teacherId, subject.classRoom.schoolId);
    await db.subject.update({ where: { id: subjectId }, data: { teacherId: teacherId ?? null } });
    revalidatePath(`/classes/${subject.classId}`);
    return { ok: "Saved." };
  } catch (e) {
    return fail(e);
  }
}

export async function removeSubject(subjectId: string) {
  const user = await actor(["OWNER", "PRINCIPAL"]);
  const subject = await db.subject.findUnique({ where: { id: subjectId }, include: { classRoom: true } });
  if (!subject || !canAccessSchool(user, subject.classRoom.schoolId)) throw new Error("Not allowed");
  await db.subject.delete({ where: { id: subjectId } });
  await audit(user, "subject.delete", `Removed ${subject.name} from ${subject.classRoom.name}-${subject.classRoom.section}`, subject.classRoom.schoolId);
  revalidatePath(`/classes/${subject.classId}`);
}

// ---------- Timetable ----------

export async function saveTimetable(_: FormState, form: FormData): Promise<FormState> {
  try {
    const user = await actor(["OWNER", "PRINCIPAL"]);
    const cls = await adminClass(user, String(form.get("classId")));
    const subjects = await db.subject.findMany({ where: { classId: cls.id }, select: { id: true } });
    const valid = new Set(subjects.map((s) => s.id));
    const cells: { day: number; period: number; subjectId: string }[] = [];
    for (let day = 1; day <= 6; day++) {
      for (let period = 1; period <= PERIODS; period++) {
        const subjectId = String(form.get(`cell_${day}_${period}`) ?? "");
        if (subjectId && valid.has(subjectId)) cells.push({ day, period, subjectId });
      }
    }
    await db.$transaction([
      db.timetableSlot.deleteMany({ where: { classId: cls.id } }),
      db.timetableSlot.createMany({ data: cells.map((c) => ({ ...c, classId: cls.id })) }),
    ]);
    await audit(user, "timetable.save", `Updated timetable for ${cls.name}-${cls.section}`, cls.schoolId);
    revalidatePath("/timetable");
    return { ok: `Timetable saved (${cells.length} periods).` };
  } catch (e) {
    return fail(e);
  }
}

// ---------- Homework ----------

// The form sends "classId:subjectId" (subjectId may be empty for general work).
const HomeworkSchema = z.object({
  target: z.string().min(3, "Choose a class"),
  title: z.string().trim().min(1, "Title is required"),
  details: z.string().trim().min(1, "Describe the work"),
  dueDate: z.coerce.date({ message: "Pick a due date" }),
  maxScore: z.preprocess((v) => (v === "" ? undefined : v), z.coerce.number().positive().optional()),
});

export async function createHomework(_: FormState, form: FormData): Promise<FormState> {
  try {
    const user = await actor(["OWNER", "PRINCIPAL", "TEACHER"]);
    const { target, ...rest } = HomeworkSchema.parse(Object.fromEntries(form));
    const [classId, subjectId] = target.split(":");
    const data = { ...rest, classId, subjectId: subjectId || undefined };
    if (!(await canTeachClass(user, data.classId))) throw new Error("You don't teach that class");
    if (data.subjectId) {
      const subject = await db.subject.findUnique({ where: { id: data.subjectId } });
      if (subject?.classId !== data.classId) throw new Error("That subject isn't in this class");
    }
    await db.homework.create({ data: { ...data, createdById: user.id } });
    revalidatePath("/homework");
    return { ok: "Homework set." };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteHomework(id: string) {
  const user = await actor(["OWNER", "PRINCIPAL", "TEACHER"]);
  const hw = await db.homework.findUnique({ where: { id } });
  if (!hw || !(await canTeachClass(user, hw.classId)) || (user.role === "TEACHER" && hw.createdById !== user.id)) {
    throw new Error("Not allowed");
  }
  await db.homework.delete({ where: { id } });
  revalidatePath("/homework");
}

export async function submitHomework(_: FormState, form: FormData): Promise<FormState> {
  try {
    const user = await actor(["STUDENT"]);
    const homeworkId = String(form.get("homeworkId"));
    const content = z.string().trim().min(1, "Write your answer").parse(form.get("content"));
    const hw = await db.homework.findUnique({ where: { id: homeworkId } });
    if (!hw || hw.classId !== user.classId) throw new Error("Not allowed");
    const existing = await db.submission.findUnique({ where: { homeworkId_studentId: { homeworkId, studentId: user.id } } });
    if (existing?.score != null) throw new Error("Already marked; ask your teacher to reopen it");
    await db.submission.upsert({
      where: { homeworkId_studentId: { homeworkId, studentId: user.id } },
      update: { content, submittedAt: new Date() },
      create: { homeworkId, studentId: user.id, content },
    });
    revalidatePath(`/homework/${homeworkId}`);
    return { ok: "Submitted." };
  } catch (e) {
    return fail(e);
  }
}

const ReviewSchema = z.object({
  submissionId: z.string(),
  score: z.preprocess((v) => (v === "" ? undefined : v), z.coerce.number().min(0).optional()),
  feedback: optional,
});

export async function reviewSubmission(_: FormState, form: FormData): Promise<FormState> {
  try {
    const user = await actor(["OWNER", "PRINCIPAL", "TEACHER"]);
    const data = ReviewSchema.parse(Object.fromEntries(form));
    const sub = await db.submission.findUnique({ where: { id: data.submissionId }, include: { homework: true } });
    if (!sub || !(await canTeachClass(user, sub.homework.classId))) throw new Error("Not allowed");
    if (data.score != null && sub.homework.maxScore != null && data.score > sub.homework.maxScore) {
      throw new Error(`Score can't be more than ${sub.homework.maxScore}`);
    }
    await db.submission.update({ where: { id: sub.id }, data: { score: data.score ?? null, feedback: data.feedback ?? null } });
    revalidatePath(`/homework/${sub.homeworkId}`);
    return { ok: "Feedback saved." };
  } catch (e) {
    return fail(e);
  }
}

// ---------- Exams & report cards ----------

const ExamSchema = z.object({
  schoolId: z.string().min(1, "Choose a school"),
  name: z.string().trim().min(1, "Exam name is required"),
  term: z.string().trim().min(1, "Term is required"),
});

export async function createExam(_: FormState, form: FormData): Promise<FormState> {
  try {
    const user = await actor(["OWNER", "PRINCIPAL"]);
    const data = ExamSchema.parse(Object.fromEntries(form));
    if (!canAccessSchool(user, data.schoolId)) throw new Error("Not allowed for that school");
    await db.exam.create({ data });
    await audit(user, "exam.create", `Created exam ${data.name} (${data.term})`, data.schoolId);
    revalidatePath("/exams");
    return { ok: `Created ${data.name}.` };
  } catch (e) {
    return fail(e);
  }
}

export async function setExamPublished(examId: string, published: boolean) {
  const user = await actor(["OWNER", "PRINCIPAL"]);
  const exam = await db.exam.findUnique({ where: { id: examId } });
  if (!exam || !canAccessSchool(user, exam.schoolId)) throw new Error("Not allowed");
  await db.exam.update({ where: { id: examId }, data: { published } });
  await audit(user, published ? "exam.publish" : "exam.unpublish", `${published ? "Published" : "Unpublished"} results for ${exam.name}`, exam.schoolId);
  revalidatePath("/exams");
  revalidatePath(`/exams/${examId}`);
}

export async function saveExamMarks(_: FormState, form: FormData): Promise<FormState> {
  try {
    const user = await actor(["OWNER", "PRINCIPAL", "TEACHER"]);
    const examId = String(form.get("examId"));
    const subjectId = String(form.get("subjectId"));
    const maxScore = z.coerce.number().positive("Max marks must be positive").parse(form.get("maxScore"));
    const [exam, subject] = await Promise.all([
      db.exam.findUnique({ where: { id: examId } }),
      db.subject.findUnique({ where: { id: subjectId }, include: { classRoom: { include: { students: { select: { id: true } } } } } }),
    ]);
    if (!exam || !subject || subject.classRoom.schoolId !== exam.schoolId || !canAccessSchool(user, exam.schoolId)) {
      throw new Error("Not allowed");
    }
    if (user.role === "TEACHER" && subject.teacherId !== user.id && subject.classRoom.teacherId !== user.id) {
      throw new Error("Only the subject teacher or class teacher can enter these marks");
    }
    const ops = subject.classRoom.students.flatMap((s) => {
      const raw = String(form.get(`score_${s.id}`) ?? "").trim();
      if (raw === "") return [];
      const score = Number(raw);
      if (!Number.isFinite(score) || score < 0 || score > maxScore) throw new Error(`Marks must be between 0 and ${maxScore}`);
      return [
        db.examMark.upsert({
          where: { examId_studentId_subjectId: { examId, studentId: s.id, subjectId } },
          update: { score, maxScore, enteredById: user.id },
          create: { examId, studentId: s.id, subjectId, score, maxScore, enteredById: user.id },
        }),
      ];
    });
    await db.$transaction(ops);
    revalidatePath(`/exams/${examId}`);
    return { ok: `Saved ${ops.length} marks for ${subject.name}.` };
  } catch (e) {
    return fail(e);
  }
}

export async function saveRemark(_: FormState, form: FormData): Promise<FormState> {
  try {
    const user = await actor(["OWNER", "PRINCIPAL", "TEACHER"]);
    const examId = String(form.get("examId"));
    const studentId = String(form.get("studentId"));
    const remark = String(form.get("remark") ?? "").trim();
    const student = await db.user.findUnique({ where: { id: studentId }, include: { classRoom: true } });
    if (!student || !(await canSeeStudent(user, studentId))) throw new Error("Not allowed");
    if (user.role === "TEACHER" && student.classRoom?.teacherId !== user.id) throw new Error("Only the class teacher writes the remark");
    if (remark) {
      await db.examRemark.upsert({
        where: { examId_studentId: { examId, studentId } },
        update: { remark },
        create: { examId, studentId, remark },
      });
    } else {
      await db.examRemark.deleteMany({ where: { examId, studentId } });
    }
    revalidatePath(`/exams/${examId}/report/${studentId}`);
    return { ok: "Remark saved." };
  } catch (e) {
    return fail(e);
  }
}
