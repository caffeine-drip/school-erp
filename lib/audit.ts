import { db } from "./db";
import type { CurrentUser } from "./auth";

// Records who did what. Failures are swallowed so logging never blocks the action itself.
export async function audit(user: CurrentUser, action: string, detail: string, schoolId?: string | null) {
  try {
    await db.auditLog.create({
      data: { actorId: user.id, action, detail, schoolId: schoolId ?? user.schoolId ?? user.ownedSchools[0]?.id ?? null },
    });
  } catch (e) {
    console.error("audit log failed", e);
  }
}
