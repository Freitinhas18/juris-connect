import type { ClientInput, ClientRecord } from "./clientTypes";

const API_BASE = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");
type ApiClient = Omit<ClientRecord, "ventures" | "relatedCases"> & { updatedAt: string };

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

function fromApi(record: ApiClient): ClientRecord {
  return { ...record, ventures: [], venturesAvailable: false };
}

export async function listClients(): Promise<ClientRecord[]> {
  const records = await request<ApiClient[]>("/clients");
  return records.map(fromApi);
}

export async function createClient(input: ClientInput): Promise<ClientRecord> {
  return fromApi(await request<ApiClient>("/clients", { method: "POST", body: JSON.stringify(input) }));
}

export async function updateClient(id: string, input: ClientInput): Promise<ClientRecord> {
  return fromApi(await request<ApiClient>(`/clients/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(input) }));
}

export function deleteClient(id: string): Promise<void> {
  return request<void>(`/clients/${encodeURIComponent(id)}`, { method: "DELETE" });
}
