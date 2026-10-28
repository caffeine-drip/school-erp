"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { getCurrentUser, type CurrentUser } from "@/lib/auth";
import { canAccessSchool, canRecordFor, canTeachClass, schoolIds } from "@/lib/access";
import { audit } from "@/lib/audit";
import { canManage, ROLE_LABEL } from "@/lib/roles";
import type { FormState } from "./auth";

async function actor(roles?: Role[]) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not signed in");
  if (roles && !roles.includes(user.role)) throw new Error("Not allowed");
  return user;
}

// Loads a user the actor is allowed to manage, or throws.
async function manageable(user: CurrentUser, targetId: string) {
  const target = await db.user.findUnique({ where: { id: targetId } });
  if (!target || !canManage(user.role, target.role) || !target.schoolId || !canAccessSchool(user, target.schoolId)) {
    throw new Error("Not allowed");
  }
  return target;
}

function fail(e: unknown): FormState {
  if (e instanceof z.ZodError) return { error: e.issues[0]?.message ?? "Check the form." };
  if (e && typeof e === "object" && "code" in e && e.code === "P2002") {
    return { error: "That already exists (email or name must be unique)." };
  }
  return { error: e instanceof Error ? e.message : "Something went wrong." };
}

const optional = z
  .string()
  .trim()
  .transform((v) => v || undefined)
  .optional();

// ---------- Schools (owner) ----------

const SchoolSchema = z.object({ name: z.string().trim().min(2, "School name is required"), address: optional });

export async function createSchool(_: FormState, form: FormData): Promise<FormState> {
  try {
    const user = await actor(["OWNER"]);
    const data = SchoolSchema.parse(Object.fromEntries(form));
    const school = await db.school.create({ data: { ...data, ownerId: user.id } });
    await audit(user, "school.create", `Created school ${data.name}`, school.id);
    revalidatePath("/", "layout");
    return { ok: `Created ${data.name}.` };
  } catch (e) {
    return fail(e);
  }
}

// ---------- People ----------

const PersonSchema = z.object({
  role: z.enum(["PRINCIPAL", "TEACHER", "STUDENT", "PARENT"]),
  name: z.string().trim().min(2, "Name is required"),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  phone: optional,
  schoolId: z.string().min(1, "Choose a school"),
  classId: optional,
  rollNo: optional,
  childId: optional,
  relation: optional,
});

export async function createPerson(_: FormState, form: FormData): Promise<FormState> {
  try {
    const user = await actor();
    const data = PersonSchema.parse(Object.fromEntries(form));
    if (!canManage(user.role, data.role)) throw new Error(`You can't add ${ROLE_LABEL[data.role].toLowerCase()}s.`);
    if (!canAccessSchool(user, data.schoolId)) throw new Error("Not allowed for that school");

    if (data.classId) {
      const cls = await db.classRoom.findUnique({ where: { id: data.classId } });
      if (cls?.schoolId !== data.schoolId) throw new Error("That class is in a different school");
    }
    if (data.childId) {
      const child = await db.user.findUnique({ where: { id: data.childId } });
      if (child?.role !== "STUDENT" || child.schoolId !== data.schoolId) throw new Error("Pick a student from this school");
    }

    await audit(user, "user.create", `Added ${ROLE_LABEL[data.role].toLowerCase()} ${data.name} (${data.email})`, data.schoolId);
    await db.user.create({
      data: {
        role: data.role,
        name: data.name,
        email: data.email,
        phone: data.phone,
        passwordHash: await bcrypt.hash(data.password, 10),
        schoolId: data.schoolId,
        classId: data.role === "STUDENT" ? data.classId : undefined,
        rollNo: data.role === "STUDENT" ? data.rollNo : undefined,
        children:
          data.role === "PARENT" && data.childId
            ? { create: { studentId: data.childId, relation: data.relation ?? "Guardian" } }
            : undefined,
      },
    });
    revalidatePath("/", "layout");
    return { ok: `Added ${data.name}. They can sign in with ${data.email}.` };
  } catch (e) {
    return fail(e);
  }
}

export async function setActive(userId: string, active: boolean) {
  const user = await actor();
  const target = await manageable(user, userId);
  await db.user.update({ where: { id: userId }, data: { active } });
  await audit(user, active ? "user.enable" : "user.disable", `${active ? "Enabled" : "Disabled"} ${target.name}`, target.schoolId);
  revalidatePath("/", "layout");
}

const ResetSchema = z.object({ userId: z.string(), password: z.string().min(8, "Password must be at least 8 characters") });

