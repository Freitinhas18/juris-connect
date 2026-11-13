import type { TaskInput, TaskRecord } from "./taskTypes";

const API_BASE = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");
export type TaskCreateInput = TaskInput & Partial<Pick<TaskRecord, "createdAt" | "completedAt" | "history" | "transfers" | "waitPeriods">>;
export type TaskTransferInput = { toAssigneeId: string; justification: string };

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

export function listTasks(): Promise<TaskRecord[]> { return request<TaskRecord[]>("/tasks"); }
export function getTask(id: string): Promise<TaskRecord> { return request<TaskRecord>(`/tasks/${encodeURIComponent(id)}`); }
export function createTask(input: TaskCreateInput): Promise<TaskRecord> {
  return request<TaskRecord>("/tasks", { method: "POST", body: JSON.stringify(input) });
}
export function updateTask(id: string, input: TaskInput): Promise<TaskRecord> {
  return request<TaskRecord>(`/tasks/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(input) });
}
export function transferTask(id: string, input: TaskTransferInput): Promise<TaskRecord> {
  return request<TaskRecord>(`/tasks/${encodeURIComponent(id)}/transfers`, { method: "POST", body: JSON.stringify(input) });
}
export function deleteTask(id: string): Promise<void> {
  return request<void>(`/tasks/${encodeURIComponent(id)}`, { method: "DELETE" });
}
