"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { canAccessSchool, canSeeStudent } from "@/lib/access";
import { audit } from "@/lib/audit";
import type { FormState } from "./auth";
import { actor, fail, optional } from "./shared";

// ---------- Admissions ----------

const EnquirySchema = z.object({
  schoolId: z.string().min(1, "Choose a school"),
  studentName: z.string().trim().min(2, "Student name is required"),
  dateOfBirth: z.preprocess((v) => (v === "" ? undefined : v), z.coerce.date().optional()),
  gradeApplied: z.string().trim().min(1, "Which class are you applying for?"),
  parentName: z.string().trim().min(2, "Parent name is required"),
  parentEmail: z.string().trim().toLowerCase().email("Enter a valid email"),
  parentPhone: z.string().trim().min(6, "Enter a phone number"),
  source: optional,
  notes: optional,
});

// Public: anyone can submit an enquiry from /apply.
export async function submitEnquiry(_: FormState, form: FormData): Promise<FormState> {
  try {
    const data = EnquirySchema.parse(Object.fromEntries(form));
    const school = await db.school.findUnique({ where: { id: data.schoolId } });
    if (!school) throw new Error("Choose a school");
    await db.enquiry.create({ data: { ...data, stage: "ENQUIRY" } });
    return { ok: `Thank you. ${school.name} has your enquiry and will contact you at ${data.parentEmail}.` };
  } catch (e) {
    return fail(e);
  }
}

// Staff can also log walk-in or phone enquiries.
export async function addEnquiry(prev: FormState, form: FormData): Promise<FormState> {
  try {
    const user = await actor(["OWNER", "PRINCIPAL"]);
    if (!canAccessSchool(user, String(form.get("schoolId")))) throw new Error("Not allowed for that school");
    const result = await submitEnquiry(prev, form);
    if (result?.ok) {
      revalidatePath("/admissions");
      return { ok: "Enquiry added." };
    }
    return result;
  } catch (e) {
    return fail(e);
  }
}

const STAGES = ["ENQUIRY", "APPLIED", "TEST", "OFFERED", "REJECTED"] as const;

export async function moveEnquiry(id: string, stage: (typeof STAGES)[number]) {
  const user = await actor(["OWNER", "PRINCIPAL"]);
  const enquiry = await db.enquiry.findUnique({ where: { id } });
  if (!enquiry || !canAccessSchool(user, enquiry.schoolId) || enquiry.stage === "ADMITTED") throw new Error("Not allowed");
  await db.enquiry.update({ where: { id }, data: { stage: z.enum(STAGES).parse(stage) } });
  await audit(user, "admission.stage", `Moved ${enquiry.studentName} to ${stage.toLowerCase()}`, enquiry.schoolId);
  revalidatePath("/admissions");
}

const AdmitSchema = z.object({
  enquiryId: z.string(),
  studentEmail: z.string().trim().toLowerCase().email("Enter the student's login email"),
  password: z.string().min(8, "Temporary password must be at least 8 characters"),
  classId: optional,
  rollNo: optional,
  relation: optional,
});

// Turns an enquiry into a student account, and links (or creates) the parent's account.
export async function admitEnquiry(_: FormState, form: FormData): Promise<FormState> {
  let data: z.infer<typeof AdmitSchema>;
  try {
    const user = await actor(["OWNER", "PRINCIPAL"]);
    data = AdmitSchema.parse(Object.fromEntries(form));
    const enquiry = await db.enquiry.findUnique({ where: { id: data.enquiryId } });
    if (!enquiry || !canAccessSchool(user, enquiry.schoolId)) throw new Error("Not allowed");
    if (enquiry.stage === "ADMITTED") throw new Error("Already admitted");
    if (data.classId) {
      const cls = await db.classRoom.findUnique({ where: { id: data.classId } });
      if (cls?.schoolId !== enquiry.schoolId) throw new Error("Pick a class in this school");
    }
    const existingParent = await db.user.findUnique({ where: { email: enquiry.parentEmail } });
    if (existingParent && (existingParent.role !== "PARENT" || existingParent.schoolId !== enquiry.schoolId)) {
      throw new Error("The parent's email is already used by another account");
    }
    const passwordHash = await bcrypt.hash(data.password, 10);

    await db.$transaction(async (tx) => {
      const student = await tx.user.create({
        data: {
          role: "STUDENT",
          name: enquiry.studentName,
          email: data.studentEmail,
          passwordHash,
          schoolId: enquiry.schoolId,
          classId: data.classId,
          rollNo: data.rollNo,
        },
      });
      const parent =
        existingParent ??
        (await tx.user.create({
          data: {
            role: "PARENT",
            name: enquiry.parentName,
            email: enquiry.parentEmail,
            phone: enquiry.parentPhone,
            passwordHash,
            schoolId: enquiry.schoolId,
          },
        }));
      await tx.parentLink.create({ data: { parentId: parent.id, studentId: student.id, relation: data.relation ?? "Guardian" } });
      await tx.enquiry.update({ where: { id: enquiry.id }, data: { stage: "ADMITTED", studentId: student.id } });
    });
    await audit(user, "admission.admit", `Admitted ${enquiry.studentName}`, enquiry.schoolId);
    revalidatePath("/admissions");
  } catch (e) {
    return fail(e);
  }
  // The enquiry leaves the current tab once admitted, so show it on the Admitted tab.
  redirect(`/admissions?stage=ADMITTED&admitted=${data.enquiryId}`);
}