export async function resetPassword(_: FormState, form: FormData): Promise<FormState> {
  try {
    const user = await actor();
    const data = ResetSchema.parse(Object.fromEntries(form));
    const target = await manageable(user, data.userId);
    await db.user.update({ where: { id: target.id }, data: { passwordHash: await bcrypt.hash(data.password, 10) } });
    await audit(user, "user.password_reset", `Reset password for ${target.name}`, target.schoolId);
    return { ok: `Password reset for ${target.name}.` };
  } catch (e) {
    return fail(e);
  }
}

const EditSchema = z.object({
  userId: z.string(),
  name: z.string().trim().min(2, "Name is required"),
  phone: optional,
  classId: optional,
  rollNo: optional,
});

export async function updatePerson(_: FormState, form: FormData): Promise<FormState> {
  try {
    const user = await actor();
    const data = EditSchema.parse(Object.fromEntries(form));
    const target = await manageable(user, data.userId);
    if (data.classId) {
      const cls = await db.classRoom.findUnique({ where: { id: data.classId } });
      if (cls?.schoolId !== target.schoolId) throw new Error("That class is in a different school");
    }
    await db.user.update({
      where: { id: target.id },
      data: {
        name: data.name,
        phone: data.phone ?? null,
        ...(target.role === "STUDENT" ? { classId: data.classId ?? null, rollNo: data.rollNo ?? null } : {}),
      },
    });
    revalidatePath("/", "layout");
    return { ok: "Saved." };
  } catch (e) {
    return fail(e);
  }
}

const LinkSchema = z.object({ parentId: z.string(), studentId: z.string().min(1, "Choose a student"), relation: optional });

export async function linkChild(_: FormState, form: FormData): Promise<FormState> {
  try {
    const user = await actor(["OWNER", "PRINCIPAL"]);
    const data = LinkSchema.parse(Object.fromEntries(form));
    const parent = await manageable(user, data.parentId);
    const student = await manageable(user, data.studentId);
    if (parent.role !== "PARENT" || student.role !== "STUDENT" || parent.schoolId !== student.schoolId) {
      throw new Error("Pick a parent and a student from the same school");
    }
    await db.parentLink.upsert({
      where: { parentId_studentId: { parentId: parent.id, studentId: student.id } },
      update: { relation: data.relation ?? "Guardian" },
      create: { parentId: parent.id, studentId: student.id, relation: data.relation ?? "Guardian" },
    });
    revalidatePath("/", "layout");
    return { ok: `Linked ${student.name}.` };
  } catch (e) {
    return fail(e);
  }
}

export async function unlinkChild(parentId: string, studentId: string) {
  const user = await actor(["OWNER", "PRINCIPAL"]);
  await manageable(user, parentId);
  await db.parentLink.delete({ where: { parentId_studentId: { parentId, studentId } } });
  revalidatePath("/", "layout");
}

// ---------- Classes ----------

const ClassSchema = z.object({
  schoolId: z.string().min(1, "Choose a school"),
  name: z.string().trim().min(1, "Class name is required"),
  section: z.string().trim().min(1).default("A"),
  teacherId: optional,
});

async function assertTeacherIn(teacherId: string | undefined, schoolId: string) {
  if (!teacherId) return;
  const t = await db.user.findUnique({ where: { id: teacherId } });
  if (t?.role !== "TEACHER" || t.schoolId !== schoolId) throw new Error("Pick a teacher from this school");
}

export async function createClass(_: FormState, form: FormData): Promise<FormState> {
  try {
    const user = await actor(["OWNER", "PRINCIPAL"]);
    const data = ClassSchema.parse(Object.fromEntries(form));
    if (!canAccessSchool(user, data.schoolId)) throw new Error("Not allowed for that school");
    await assertTeacherIn(data.teacherId, data.schoolId);
    await db.classRoom.create({ data });
    await audit(user, "class.create", `Created class ${data.name}-${data.section}`, data.schoolId);
    revalidatePath("/classes");
    return { ok: `Created class ${data.name}-${data.section}.` };
  } catch (e) {
    return fail(e);
  }
}

export async function assignTeacher(_: FormState, form: FormData): Promise<FormState> {
  try {
    const user = await actor(["OWNER", "PRINCIPAL"]);
    const classId = String(form.get("classId"));
    const teacherId = String(form.get("teacherId") || "") || undefined;
    const cls = await db.classRoom.findUnique({ where: { id: classId } });
    if (!cls || !canAccessSchool(user, cls.schoolId)) throw new Error("Not allowed");
    await assertTeacherIn(teacherId, cls.schoolId);
    await db.classRoom.update({ where: { id: classId }, data: { teacherId: teacherId ?? null } });
    revalidatePath("/classes");
    return { ok: "Class teacher updated." };
  } catch (e) {
    return fail(e);
  }
}

// ---------- Attendance & grades ----------

