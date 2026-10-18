import type { Role } from "@prisma/client";
import { logout } from "@/app/actions/auth";
import { Nav, type NavItem } from "@/components/Nav";
import { requireUser } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/roles";

const NAV: (NavItem & { roles: Role[] })[] = [
  { href: "/dashboard", label: "Dashboard", roles: ["OWNER", "PRINCIPAL", "TEACHER", "STUDENT", "PARENT"] },
  { href: "/schools", label: "Schools", roles: ["OWNER"] },
  { href: "/people/principal", label: "Principals", roles: ["OWNER"] },
  { href: "/people/teacher", label: "Teachers", roles: ["OWNER", "PRINCIPAL"] },
  { href: "/people/student", label: "Students", roles: ["OWNER", "PRINCIPAL", "TEACHER"] },
  { href: "/people/parent", label: "Parents", roles: ["OWNER", "PRINCIPAL", "TEACHER"] },
  { href: "/classes", label: "Classes", roles: ["OWNER", "PRINCIPAL", "TEACHER"] },
  { href: "/attendance", label: "Attendance", roles: ["OWNER", "PRINCIPAL", "TEACHER", "STUDENT", "PARENT"] },
  { href: "/grades", label: "Grades", roles: ["OWNER", "PRINCIPAL", "TEACHER", "STUDENT", "PARENT"] },
  { href: "/fees", label: "Fees", roles: ["OWNER", "PRINCIPAL", "STUDENT", "PARENT"] },
  { href: "/announcements", label: "Announcements", roles: ["OWNER", "PRINCIPAL", "TEACHER", "STUDENT", "PARENT"] },
  { href: "/profile", label: "My profile", roles: ["OWNER", "PRINCIPAL", "TEACHER", "STUDENT", "PARENT"] },
];

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const items = NAV.filter((n) => n.roles.includes(user.role)).map(({ href, label }) => ({ href, label }));
  const schoolName =
    user.role === "OWNER"
      ? `${user.ownedSchools.length} school${user.ownedSchools.length === 1 ? "" : "s"}`
      : user.school?.name;

  return (
    <div className="min-h-screen lg:flex">
      <aside className="border-b border-slate-200 bg-white p-4 lg:sticky lg:top-0 lg:h-screen lg:w-60 lg:shrink-0 lg:border-b-0 lg:border-r">
        <div className="mb-4 px-3">
          <div className="text-base font-bold text-brand-700">School ERP</div>
          <div className="truncate text-xs text-slate-500">{schoolName}</div>
        </div>
        <Nav items={items} />
      </aside>
      <div className="flex-1">
        <header className="flex items-center justify-end gap-3 border-b border-slate-200 bg-white px-6 py-3">
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
