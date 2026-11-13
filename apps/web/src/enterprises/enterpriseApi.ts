import type { EnterpriseCreateInput, EnterpriseInput, EnterpriseRecord } from "./enterpriseTypes";

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
    throw new Error("Não foi possível conectar à API. Verifique se o backend e o banco estão disponíveis.");
  }
  if (response.status === 204) return undefined as T;
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body && typeof body === "object" && "error" in body && typeof body.error === "string"
      ? body.error
      : `A API retornou HTTP ${response.status}.`;
    throw new Error(message);
  }
  return body as T;
}

export function listEnterprises(): Promise<EnterpriseRecord[]> { return request<EnterpriseRecord[]>("/enterprises"); }
export function getEnterprise(id: string): Promise<EnterpriseRecord> { return request<EnterpriseRecord>(`/enterprises/${encodeURIComponent(id)}`); }
export function createEnterprise(input: EnterpriseCreateInput): Promise<EnterpriseRecord> { return request<EnterpriseRecord>("/enterprises", { method: "POST", body: JSON.stringify(input) }); }
export function updateEnterprise(id: string, input: EnterpriseInput): Promise<EnterpriseRecord> { return request<EnterpriseRecord>(`/enterprises/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(input) }); }
export function deleteEnterprise(id: string): Promise<void> { return request<void>(`/enterprises/${encodeURIComponent(id)}`, { method: "DELETE" }); }
