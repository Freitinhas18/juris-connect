import type { ObligationInput, ObligationRecord, ObligationEvidence, ObligationOccurrence, OccurrenceInput } from "./obligationTypes";

const API_BASE = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try { response = await fetch(`${API_BASE}${path}`, { ...init, credentials: "include", headers: { ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers } }); }
  catch { throw new Error("Não foi possível conectar à API. Verifique se o backend e o banco estão disponíveis."); }
  const body: unknown = response.status === 204 ? undefined : await response.json().catch(() => null);
  if (!response.ok) {
    const message = body && typeof body === "object" && "error" in body && typeof body.error === "string" ? body.error : `A API retornou HTTP ${response.status}.`;
    throw new Error(message);
  }
  return body as T;
}
export const listObligations = () => request<ObligationRecord[]>("/obligations");
export type ObligationCreatePayload = ObligationInput & { createdAt?: string; history?: ObligationRecord["history"]; occurrences?: (Omit<ObligationOccurrence, "id" | "obligationId" | "evidence"> & { evidence: Omit<ObligationEvidence, "id">[] })[] };
export const createObligation = (input: ObligationCreatePayload) => request<ObligationRecord>("/obligations", { method: "POST", body: JSON.stringify(input) });
export const updateObligation = (id: string, input: ObligationInput) => request<ObligationRecord>(`/obligations/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(input) });
export const archiveObligation = (id: string) => request<ObligationRecord>(`/obligations/${encodeURIComponent(id)}`, { method: "DELETE" });
export const generateOccurrence = (id: string) => request<ObligationRecord>(`/obligations/${encodeURIComponent(id)}/occurrences`, { method: "POST" });
export const updateOccurrence = (id: string, occurrenceId: string, input: OccurrenceInput) => request<ObligationRecord>(`/obligations/${encodeURIComponent(id)}/occurrences/${encodeURIComponent(occurrenceId)}`, { method: "PUT", body: JSON.stringify(input) });
export const addOccurrenceEvidence = (id: string, occurrenceId: string, evidence: Omit<ObligationEvidence, "id">) => request<ObligationRecord>(`/obligations/${encodeURIComponent(id)}/occurrences/${encodeURIComponent(occurrenceId)}/evidence`, { method: "POST", body: JSON.stringify(evidence) });
