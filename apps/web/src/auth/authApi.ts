export interface AuthUser {
  id: string;
  name: string;
  email: string;
}

export interface AuthOrganization {
  id: string;
  name: string;
  role: "owner" | "admin" | "member";
}

export interface AuthProfile {
  user: AuthUser;
  organization: { id: string; name: string };
  role: AuthOrganization["role"];
}

export interface AuthSession {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  isCurrent: boolean;
}

export interface OrganizationMember {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: AuthOrganization["role"];
  createdAt: string;
}

export interface OrganizationAuditEvent {
  id: string;
  actorUserId: string;
  actorName: string;
  targetUserId: string | null;
  targetName: string | null;
  action: "member.added" | "member.role_changed" | "member.removed" | string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

const API_BASE = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      credentials: "include",
      headers: { ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers },
    });
  } catch {
    throw new Error("Não foi possível acessar a API. Confira se o backend está ativo.");
  }
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string" ? payload.error : `Falha na API (HTTP ${response.status}).`;
    throw new Error(message);
  }
  return payload as T;
}

export async function getCurrentProfile(): Promise<AuthProfile | null> {
  try { return await request<AuthProfile>("/auth/me", { cache: "no-store" }); }
  catch (error) {
    if (error instanceof Error && error.message === "Sessão inválida ou expirada") return null;
    throw error;
  }
}

export function getOrganizations(): Promise<AuthOrganization[]> {
  return request<AuthOrganization[]>("/auth/organizations", { cache: "no-store" });
}

export function signIn(email: string, password: string): Promise<unknown> {
  return request("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
}

export function signOut(): Promise<void> {
  return request<void>("/auth/logout", { method: "POST", body: "{}" });
}

export function registerAccount(input: { name: string; email: string; password: string; organizationName: string }): Promise<{ message: string }> {
  return request("/auth/register", { method: "POST", body: JSON.stringify(input) });
}

export function requestPasswordReset(email: string): Promise<{ message: string }> {
  return request("/auth/password-recovery/request", { method: "POST", body: JSON.stringify({ email }) });
}

export function confirmPasswordReset(token: string, password: string): Promise<{ message: string }> {
  return request("/auth/password-recovery/confirm", { method: "POST", body: JSON.stringify({ token, password }) });
}

export function confirmEmail(token: string): Promise<{ message: string }> {
  return request("/auth/email-verification/confirm", { method: "POST", body: JSON.stringify({ token }) });
}

export function changeActiveOrganization(organizationId: string): Promise<{ organizationId: string; role: AuthOrganization["role"] }> {
  return request("/auth/organizations/active", { method: "POST", body: JSON.stringify({ organizationId }) });
}

export function getSessions(): Promise<AuthSession[]> {
  return request<AuthSession[]>("/auth/sessions", { cache: "no-store" });
}

export function revokeSession(sessionId: string): Promise<void> {
  return request<void>(`/auth/sessions/${encodeURIComponent(sessionId)}/revoke`, { method: "POST", body: "{}" });
}

export function getOrganizationMembers(): Promise<OrganizationMember[]> {
  return request<OrganizationMember[]>("/auth/members", { cache: "no-store" });
}

export function addOrganizationMember(email: string, role: "admin" | "member" = "member"): Promise<OrganizationMember> {
  return request<OrganizationMember>("/auth/members", { method: "POST", body: JSON.stringify({ email, role }) });
}

export function updateOrganizationMemberRole(id: string, role: AuthOrganization["role"]): Promise<OrganizationMember> {
  return request<OrganizationMember>(`/auth/members/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ role }) });
}

export function removeOrganizationMember(id: string): Promise<void> {
  return request<void>(`/auth/members/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function getOrganizationAuditEvents(): Promise<OrganizationAuditEvent[]> {
  return request<OrganizationAuditEvent[]>("/auth/audit-events?limit=50", { cache: "no-store" });
}
