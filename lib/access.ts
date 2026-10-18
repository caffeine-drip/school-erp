import type { Prisma } from "@prisma/client";
import { db } from "./db";
import type { CurrentUser } from "./auth";

// Schools the user can see. Owners see every school they own; everyone else sees their own.
export function schoolIds(user: CurrentUser): string[] {
  if (user.role === "OWNER") return user.ownedSchools.map((s) => s.id);
  return user.schoolId ? [user.schoolId] : [];
}

export function canAccessSchool(user: CurrentUser, schoolId: string) {
  return schoolIds(user).includes(schoolId);
}

// A Prisma filter selecting the students this user may see.
export function visibleStudentsWhere(user: CurrentUser): Prisma.UserWhereInput {
  const base: Prisma.UserWhereInput = { role: "STUDENT", schoolId: { in: schoolIds(user) } };
  switch (user.role) {
    case "OWNER":
    case "PRINCIPAL":
      return base;
    case "TEACHER":
      return { ...base, classRoom: { teacherId: user.id } };
    case "STUDENT":
      return { ...base, id: user.id };
    case "PARENT":
      return { ...base, parents: { some: { parentId: user.id } } };
  }
}

export async function visibleStudentIds(user: CurrentUser) {
  const rows = await db.user.findMany({ where: visibleStudentsWhere(user), select: { id: true } });
  return rows.map((r) => r.id);
}

export async function canSeeStudent(user: CurrentUser, studentId: string) {
  const count = await db.user.count({ where: { AND: [visibleStudentsWhere(user), { id: studentId }] } });
  return count > 0;
}

// Teachers may mark attendance and grades for students in classes they teach;
// principals and owners may do it for any student in their schools.
export async function canRecordFor(user: CurrentUser, studentId: string) {
  if (user.role === "STUDENT" || user.role === "PARENT") return false;
  return canSeeStudent(user, studentId);
}

export function audiencesFor(user: CurrentUser) {
  switch (user.role) {
    case "OWNER":
    case "PRINCIPAL":
      return ["EVERYONE", "STAFF", "STUDENTS", "PARENTS"] as const;
    case "TEACHER":
      return ["EVERYONE", "STAFF"] as const;
    case "STUDENT":
      return ["EVERYONE", "STUDENTS"] as const;
    case "PARENT":
      return ["EVERYONE", "PARENTS"] as const;
  }
}
