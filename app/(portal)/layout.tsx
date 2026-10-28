import type { Role } from "@prisma/client";
import { logout } from "@/app/actions/auth";
import { Nav, type NavItem } from "@/components/Nav";
import { requireUser } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/roles";

const NAV: (NavItem & { roles: Role[] })[] = [
  { section: "Overview", href: "/dashboard", label: "Dashboard", roles: ["OWNER", "PRINCIPAL", "TEACHER", "STUDENT", "PARENT"] },
  { section: "Overview", href: "/announcements", label: "Announcements", roles: ["OWNER", "PRINCIPAL", "TEACHER", "STUDENT", "PARENT"] },
  { section: "People", href: "/schools", label: "Schools", roles: ["OWNER"] },
  { section: "People", href: "/people/principal", label: "Principals", roles: ["OWNER"] },
  { section: "People", href: "/people/teacher", label: "Teachers", roles: ["OWNER", "PRINCIPAL"] },
  { section: "People", href: "/people/student", label: "Students", roles: ["OWNER", "PRINCIPAL", "TEACHER"] },
  { section: "People", href: "/people/parent", label: "Parents", roles: ["OWNER", "PRINCIPAL", "TEACHER"] },
  { section: "People", href: "/admissions", label: "Admissions", roles: ["OWNER", "PRINCIPAL"] },
  { section: "Academics", href: "/classes", label: "Classes & subjects", roles: ["OWNER", "PRINCIPAL", "TEACHER"] },
  { section: "Academics", href: "/timetable", label: "Timetable", roles: ["OWNER", "PRINCIPAL", "TEACHER", "STUDENT", "PARENT"] },
  { section: "Academics", href: "/attendance", label: "Attendance", roles: ["OWNER", "PRINCIPAL", "TEACHER", "STUDENT", "PARENT"] },
  { section: "Academics", href: "/homework", label: "Homework", roles: ["OWNER", "PRINCIPAL", "TEACHER", "STUDENT", "PARENT"] },
  { section: "Academics", href: "/exams", label: "Exams & report cards", roles: ["OWNER", "PRINCIPAL", "TEACHER", "STUDENT", "PARENT"] },
  { section: "Academics", href: "/grades", label: "Class tests", roles: ["OWNER", "PRINCIPAL", "TEACHER", "STUDENT", "PARENT"] },
  { section: "Operations", href: "/fees", label: "Fees", roles: ["OWNER", "PRINCIPAL", "STUDENT", "PARENT"] },
  { section: "Operations", href: "/library", label: "Library", roles: ["OWNER", "PRINCIPAL", "TEACHER", "STUDENT", "PARENT"] },
  { section: "Operations", href: "/transport", label: "Transport", roles: ["OWNER", "PRINCIPAL", "TEACHER", "STUDENT", "PARENT"] },
  { section: "Operations", href: "/leave", label: "Staff leave", roles: ["OWNER", "PRINCIPAL", "TEACHER"] },
  { section: "Operations", href: "/audit", label: "Audit log", roles: ["OWNER", "PRINCIPAL"] },
  { section: "Account", href: "/profile", label: "My profile", roles: ["OWNER", "PRINCIPAL", "TEACHER", "STUDENT", "PARENT"] },
];

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const items = NAV.filter((n) => n.roles.includes(user.role)).map(({ roles: _roles, ...item }) => item);
  const schoolName =
    user.role === "OWNER"
      ? `${user.ownedSchools.length} school${user.ownedSchools.length === 1 ? "" : "s"}`
      : user.school?.name;

  return (
    <div className="min-h-screen lg:flex">
      <aside className="print:hidden border-b border-slate-200 bg-white p-4 lg:sticky lg:top-0 lg:h-screen lg:w-60 lg:overflow-y-auto lg:shrink-0 lg:border-b-0 lg:border-r">
        <div className="mb-4 px-3">
          <div className="text-base font-bold text-brand-700">School ERP</div>
          <div className="truncate text-xs text-slate-500">{schoolName}</div>
        </div>
        <Nav items={items} />
      </aside>
      <div className="flex-1">
        <header className="print:hidden flex items-center justify-end gap-3 border-b border-slate-200 bg-white px-6 py-3">
          <div className="text-right">
            <div className="text-sm font-medium">{user.name}</div>
            <div className="text-xs text-slate-500">{ROLE_LABEL[user.role]}</div>
          </div>
          <form action={logout}>
            <button className="btn-ghost">Sign out</button>
          </form>
        </header>
        <main className="mx-auto max-w-6xl p-6">{children}</main>
      </div>
    </div>
  );
}
