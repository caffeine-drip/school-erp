import type { School } from "@prisma/client";

// Owners pick which school; everyone else has exactly one, passed as a hidden field.
export function SchoolSelect({ schools }: { schools: School[] }) {
  if (schools.length === 1) return <input type="hidden" name="schoolId" value={schools[0].id} />;
  return (
    <div>
      <label className="label">School</label>
      <select name="schoolId" required className="input" defaultValue="">
        <option value="" disabled>
          Choose a school
        </option>
        {schools.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </div>
  );
}