// ---------- Leave ----------

const LeaveSchema = z
  .object({
    fromDate: z.coerce.date({ message: "Pick a start date" }),
    toDate: z.coerce.date({ message: "Pick an end date" }),
    type: z.enum(["Casual", "Sick", "Earned", "Unpaid", "Other"]),
    reason: z.string().trim().min(3, "Give a reason"),
  })
  .refine((d) => d.toDate >= d.fromDate, { message: "End date is before the start date" });

export async function applyLeave(_: FormState, form: FormData): Promise<FormState> {
  try {
    const user = await actor(["PRINCIPAL", "TEACHER"]);
    const data = LeaveSchema.parse(Object.fromEntries(form));
    await db.leave.create({ data: { ...data, userId: user.id } });
    revalidatePath("/leave");
    return { ok: "Leave request sent." };
  } catch (e) {
    return fail(e);
  }
}

// Principals review teachers' leave; owners review principals' leave.
export async function reviewLeave(id: string, status: "APPROVED" | "REJECTED") {
  const user = await actor(["OWNER", "PRINCIPAL"]);
  const leave = await db.leave.findUnique({ where: { id }, include: { user: true } });
  const reviewable = user.role === "OWNER" ? leave?.user.role === "PRINCIPAL" || leave?.user.role === "TEACHER" : leave?.user.role === "TEACHER";
  if (!leave || !reviewable || !leave.user.schoolId || !canAccessSchool(user, leave.user.schoolId)) throw new Error("Not allowed");
  await db.leave.update({ where: { id }, data: { status: z.enum(["APPROVED", "REJECTED"]).parse(status), reviewedById: user.id } });
  await audit(user, "leave.review", `${status === "APPROVED" ? "Approved" : "Rejected"} leave for ${leave.user.name}`, leave.user.schoolId);
  revalidatePath("/leave");
}

export async function cancelLeave(id: string) {
  const user = await actor();
  const leave = await db.leave.findUnique({ where: { id } });
  if (!leave || leave.userId !== user.id || leave.status !== "PENDING") throw new Error("Not allowed");
  await db.leave.delete({ where: { id } });
  revalidatePath("/leave");
}

// ---------- Library ----------

const BookSchema = z.object({
  schoolId: z.string().min(1, "Choose a school"),
  title: z.string().trim().min(1, "Title is required"),
  author: z.string().trim().min(1, "Author is required"),
  isbn: optional,
  category: optional,
  copies: z.coerce.number().int().min(1, "At least one copy"),
});

export async function addBook(_: FormState, form: FormData): Promise<FormState> {
  try {
    const user = await actor(["OWNER", "PRINCIPAL"]);
    const data = BookSchema.parse(Object.fromEntries(form));
    if (!canAccessSchool(user, data.schoolId)) throw new Error("Not allowed for that school");
    await db.book.create({ data });
    revalidatePath("/library");
    return { ok: `Added ${data.title}.` };
  } catch (e) {
    return fail(e);
  }
}

const IssueSchema = z.object({
  bookId: z.string().min(1, "Choose a book"),
  memberEmail: z.string().trim().toLowerCase().email("Enter the borrower's email"),
  dueDate: z.coerce.date({ message: "Pick a due date" }),
});

