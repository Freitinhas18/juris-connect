import type { FastifyRequest } from "fastify";

export type OrganizationRole = "owner" | "admin" | "member";
export type OrganizationPermission = "read" | "write" | "delete" | "manage_members" | "manage_organization";

const rolePermissions: Record<OrganizationRole, ReadonlySet<OrganizationPermission>> = {
  owner: new Set(["read", "write", "delete", "manage_members", "manage_organization"]),
  admin: new Set(["read", "write", "delete", "manage_members"]),
  member: new Set(["read", "write"]),
};

export function hasPermission(role: OrganizationRole, permission: OrganizationPermission): boolean {
  return rolePermissions[role].has(permission);
}

export interface AuthContext {
  userId: string;
  email: string;
  name: string;
  organizationId: string;
  role: OrganizationRole;
  sessionId: string;
}

declare module "fastify" {
  interface FastifyRequest {
    auth: AuthContext | null;
  }
}

export function requireAuth(request: FastifyRequest): AuthContext {
  if (!request.auth) throw new Error("Auth hook was not run for this request.");
  return request.auth;
}
