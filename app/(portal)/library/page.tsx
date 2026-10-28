import { addBook, issueBook, returnBook } from "@/app/actions/operations";
import { ActionForm } from "@/components/ActionForm";
import { SchoolSelect } from "@/components/SchoolSelect";
import { SubmitButton } from "@/components/SubmitButton";
import { Badge, Empty, PageHeader, Stat, formatDate, formatMoney } from "@/components/ui";
import { schoolIds, visibleStudentIds } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { schoolsFor, todayUTC } from "@/lib/queries";

export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireUser();
  const manage = user.role === "OWNER" || user.role === "PRINCIPAL";
  const q = (await searchParams).q?.trim();
  const today = todayUTC();
  // Members see their own loans; parents see their children's.
  const memberIds = manage ? null : user.role === "PARENT" ? await visibleStudentIds(user) : [user.id];

  const [books, loans, schools, overdueCount, finesDue] = await Promise.all([
    db.book.findMany({
      where: {
        schoolId: { in: schoolIds(user) },
        ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { author: { contains: q, mode: "insensitive" } }, { isbn: { contains: q } }] } : {}),
      },
      include: { _count: { select: { issues: { where: { returnedAt: null } } } } },
      orderBy: { title: "asc" },
      take: 200,
    }),
    db.bookIssue.findMany({
      where: { book: { schoolId: { in: schoolIds(user) } }, ...(memberIds ? { memberId: { in: memberIds } } : { returnedAt: null }) },
      include: { book: { select: { title: true } }, member: { select: { name: true, email: true } } },
      orderBy: [{ returnedAt: "desc" }, { dueDate: "asc" }],
      take: 200,
    }),
    manage ? schoolsFor(user) : Promise.resolve([]),
    db.bookIssue.count({ where: { book: { schoolId: { in: schoolIds(user) } }, returnedAt: null, dueDate: { lt: today }, ...(memberIds ? { memberId: { in: memberIds } } : {}) } }),
    db.bookIssue.aggregate({ where: { book: { schoolId: { in: schoolIds(user) } }, ...(memberIds ? { memberId: { in: memberIds } } : {}) }, _sum: { fine: true } }),
  ]);

  return (
    <>
      <PageHeader title="Library" subtitle={manage ? "Catalogue, issue and return books." : "Books borrowed and the catalogue."}>
        <form className="flex gap-2">
          <input name="q" defaultValue={q} placeholder="Title, author or ISBN" className="input w-56" />
          <button className="btn-ghost">Search</button>
        </form>
      </PageHeader>
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Titles" value={books.length} />
        <Stat label={manage ? "On loan" : "Borrowed now"} value={loans.filter((l) => !l.returnedAt).length} />
        <Stat label="Overdue" value={overdueCount} />
        <Stat label="Fines charged" value={formatMoney(finesDue._sum.fine ?? 0)} />
      </div>
      <div className={`grid gap-6 ${manage ? "lg:grid-cols-3" : ""}`}>
        <div className="space-y-6 lg:col-span-2">
          <section className="card overflow-x-auto">
            <h2 className="mb-3 font-semibold">{manage ? "Books on loan" : "My loans"}</h2>
            {loans.length === 0 ? (
              <Empty>Nothing borrowed.</Empty>
            ) : (
              <table className="table">
                <thead>
                  <tr><th>Book</th>{(manage || user.role === "PARENT") && <th>Borrower</th>}<th>Due</th><th>Status</th>{manage && <th />}</tr>
                </thead>
                <tbody>
                  {loans.map((l) => (
                    <tr key={l.id}>
                      <td className="font-medium">{l.book.title}</td>
                      {(manage || user.role === "PARENT") && <td>{l.member.name}</td>}
                      <td>{formatDate(l.dueDate)}</td>
                      <td>
                        {l.returnedAt ? (
                          <Badge tone="slate">Returned{l.fine ? ` · fine ${formatMoney(l.fine)}` : ""}</Badge>
                        ) : l.dueDate < today ? (
                          <Badge tone="red">Overdue</Badge>
                        ) : (
                          <Badge tone="blue">On loan</Badge>
                        )}
                      </td>
                      {manage && (
                        <td className="text-right">
                          <form action={returnBook.bind(null, l.id)}>
                            <button className="btn-ghost">Return</button>
                          </form>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
          <section className="card overflow-x-auto">
            <h2 className="mb-3 font-semibold">Catalogue</h2>
            {books.length === 0 ? (
              <Empty>No books yet.</Empty>
            ) : (
              <table className="table">
                <thead>
                  <tr><th>Title</th><th>Author</th><th>Category</th><th>Available</th></tr>
                </thead>
                <tbody>
                  {books.map((b) => (
                    <tr key={b.id}>
                      <td>
                        <div className="font-medium">{b.title}</div>
                        {b.isbn && <div className="font-mono text-xs text-slate-500">{b.isbn}</div>}
                      </td>
                      <td>{b.author}</td>
                      <td>{b.category ?? "—"}</td>
                      <td>{b.copies - b._count.issues} / {b.copies}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
        {manage && (
          <div className="space-y-6">
            <section className="card">
              <h2 className="mb-3 font-semibold">Issue a book</h2>
              <ActionForm action={issueBook} className="space-y-3">
                <div>
                  <label className="label">Book</label>
                  <select name="bookId" required className="input" defaultValue="">
                    <option value="" disabled>Choose</option>
                    {books.filter((b) => b.copies > b._count.issues).map((b) => (
                      <option key={b.id} value={b.id}>{b.title}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Borrower's email</label>
                  <input name="memberEmail" type="email" required className="input" />
                </div>
                <div>
                  <label className="label">Due date</label>
                  <input name="dueDate" type="date" required className="input" />
                </div>
                <SubmitButton>Issue</SubmitButton>
              </ActionForm>
            </section>
            <section className="card">
              <h2 className="mb-3 font-semibold">Add a book</h2>
              <ActionForm action={addBook} className="space-y-3">
                <SchoolSelect schools={schools} />
                <input name="title" required placeholder="Title" className="input" />
                <input name="author" required placeholder="Author" className="input" />
                <div className="grid grid-cols-2 gap-3">
                  <input name="isbn" placeholder="ISBN" className="input" />
                  <input name="category" placeholder="Category" className="input" />
                </div>
                <div>
                  <label className="label">Copies</label>
                  <input name="copies" type="number" min={1} defaultValue={1} required className="input" />
                </div>
                <SubmitButton>Add book</SubmitButton>
              </ActionForm>
            </section>
          </div>
        )}
      </div>
    </>
  );
}
