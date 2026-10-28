import type { School } from "@prisma/client";
import { SchoolSelect } from "./SchoolSelect";

export function EnquiryFields({ schools }: { schools: School[] }) {
  return (
    <>
      <SchoolSelect schools={schools} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Student's name</label>
          <input name="studentName" required className="input" />
        </div>
        <div>
          <label className="label">Date of birth</label>
          <input name="dateOfBirth" type="date" className="input" />
        </div>
        <div>
          <label className="label">Applying for class</label>
          <input name="gradeApplied" required placeholder="Grade 5" className="input" />
        </div>
        <div>
          <label className="label">How did you hear about us?</label>
          <input name="source" placeholder="Website, friend, newspaper…" className="input" />
        </div>
        <div>
          <label className="label">Parent's name</label>
          <input name="parentName" required className="input" />
        </div>
        <div>
          <label className="label">Parent's phone</label>
          <input name="parentPhone" required className="input" />
        </div>
      </div>
      <div>
        <label className="label">Parent's email</label>
        <input name="parentEmail" type="email" required className="input" />
      </div>
      <div>
        <label className="label">Anything else</label>
        <textarea name="notes" rows={3} className="input" />
      </div>
    </>
  );
}
