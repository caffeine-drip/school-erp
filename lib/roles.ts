import type { Role } from "@prisma/client";

export const ROLE_ORDER: Role[] = ["OWNER", "PRINCIPAL", "TEACHER", "STUDENT", "PARENT"];

export const ROLE_LABEL: Record<Role, string> = {
  OWNER: "Owner",
  PRINCIPAL: "Principal",
  TEACHER: "Teacher",
  STUDENT: "Student",
  PARENT: "Parent",
};

export const ROLE_PLURAL: Record<Role, string> = {
  OWNER: "Owners",
  PRINCIPAL: "Principals",
  TEACHER: "Teachers",
  STUDENT: "Students",
  PARENT: "Parents",
};

// Which accounts each role is allowed to create, edit and deactivate.
const MANAGES: Record<Role, Role[]> = {
  OWNER: ["PRINCIPAL", "TEACHER", "STUDENT", "PARENT"],
  PRINCIPAL: ["TEACHER", "STUDENT", "PARENT"],
  TEACHER: [],
  STUDENT: [],
  PARENT: [],
};

// Which directories each role can browse.
const VIEWS: Record<Role, Role[]> = {
  OWNER: ["PRINCIPAL", "TEACHER", "STUDENT", "PARENT"],
  PRINCIPAL: ["TEACHER", "STUDENT", "PARENT"],
  TEACHER: ["STUDENT", "PARENT"],
  STUDENT: [],
  PARENT: [],
};

export function canManage(actor: Role, target: Role) {
  return MANAGES[actor].includes(target);
}

export function viewableRoles(actor: Role) {
  return VIEWS[actor];
}

export function managedRoles(actor: Role) {
  return MANAGES[actor];
}

export function isStaff(role: Role) {
  return role === "OWNER" || role === "PRINCIPAL" || role === "TEACHER";
}

export function parseRole(value: string | undefined): Role | null {
  const upper = value?.toUpperCase();
  return ROLE_ORDER.find((r) => r === upper) ?? null;
}
