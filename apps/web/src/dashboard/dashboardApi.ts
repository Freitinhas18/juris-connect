import type { ClientRecord } from "../clients/clientTypes";
import type { DocumentRecord } from "../documents/documentTypes";
import type { EnterpriseRecord } from "../enterprises/enterpriseTypes";
import type { ObligationRecord } from "../obligations/obligationTypes";
import type { ProcessRecord } from "../processes/processTypes";
import type { TaskRecord } from "../tasks/taskTypes";

const API_BASE = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");

async function list<T>(path: string): Promise<T[]> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, { credentials: "include" });
  } catch {
    throw new Error("Não foi possível acessar a API. Confira se o backend e o banco estão ativos.");
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body && typeof body === "object" && "error" in body && typeof body.error === "string"
      ? body.error
      : `Falha ao carregar ${path.slice(1)} (HTTP ${response.status}).`;
    throw new Error(message);
  }
  if (!Array.isArray(body)) throw new Error(`A resposta de ${path} não contém uma lista válida.`);
  return body as T[];
}

export type DashboardData = {
  clients: ClientRecord[];
  enterprises: EnterpriseRecord[];
  processes: ProcessRecord[];
  tasks: TaskRecord[];
  obligations: ObligationRecord[];
  documents: DocumentRecord[];
};

export async function loadDashboardData(): Promise<DashboardData> {
  const [clients, enterprises, processes, tasks, obligations, documents] = await Promise.all([
    list<ClientRecord>("/clients"),
    list<EnterpriseRecord>("/enterprises"),
    list<ProcessRecord>("/processes"),
    list<TaskRecord>("/tasks"),
    list<ObligationRecord>("/obligations"),
    list<DocumentRecord>("/documents"),
  ]);
  return { clients, enterprises, processes, tasks, obligations, documents };
}
