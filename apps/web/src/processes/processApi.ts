import type { ProcessInput, ProcessRecord } from "./processTypes";

const API_BASE = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");
export type ProcessCreateInput = ProcessInput & { createdAt?: string; history?: ProcessRecord["history"] };

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

export function listProcesses(): Promise<ProcessRecord[]> { return request<ProcessRecord[]>("/processes"); }
export function getProcess(id: string): Promise<ProcessRecord> { return request<ProcessRecord>(`/processes/${encodeURIComponent(id)}`); }
export function createProcess(input: ProcessCreateInput): Promise<ProcessRecord> {
  return request<ProcessRecord>("/processes", { method: "POST", body: JSON.stringify(input) });
}
export function updateProcess(id: string, input: ProcessInput): Promise<ProcessRecord> {
  return request<ProcessRecord>(`/processes/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(input) });
}
export function deleteProcess(id: string): Promise<void> {
  return request<void>(`/processes/${encodeURIComponent(id)}`, { method: "DELETE" });
}
