import { z } from "zod";
import type { Role } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import type { FormState } from "./auth";

export async function actor(roles?: Role[]) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not signed in");
  if (roles && !roles.includes(user.role)) throw new Error("Not allowed");
  return user;
}

export function fail(e: unknown): FormState {
  if (e instanceof z.ZodError) return { error: e.issues[0]?.message ?? "Check the form." };
  if (e && typeof e === "object" && "code" in e && e.code === "P2002") {
    return { error: "That already exists." };
  }
  return { error: e instanceof Error ? e.message : "Something went wrong." };
}

export const optional = z
  .string()
  .trim()
  .transform((v) => v || undefined)
  .optional();
