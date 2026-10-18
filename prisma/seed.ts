// Creates the first owner account. Set SEED_DEMO=1 to also load a demo school.
//   OWNER_EMAIL=you@example.com OWNER_PASSWORD='...' npm run db:seed
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const hash = (p: string) => bcrypt.hash(p, 10);

async function main() {
  const email = (process.env.OWNER_EMAIL ?? "owner@demo.school").toLowerCase();
  const password = process.env.OWNER_PASSWORD ?? "password123";
  const owner = await db.user.upsert({
    where: { email },
    update: {},
    create: { email, name: process.env.OWNER_NAME ?? "School Owner", role: "OWNER", passwordHash: await hash(password) },
  });
  console.log(`Owner ready: ${email}`);

  if (process.env.SEED_DEMO !== "1") return;
  if (await db.school.findFirst({ where: { ownerId: owner.id, name: "Greenwood Public School" } })) {
    console.log("Demo school already exists");
    return;
  }

  const demo = await hash("password123");
  const school = await db.school.create({ data: { name: "Greenwood Public School", address: "12 Park Road", ownerId: owner.id } });
  const person = (role: "PRINCIPAL" | "TEACHER" | "STUDENT" | "PARENT", name: string, email: string, extra = {}) =>
    db.user.create({ data: { role, name, email, passwordHash: demo, schoolId: school.id, ...extra } });

  await person("PRINCIPAL", "Meera Kapoor", "principal@demo.school");
  const t1 = await person("TEACHER", "Rahul Sen", "teacher@demo.school");
  const t2 = await person("TEACHER", "Priya Nair", "teacher2@demo.school");
  const c5 = await db.classRoom.create({ data: { name: "Grade 5", section: "A", schoolId: school.id, teacherId: t1.id } });
  const c6 = await db.classRoom.create({ data: { name: "Grade 6", section: "A", schoolId: school.id, teacherId: t2.id } });

  const names = ["Aarav Shah", "Diya Patel", "Kabir Rao", "Ananya Iyer", "Vihaan Das", "Isha Menon"];
  const students = [];
  for (const [i, name] of names.entries()) {
    const email = i === 0 ? "student@demo.school" : `student${i + 1}@demo.school`;
    students.push(await person("STUDENT", name, email, { classId: i < 3 ? c5.id : c6.id, rollNo: String((i % 3) + 1) }));
  }
  await person("PARENT", "Nikhil Shah", "parent@demo.school", {
    children: { create: [{ studentId: students[0].id, relation: "Father" }, { studentId: students[3].id, relation: "Father" }] },
  });

  const today = new Date();
  for (let d = 1; d <= 5; d++) {
    const date = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate() - d));
    for (const [i, s] of students.entries()) {
      await db.attendance.create({
        data: { date, studentId: s.id, status: (i + d) % 7 === 0 ? "ABSENT" : "PRESENT", markedById: s.classId === c5.id ? t1.id : t2.id },
      });
    }
  }
  for (const [i, s] of students.entries()) {
    const by = s.classId === c5.id ? t1.id : t2.id;
    await db.grade.createMany({
      data: [
        { studentId: s.id, subject: "Maths", exam: "Unit test 1", score: 60 + ((i * 7) % 40), gradedById: by },
        { studentId: s.id, subject: "English", exam: "Unit test 1", score: 55 + ((i * 11) % 45), gradedById: by },
      ],
    });
    await db.fee.create({
      data: { studentId: s.id, title: "Term 1 tuition", amount: 15000, dueDate: new Date(Date.UTC(today.getFullYear(), today.getMonth() + 1, 1)), status: i % 2 ? "PAID" : "UNPAID", paidAt: i % 2 ? today : null },
    });
  }
  await db.announcement.create({
    data: { schoolId: school.id, authorId: owner.id, title: "Welcome to the new portal", body: "Everyone can now sign in to see attendance, marks, fees and news in one place.", audience: "EVERYONE" },
  });
  console.log("Demo school loaded. Every demo account uses password123.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
