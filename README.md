# School ERP

One web portal for a school group. Everyone signs in at the same address and sees a dashboard for their role:

| Role | Can see | Can manage |
| --- | --- | --- |
| **Owner** | Every school they own and everyone in them | Schools, principals, teachers, students, parents, classes, fees, announcements |
| **Principal** | Their school | Teachers, students, parents, classes, fees, announcements |
| **Teacher** | Their classes, those students and their parents | Attendance and marks for their classes, announcements |
| **Student** | Their own attendance, marks, fees, announcements | Their password |
| **Parent** | Each linked child's attendance, marks, fees, announcements | Their password |

## Modules

- **People:** schools, principals, teachers, students, parents, parent–child links, enable/disable, password resets
- **Admissions:** public enquiry form at `/apply`, stage pipeline (Enquiry → Applied → Test → Offered → Admitted / Rejected), one-click admit that creates the student and parent accounts
- **Academics:** classes with subjects and subject teachers, weekly timetable, attendance, homework with submissions and feedback, class tests, exams with marks per subject and printable report cards (CBSE-style grade bands, class teacher remark), publish/unpublish results
- **Fees:** fees per class or student, concessions, payment mode, sequential receipt numbers, printable receipts
- **Operations:** library (catalogue, issue, return, overdue fines), transport (routes, stops, vehicle and driver, riders), staff leave (apply, approve, reject)
- **Oversight:** dashboards per role and an audit log of changes

Built with Next.js 15 (App Router, server actions), TypeScript, Tailwind CSS, Prisma and PostgreSQL. Sessions are signed HTTP-only cookies; passwords are hashed with bcrypt. Every server action re-checks the signed-in user's role and school before it reads or writes.

## Run locally

```bash
cp .env.example .env            # point DATABASE_URL at a Postgres database
npm install
npx prisma migrate deploy       # create the tables
SEED_DEMO=1 npm run db:seed     # owner@demo.school / password123 plus a demo school
npm run dev                     # http://localhost:3000
```

Demo accounts (all `password123`): `owner@`, `principal@`, `teacher@`, `student@`, `parent@demo.school`.

## Deploy to Vercel with a custom domain

1. **Import the repo.** In Vercel choose *Add New → Project* and import this GitHub repository. Leave the build settings on their defaults; the `vercel-build` script generates the Prisma client, applies migrations and builds.
2. **Add a database.** In the project's *Storage* tab, create a **Neon Postgres** database and connect it. Vercel adds `DATABASE_URL` for you.
3. **Set environment variables** under *Settings → Environment Variables*:
   - `SESSION_SECRET`: a random string of at least 32 characters (`openssl rand -base64 48`).
   - `CURRENCY` (optional): fee currency code, `INR` by default.
   - `LIBRARY_FINE_PER_DAY` (optional): fine per late day, `5` by default.
   - `PERIODS_PER_DAY` (optional): timetable periods, `8` by default.
4. **Deploy.** Then create the first owner account once, from your machine, against the production database:
   ```bash
   DATABASE_URL="<the Neon URL>" OWNER_EMAIL=you@yourschool.com OWNER_PASSWORD='a-strong-password' OWNER_NAME="Your Name" npm run db:seed
   ```
   Sign in, add a school, then add its principal. Everything else can be done from the portal.
5. **Connect the domain.** In *Settings → Domains* add your domain (for example `erp.yourschool.com`). Vercel shows the DNS record to create at your registrar: usually a `CNAME` for a subdomain or an `A` record for the bare domain. Once DNS propagates, Vercel issues the HTTPS certificate automatically.

`GET /api/health` returns `{ "ok": true }` when the app can reach the database.
