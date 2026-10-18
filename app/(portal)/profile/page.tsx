import { changePassword } from "@/app/actions/manage";
import { ActionForm } from "@/components/ActionForm";
import { SubmitButton } from "@/components/SubmitButton";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/roles";

export default async function ProfilePage() {
  const user = await requireUser();
  return (
    <>
      <PageHeader title="My profile" />
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card">
          <dl className="space-y-3 text-sm">
            <Row label="Name" value={user.name} />
            <Row label="Email" value={user.email} />
            <Row label="Role" value={ROLE_LABEL[user.role]} />
            <Row label="School" value={user.role === "OWNER" ? user.ownedSchools.map((s) => s.name).join(", ") || "—" : user.school?.name ?? "—"} />
            <Row label="Phone" value={user.phone ?? "—"} />
          </dl>
        </section>
        <section className="card">
          <h2 className="mb-3 font-semibold">Change password</h2>
          <ActionForm action={changePassword} className="space-y-3">
            <input name="current" type="password" required placeholder="Current password" className="input" />
            <input name="next" type="password" required minLength={8} placeholder="New password" className="input" />
            <input name="confirm" type="password" required minLength={8} placeholder="Repeat new password" className="input" />
            <SubmitButton>Change password</SubmitButton>
          </ActionForm>
        </section>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-slate-100 pb-2">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
