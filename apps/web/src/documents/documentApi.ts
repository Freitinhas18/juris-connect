import type { DocumentInput, DocumentRecord } from "./documentTypes";
const API_BASE = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try { response = await fetch(`${API_BASE}${path}`, { ...init, credentials: "include" }); }
  catch { throw new Error("Não foi possível conectar à API. Verifique se o backend está disponível."); }
  if (response.status === 204) return undefined as T;
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body && typeof body === "object" && "error" in body && typeof body.error === "string" ? body.error : `A API retornou HTTP ${response.status}.`;
    const details = body && typeof body === "object" && "details" in body && Array.isArray(body.details)
      ? body.details.flatMap((item) => item && typeof item === "object" && "message" in item && typeof item.message === "string"
        ? [`${"path" in item && Array.isArray(item.path) ? item.path.join(".") : "metadados"}: ${item.message}`] : []).join("; ")
      : "";
    throw new Error(details ? `${message}: ${details}` : message);
  }
  return body as T;
}
export const listDocuments = () => request<DocumentRecord[]>("/documents");
export const updateDocument = (id: string, input: DocumentInput) => request<DocumentRecord>(`/documents/${encodeURIComponent(id)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
export const deleteDocument = (id: string) => request<void>(`/documents/${encodeURIComponent(id)}`, { method: "DELETE" });
export function uploadDocument(input: DocumentInput, file: File, history?: DocumentRecord["history"], addedAt?: string, legacyImportId?: string): Promise<DocumentRecord> {
  const body = new FormData();
  body.set("metadata", JSON.stringify({ ...input, ...(history ? { history } : {}), ...(addedAt ? { addedAt } : {}), ...(legacyImportId ? { legacyImportId } : {}) }));
  body.set("file", file, file.name);
  return request<DocumentRecord>("/documents", { method: "POST", body });
}
export function documentFileUrl(id: string, inline = false) { return `${API_BASE}/documents/${encodeURIComponent(id)}/file${inline ? "?inline=true" : ""}`; }