export async function issueBook(_: FormState, form: FormData): Promise<FormState> {
  try {
    const user = await actor(["OWNER", "PRINCIPAL"]);
    const data = IssueSchema.parse(Object.fromEntries(form));
    const [book, member] = await Promise.all([
      db.book.findUnique({ where: { id: data.bookId }, include: { _count: { select: { issues: { where: { returnedAt: null } } } } } }),
      db.user.findUnique({ where: { email: data.memberEmail } }),
    ]);
    if (!book || !canAccessSchool(user, book.schoolId)) throw new Error("Not allowed");
    if (!member || member.schoolId !== book.schoolId || !member.active) throw new Error("No active member with that email in this school");
    if (book._count.issues >= book.copies) throw new Error("No copies left on the shelf");
    await db.bookIssue.create({ data: { bookId: book.id, memberId: member.id, issuedById: user.id, dueDate: data.dueDate } });
    revalidatePath("/library");
    return { ok: `Issued ${book.title} to ${member.name}.` };
  } catch (e) {
    return fail(e);
  }
}

const FINE_PER_DAY = Number(process.env.LIBRARY_FINE_PER_DAY ?? 5);

export async function returnBook(issueId: string) {
  const user = await actor(["OWNER", "PRINCIPAL"]);
  const issue = await db.bookIssue.findUnique({ where: { id: issueId }, include: { book: true } });
  if (!issue || issue.returnedAt || !canAccessSchool(user, issue.book.schoolId)) throw new Error("Not allowed");
  const now = new Date();
  const lateDays = Math.max(0, Math.floor((now.getTime() - issue.dueDate.getTime()) / 86_400_000));
  await db.bookIssue.update({ where: { id: issueId }, data: { returnedAt: now, fine: lateDays * FINE_PER_DAY } });
  revalidatePath("/library");
}

// ---------- Transport ----------

const RouteSchema = z.object({
  schoolId: z.string().min(1, "Choose a school"),
  name: z.string().trim().min(1, "Route name is required"),
  vehicleNo: z.string().trim().min(1, "Vehicle number is required"),
  driverName: z.string().trim().min(1, "Driver name is required"),
  driverPhone: z.string().trim().min(6, "Driver phone is required"),
  stops: z.string().trim().min(1, "List at least one stop"),
});

export async function addRoute(_: FormState, form: FormData): Promise<FormState> {
  try {
    const user = await actor(["OWNER", "PRINCIPAL"]);
    const data = RouteSchema.parse(Object.fromEntries(form));
    if (!canAccessSchool(user, data.schoolId)) throw new Error("Not allowed for that school");
    await db.route.create({ data });
    await audit(user, "route.create", `Added route ${data.name}`, data.schoolId);
    revalidatePath("/transport");
    return { ok: `Added ${data.name}.` };
  } catch (e) {
    return fail(e);
  }
}

const AssignSchema = z.object({ studentId: z.string().min(1, "Choose a student"), routeId: z.string().min(1), stop: z.string().trim().min(1, "Choose a stop") });

export async function assignRoute(_: FormState, form: FormData): Promise<FormState> {
  try {
    const user = await actor(["OWNER", "PRINCIPAL"]);
    const data = AssignSchema.parse(Object.fromEntries(form));
    const [route, student] = await Promise.all([
      db.route.findUnique({ where: { id: data.routeId } }),
      db.user.findUnique({ where: { id: data.studentId } }),
    ]);
    if (!route || !canAccessSchool(user, route.schoolId) || student?.role !== "STUDENT" || student.schoolId !== route.schoolId) {
      throw new Error("Pick a student and a route in the same school");
    }
    if (!(await canSeeStudent(user, student.id))) throw new Error("Not allowed");
    await db.user.update({ where: { id: student.id }, data: { routeId: route.id, stop: data.stop } });
    revalidatePath("/transport");
    return { ok: `${student.name} rides ${route.name} from ${data.stop}.` };
  } catch (e) {
    return fail(e);
  }
}

export async function removeRider(studentId: string) {
  const user = await actor(["OWNER", "PRINCIPAL"]);
  const student = await db.user.findUnique({ where: { id: studentId } });
  if (!student?.schoolId || !canAccessSchool(user, student.schoolId)) throw new Error("Not allowed");
  await db.user.update({ where: { id: studentId }, data: { routeId: null, stop: null } });
  revalidatePath("/transport");
}