// Attendance is the class teacher's job; marks can also come from a subject teacher.
async function classForRecording(user: CurrentUser, classId: string, { classTeacherOnly = true } = {}) {
  const cls = await db.classRoom.findUnique({ where: { id: classId }, include: { students: { select: { id: true } } } });
  if (!cls || !canAccessSchool(user, cls.schoolId)) throw new Error("Not allowed");
  if (user.role === "TEACHER") {
    const allowed = classTeacherOnly ? cls.teacherId === user.id : await canTeachClass(user, cls.id);
    if (!allowed) throw new Error("Only the class teacher can record for this class");
  }
  return cls;
}

export async function saveAttendance(_: FormState, form: FormData): Promise<FormState> {
  try {
    const user = await actor(["OWNER", "PRINCIPAL", "TEACHER"]);
    const cls = await classForRecording(user, String(form.get("classId")));
    const date = z.coerce.date().parse(form.get("date"));
    const statuses = z.enum(["PRESENT", "ABSENT", "LATE"]);
    const ops = cls.students.flatMap((s) => {
      const raw = form.get(`status_${s.id}`);
      if (!raw) return [];
      const status = statuses.parse(raw);
      return [
        db.attendance.upsert({
          where: { studentId_date: { studentId: s.id, date } },
          update: { status, markedById: user.id },
          create: { studentId: s.id, date, status, markedById: user.id },
        }),
      ];
    });
    await db.$transaction(ops);
    revalidatePath(`/classes/${cls.id}`);
    revalidatePath("/attendance");
    return { ok: `Attendance saved for ${ops.length} students.` };
  } catch (e) {
    return fail(e);
  }
}

const GradeHeader = z.object({
  classId: z.string(),
  subject: z.string().trim().min(1, "Subject is required"),
  exam: z.string().trim().min(1, "Exam name is required"),
  maxScore: z.coerce.number().positive("Max score must be positive"),
});

