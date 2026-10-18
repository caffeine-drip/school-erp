import { db } from "./db";
import type { CurrentUser } from "./auth";
import { audiencesFor, schoolIds } from "./access";

export function announcementsFor(user: CurrentUser, take?: number) {
  return db.announcement.findMany({
    where: {
      schoolId: { in: schoolIds(user) },
      OR: [{ audience: { in: [...audiencesFor(user)] } }, { authorId: user.id }],
    },
    include: { author: { select: { name: true, role: true } }, school: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take,
  });
}

export function classesFor(user: CurrentUser) {
  return db.classRoom.findMany({
    where: {
      schoolId: { in: schoolIds(user) },
      ...(user.role === "TEACHER" ? { teacherId: user.id } : {}),
    },
    include: { teacher: { select: { id: true, name: true } }, school: { select: { name: true } }, _count: { select: { students: true } } },
    orderBy: [{ name: "asc" }, { section: "asc" }],
  });
}

export function schoolsFor(user: CurrentUser) {
  return db.school.findMany({ where: { id: { in: schoolIds(user) } }, orderBy: { name: "asc" } });
}

export async function attendanceRate(studentIds: string[]) {
  if (studentIds.length === 0) return null;
  const [total, present] = await Promise.all([
    db.attendance.count({ where: { studentId: { in: studentIds } } }),
    db.attendance.count({ where: { studentId: { in: studentIds }, status: { in: ["PRESENT", "LATE"] } } }),
  ]);
  return total === 0 ? null : Math.round((present / total) * 100);
}

export function todayUTC() {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}
