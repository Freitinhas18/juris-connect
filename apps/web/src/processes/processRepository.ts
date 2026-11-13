import { demoProcesses } from "./processDemoData";
import type { ProcessHistoryEntry, ProcessInput, ProcessRecord } from "./processTypes";

const STORAGE_KEY = "juris-connect:demo-processes:v1";

function validHistoryEntry(value: unknown): value is ProcessHistoryEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<ProcessHistoryEntry>;
  return typeof entry.id === "string" && typeof entry.date === "string" &&
    typeof entry.message === "string" &&
    ["created", "stage", "status", "updated"].includes(entry.type ?? "");
}

function isProcessRecord(value: unknown): value is ProcessRecord {
  if (!value || typeof value !== "object") return false;
  const process = value as Partial<ProcessRecord>;
  return typeof process.id === "string" && typeof process.enterpriseId === "string" &&
    typeof process.name === "string" && typeof process.protocol === "string" &&
    typeof process.processType === "string" && typeof process.entity === "string" &&
    typeof process.description === "string" && typeof process.manager === "string" &&
    typeof process.startDate === "string" && typeof process.dueDate === "string" &&
    typeof process.priority === "string" && typeof process.stage === "string" &&
    typeof process.status === "string" && typeof process.createdAt === "string" &&
    Array.isArray(process.history) && process.history.every(validHistoryEntry);
}

function copyDemoProcesses(): ProcessRecord[] {
  return demoProcesses.map((process) => ({ ...process, history: process.history.map((entry) => ({ ...entry })) }));
}

export function getProcesses(): ProcessRecord[] {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === null) return copyDemoProcesses();
    const parsed: unknown = JSON.parse(stored);
    return Array.isArray(parsed) && parsed.every(isProcessRecord) ? parsed : copyDemoProcesses();
  } catch {
    return copyDemoProcesses();
  }
}

function persist(processes: ProcessRecord[]): ProcessRecord[] {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(processes));
  } catch {
    // A interface segue disponível na sessão atual se o navegador bloquear o armazenamento.
  }
  return processes;
}

function historyEntry(type: ProcessHistoryEntry["type"], message: string): ProcessHistoryEntry {
  return { id: crypto.randomUUID(), date: new Date().toISOString(), type, message };
}

export function createProcess(input: ProcessInput, current: ProcessRecord[]): ProcessRecord[] {
  const process: ProcessRecord = {
    ...input,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString().slice(0, 10),
    history: [historyEntry("created", "Processo demonstrativo cadastrado.")],
  };
  return persist([process, ...current]);
}

export function updateProcess(id: string, input: ProcessInput, current: ProcessRecord[]): ProcessRecord[] {
  return persist(current.map((process) => {
    if (process.id !== id) return process;
    const history = [...process.history];
    if (input.stage !== process.stage) history.push(historyEntry("stage", "Etapa atualizada para " + input.stage + "."));
    if (input.status !== process.status) history.push(historyEntry("status", "Status alterado para " + input.status + "."));
    const otherFieldsChanged =
      input.name !== process.name || input.protocol !== process.protocol ||
      input.processType !== process.processType || input.enterpriseId !== process.enterpriseId ||
      input.entity !== process.entity || input.description !== process.description ||
      input.manager !== process.manager || input.startDate !== process.startDate ||
      input.dueDate !== process.dueDate || input.priority !== process.priority;
    if (otherFieldsChanged) history.push(historyEntry("updated", "Informações gerais do processo atualizadas."));
    return { ...process, ...input, history };
  }));
}