export async function saveGrades(_: FormState, form: FormData): Promise<FormState> {
  try {
    const user = await actor(["OWNER", "PRINCIPAL", "TEACHER"]);
    const header = GradeHeader.parse(Object.fromEntries(form));
    const cls = await classForRecording(user, header.classId, { classTeacherOnly: false });
    const rows = cls.students.flatMap((s) => {
      const raw = String(form.get(`score_${s.id}`) ?? "").trim();
      if (raw === "") return [];
      const score = Number(raw);
      if (!Number.isFinite(score) || score < 0 || score > header.maxScore) {
        throw new Error(`Scores must be between 0 and ${header.maxScore}`);
      }
      return [{ studentId: s.id, score, subject: header.subject, exam: header.exam, maxScore: header.maxScore, gradedById: user.id }];
    });
    if (rows.length === 0) throw new Error("Enter at least one score");
    await db.grade.createMany({ data: rows });
    revalidatePath("/grades");
    return { ok: `Saved ${rows.length} scores for ${header.subject} (${header.exam}).` };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteGrade(gradeId: string) {
  const user = await actor(["OWNER", "PRINCIPAL", "TEACHER"]);
  const grade = await db.grade.findUnique({ where: { id: gradeId } });
  if (!grade || !(await canRecordFor(user, grade.studentId))) throw new Error("Not allowed");
  await db.grade.delete({ where: { id: gradeId } });
  revalidatePath("/grades");
}

// ---------- Fees ----------

const FeeSchema = z.object({
  target: z.string().min(1, "Choose who the fee is for"),
  title: z.string().trim().min(1, "Title is required"),
  amount: z.coerce.number().positive("Amount must be positive"),
  dueDate: z.coerce.date({ message: "Pick a due date" }),
});

export async function createFee(_: FormState, form: FormData): Promise<FormState> {
  try {
    const user = await actor(["OWNER", "PRINCIPAL"]);
    const data = FeeSchema.parse(Object.fromEntries(form));
    // target is "class:<id>" for a whole class or "student:<id>" for one student.
    const [kind, id] = data.target.split(":");
    let studentIds: string[];
    if (kind === "class") {
      const cls = await db.classRoom.findUnique({ where: { id }, include: { students: { select: { id: true } } } });
      if (!cls || !canAccessSchool(user, cls.schoolId)) throw new Error("Not allowed");
      studentIds = cls.students.map((s) => s.id);
    } else {
      const student = await manageable(user, id);
      if (student.role !== "STUDENT") throw new Error("Pick a student");
      studentIds = [student.id];
    }
    if (studentIds.length === 0) throw new Error("That class has no students yet");
    await db.fee.createMany({
      data: studentIds.map((studentId) => ({ studentId, title: data.title, amount: data.amount, dueDate: data.dueDate })),
    });
    revalidatePath("/fees");
    return { ok: `Created ${studentIds.length} fee record${studentIds.length === 1 ? "" : "s"}.` };
  } catch (e) {
    return fail(e);
  }
}

async function feeInScope(user: CurrentUser, feeId: string) {
  const fee = await db.fee.findUnique({ where: { id: feeId }, include: { student: true } });
  if (!fee?.student.schoolId || !canAccessSchool(user, fee.student.schoolId)) throw new Error("Not allowed");
  return fee;
}

const PaymentSchema = z.object({
  feeId: z.string(),
  mode: z.enum(["CASH", "UPI", "CARD", "BANK_TRANSFER", "CHEQUE"]),
  concession: z.coerce.number().min(0).default(0),
});

export async function recordPayment(_: FormState, form: FormData): Promise<FormState> {
  let paid = false;
  let data: z.infer<typeof PaymentSchema>;
  try {
    const user = await actor(["OWNER", "PRINCIPAL"]);
    data = PaymentSchema.parse(Object.fromEntries(form));
    const fee = await feeInScope(user, data.feeId);
    if (fee.status === "PAID") throw new Error("Already paid");
    if (data.concession > fee.amount) throw new Error("Concession can't be more than the fee");
    const year = new Date().getFullYear();
    // Receipt numbers run per year; retry if two payments race for the same number.
    for (let attempt = 0; attempt < 3; attempt++) {
      const count = await db.fee.count({ where: { receiptNo: { startsWith: `R${year}-` } } });
      const receiptNo = `R${year}-${String(count + 1 + attempt).padStart(5, "0")}`;
      try {
        await db.fee.update({
          where: { id: fee.id },
          data: { status: "PAID", paidAt: new Date(), paymentMode: data.mode, concession: data.concession, receiptNo },
        });
        await audit(user, "fee.paid", `Recorded ${receiptNo} for ${fee.student.name}: ${fee.title}`, fee.student.schoolId);
        revalidatePath("/fees");
        paid = true;
        break;
      } catch (e) {
        if (!(e && typeof e === "object" && "code" in e && e.code === "P2002")) throw e;
      }
    }
    if (!paid) throw new Error("Couldn't allocate a receipt number, try again");
  } catch (e) {
    return fail(e);
  }
  redirect(`/fees/${data.feeId}/receipt`);
}

export async function undoPayment(feeId: string) {
  const user = await actor(["OWNER", "PRINCIPAL"]);
  const fee = await feeInScope(user, feeId);
  await db.fee.update({ where: { id: fee.id }, data: { status: "UNPAID", paidAt: null, paymentMode: null, receiptNo: null } });
  await audit(user, "fee.unpaid", `Reversed payment ${fee.receiptNo ?? ""} for ${fee.student.name}: ${fee.title}`, fee.student.schoolId);
  revalidatePath("/fees");
}

// ---------- Announcements ----------

const AnnouncementSchema = z.object({
  schoolId: z.string().min(1, "Choose a school"),
  title: z.string().trim().min(1, "Title is required"),
  body: z.string().trim().min(1, "Message is required"),
  audience: z.enum(["EVERYONE", "STAFF", "STUDENTS", "PARENTS"]),
});

export async function createAnnouncement(_: FormState, form: FormData): Promise<FormState> {
  try {
    const user = await actor(["OWNER", "PRINCIPAL", "TEACHER"]);
    const data = AnnouncementSchema.parse(Object.fromEntries(form));
    if (!canAccessSchool(user, data.schoolId)) throw new Error("Not allowed for that school");
    await db.announcement.create({ data: { ...data, authorId: user.id } });
    await audit(user, "announcement.create", `Posted "${data.title}" to ${data.audience.toLowerCase()}`, data.schoolId);
    revalidatePath("/announcements");
    revalidatePath("/dashboard");
    return { ok: "Announcement posted." };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteAnnouncement(id: string) {
  const user = await actor(["OWNER", "PRINCIPAL", "TEACHER"]);
  const a = await db.announcement.findUnique({ where: { id } });
  const allowed = a && (a.authorId === user.id || (user.role !== "TEACHER" && schoolIds(user).includes(a.schoolId)));
  if (!allowed) throw new Error("Not allowed");
  await db.announcement.delete({ where: { id } });
  revalidatePath("/announcements");
  revalidatePath("/dashboard");
}

// ---------- Own profile ----------

const PasswordSchema = z
  .object({ current: z.string().min(1), next: z.string().min(8, "New password must be at least 8 characters"), confirm: z.string() })
  .refine((d) => d.next === d.confirm, { message: "New passwords don't match" });

export async function changePassword(_: FormState, form: FormData): Promise<FormState> {
  try {
    const user = await actor();
    const data = PasswordSchema.parse(Object.fromEntries(form));
    if (!(await bcrypt.compare(data.current, user.passwordHash))) throw new Error("Current password is incorrect");
    await db.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(data.next, 10) } });
    return { ok: "Password changed." };
  } catch (e) {
    return fail(e);
  }
}
