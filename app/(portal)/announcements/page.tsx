import { createAnnouncement, deleteAnnouncement } from "@/app/actions/manage";
import { ActionForm } from "@/components/ActionForm";
import { AnnouncementList } from "@/components/AnnouncementList";
import { SchoolSelect } from "@/components/SchoolSelect";
import { SubmitButton } from "@/components/SubmitButton";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { announcementsFor, schoolsFor } from "@/lib/queries";
import { isStaff } from "@/lib/roles";

export default async function AnnouncementsPage() {
  const user = await requireUser();
  const [items, schools] = await Promise.all([announcementsFor(user), schoolsFor(user)]);
  const canPost = isStaff(user.role) && schools.length > 0;

  return (
    <>
      <PageHeader title="Announcements" />
      <div className={`grid gap-6 ${canPost ? "lg:grid-cols-3" : ""}`}>
        <section className="card lg:col-span-2">
          <AnnouncementList
            items={items}
            actions={(a) =>
              isStaff(user.role) && (a.authorId === user.id || user.role !== "TEACHER") ? (
                <form action={deleteAnnouncement.bind(null, a.id)}>
                  <button className="text-red-600 hover:underline">Delete</button>
                </form>
              ) : null
            }
          />
        </section>
        {canPost && (
          <section className="card h-fit">
            <h2 className="mb-3 font-semibold">Post an announcement</h2>
            <ActionForm action={createAnnouncement} className="space-y-3">
              <SchoolSelect schools={schools} />
              <div>
                <label className="label">Audience</label>
                <select name="audience" className="input" defaultValue="EVERYONE">
                  <option value="EVERYONE">Everyone</option>
                  <option value="STAFF">Staff only</option>
                  <option value="STUDENTS">Students</option>
                  <option value="PARENTS">Parents</option>
                </select>
              </div>
              <div>
                <label className="label">Title</label>
                <input name="title" required className="input" />
              </div>
              <div>
                <label className="label">Message</label>
                <textarea name="body" required rows={5} className="input" />
              </div>
              <SubmitButton>Post</SubmitButton>
            </ActionForm>
          </section>
        )}
      </div>
    </>
  );
}
