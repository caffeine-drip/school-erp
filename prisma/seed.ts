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
  // Subjects and a timetable
  const subjectNames = ["English", "Maths", "Science", "Social Studies", "Hindi"];
  for (const cls of [c5, c6]) {
    const subs = [];
    for (const [i, name] of subjectNames.entries()) {
      subs.push(await db.subject.create({ data: { name, classId: cls.id, teacherId: i % 2 === 0 ? t1.id : t2.id } }));
    }
    const slots = [];
    for (let day = 1; day <= 6; day++) {
      for (let period = 1; period <= (day === 6 ? 4 : 6); period++) {
        slots.push({ classId: cls.id, day, period, subjectId: subs[(day + period) % subs.length].id });
      }
    }
    await db.timetableSlot.createMany({ data: slots });

    // An exam with marks for every subject
    const exam = (await db.exam.findFirst({ where: { schoolId: school.id } })) ??
      (await db.exam.create({ data: { schoolId: school.id, name: "Half-yearly examination", term: "Term 1", published: true } }));
    const roster = students.filter((s) => s.classId === cls.id);
    for (const [i, st] of roster.entries()) {
      await db.examMark.createMany({
        data: subs.map((sub, j) => ({ examId: exam.id, studentId: st.id, subjectId: sub.id, score: 50 + ((i * 13 + j * 7) % 50), maxScore: 100, enteredById: sub.teacherId! })),
      });
    }
    const hw = await db.homework.create({
      data: {
        classId: cls.id,
        subjectId: subs[1].id,
        title: "Fractions worksheet",
        details: "Solve questions 1 to 10 on page 42. Show your working.",
        dueDate: new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate() + 3)),
        maxScore: 10,
        createdById: subs[1].teacherId!,
      },
    });
    await db.submission.create({ data: { homeworkId: hw.id, studentId: roster[1].id, content: "1) 3/4 2) 5/8 …" } });
  }

  // Admissions pipeline
  await db.enquiry.createMany({
    data: [
      { schoolId: school.id, studentName: "Riya Kulkarni", gradeApplied: "Grade 5", parentName: "Sunita Kulkarni", parentEmail: "sunita@example.com", parentPhone: "9800000001", source: "Website" },
      { schoolId: school.id, studentName: "Arjun Bose", gradeApplied: "Grade 6", parentName: "Amit Bose", parentEmail: "amit@example.com", parentPhone: "9800000002", source: "Friend", stage: "TEST" },
      { schoolId: school.id, studentName: "Sara Khan", gradeApplied: "Grade 5", parentName: "Imran Khan", parentEmail: "imran@example.com", parentPhone: "9800000003", stage: "OFFERED" },
    ],
  });

  // Library, transport and leave
  const books = await Promise.all(
    [
      ["Wings of Fire", "A. P. J. Abdul Kalam", "Biography"],
      ["The Jungle Book", "Rudyard Kipling", "Fiction"],
      ["Malgudi Days", "R. K. Narayan", "Fiction"],
    ].map(([title, author, category]) => db.book.create({ data: { schoolId: school.id, title, author, category, copies: 3 } })),
  );
  await db.bookIssue.create({
    data: { bookId: books[0].id, memberId: students[0].id, issuedById: owner.id, dueDate: new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate() - 2)) },
  });
  const route = await db.route.create({
    data: { schoolId: school.id, name: "Route 1: North", vehicleNo: "KA-01-AB-1234", driverName: "Ramesh", driverPhone: "9811111111", stops: "Lake View\nMarket Square\nStation Road" },
  });
  await db.user.update({ where: { id: students[0].id }, data: { routeId: route.id, stop: "Market Square" } });
  await db.leave.create({
    data: { userId: t2.id, type: "Sick", reason: "Fever", fromDate: new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate() + 1)), toDate: new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate() + 2)) },
  });

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
