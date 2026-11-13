import { demoTasks } from "./taskDemoData";
import { demoProcesses } from "../processes/processDemoData";
import type { ProcessRecord } from "../processes/processTypes";
import type { ResponsibilityTransfer, TaskHistoryEntry, TaskInput, TaskRecord, TaskStatus, TaskSubtask, WaitPeriod } from "./taskTypes";

export const LEGACY_TASKS_KEY = "juris-connect:demo-tasks:v1";
const STORAGE_KEY = LEGACY_TASKS_KEY;
const IMPORTED_TASKS_KEY = "juris-connect:demo-tasks:migration:v1";
export const DEMO_ACTOR_ID = "demo-team-lucas";
const waitingStatuses: TaskStatus[] = ["Aguardando cliente", "Aguardando órgão ou terceiro"];

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object");
}
function validSubtask(value: unknown): value is TaskSubtask {
  return isObject(value) && typeof value.id === "string" && typeof value.title === "string" && typeof value.completed === "boolean";
}
function validHistory(value: unknown): value is TaskHistoryEntry {
  return isObject(value) && typeof value.id === "string" && typeof value.date === "string" &&
    typeof value.message === "string" && typeof value.actorId === "string" &&
    ["created", "status", "transfer", "subtask", "updated"].includes(String(value.type));
}
function validTransfer(value: unknown): value is ResponsibilityTransfer {
  return isObject(value) && typeof value.id === "string" && typeof value.fromAssigneeId === "string" &&
    typeof value.toAssigneeId === "string" && typeof value.date === "string" && typeof value.justification === "string";
}
function validWait(value: unknown): value is WaitPeriod {
  return isObject(value) && typeof value.id === "string" && waitingStatuses.includes(value.status as TaskStatus) &&
    typeof value.startedAt === "string" && (typeof value.endedAt === "string" || value.endedAt === null);
}
function validTask(value: unknown): value is TaskRecord {
  if (!isObject(value)) return false;
  return typeof value.id === "string" && typeof value.title === "string" && typeof value.description === "string" &&
    typeof value.processId === "string" && typeof value.assigneeId === "string" &&
    typeof value.status === "string" && typeof value.priority === "string" &&
    typeof value.createdAt === "string" && typeof value.startDate === "string" &&
    typeof value.dueDate === "string" && (typeof value.completedAt === "string" || value.completedAt === null) &&
    Array.isArray(value.subtasks) && value.subtasks.every(validSubtask) &&
    Array.isArray(value.history) && value.history.every(validHistory) &&
    Array.isArray(value.transfers) && value.transfers.every(validTransfer) &&
    Array.isArray(value.waitPeriods) && value.waitPeriods.every(validWait);
}
function cloneDemoTasks(): TaskRecord[] {
  return demoTasks.map((task) => ({
    ...task,
    subtasks: task.subtasks.map((item) => ({ ...item })),
    history: task.history.map((item) => ({ ...item })),
    transfers: task.transfers.map((item) => ({ ...item })),
    waitPeriods: task.waitPeriods.map((item) => ({ ...item })),
  }));
}

export type LegacyTaskCandidate = { sourceId: string; task: TaskRecord; previousProcessName: string; processId: string };
export type LegacyTaskInspection = { exists: boolean; invalidCount: number; unchangedDemoCount: number; candidates: LegacyTaskCandidate[]; parseError: boolean };

function unchangedDemo(task: TaskRecord): boolean {
  const original = demoTasks.find((item) => item.id === task.id);
  return original !== undefined && JSON.stringify(task) === JSON.stringify(original);
}
function importedMap(): Record<string, string> {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(IMPORTED_TASKS_KEY) ?? "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  } catch { return {}; }
}
export function inspectLegacyTasks(processes: ProcessRecord[]): LegacyTaskInspection {
  let raw: string | null;
  try { raw = window.localStorage.getItem(LEGACY_TASKS_KEY); }
  catch { return { exists: false, invalidCount: 0, unchangedDemoCount: 0, candidates: [], parseError: true }; }
  if (raw === null) return { exists: false, invalidCount: 0, unchangedDemoCount: 0, candidates: [], parseError: false };
  let parsed: unknown;
  try { parsed = JSON.parse(raw); }
  catch { return { exists: true, invalidCount: 1, unchangedDemoCount: 0, candidates: [], parseError: true }; }
  if (!Array.isArray(parsed)) return { exists: true, invalidCount: 1, unchangedDemoCount: 0, candidates: [], parseError: true };
  const done = importedMap();
  const candidates: LegacyTaskCandidate[] = [];
  let invalidCount = 0;
  let unchangedDemoCount = 0;
  for (const value of parsed) {
    if (!validTask(value)) { invalidCount++; continue; }
    if (unchangedDemo(value)) { unchangedDemoCount++; continue; }
    if (done[value.id]) continue;
    const demoProcess = demoProcesses.find((item) => item.id === value.processId);
    const previousProcessName = demoProcess?.name ?? "";
    const matchingProcess = processes.find((item) => item.id === value.processId) ?? (previousProcessName
      ? processes.find((item) => item.name.trim().toLocaleLowerCase("pt-BR") === previousProcessName.trim().toLocaleLowerCase("pt-BR"))
      : undefined);
    candidates.push({ sourceId: value.id, task: value, previousProcessName, processId: matchingProcess?.id ?? "" });
  }
  return { exists: true, invalidCount, unchangedDemoCount, candidates, parseError: false };
}
export function markLegacyTaskImported(sourceId: string, destinationId: string): void {
  window.localStorage.setItem(IMPORTED_TASKS_KEY, JSON.stringify({ ...importedMap(), [sourceId]: destinationId }));
}
export function getLegacyTaskBackup(): string | null {
  try { return window.localStorage.getItem(LEGACY_TASKS_KEY); }
  catch { return null; }
}
export function getTasks(): TaskRecord[] {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === null) return cloneDemoTasks();
    const parsed: unknown = JSON.parse(stored);
    return Array.isArray(parsed) && parsed.every(validTask) ? parsed : cloneDemoTasks();
  } catch {
    return cloneDemoTasks();
  }
}
function persist(tasks: TaskRecord[]): TaskRecord[] {
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks)); }
  catch { /* A interface permanece disponível nesta sessão se o armazenamento estiver bloqueado. */ }
  return tasks;
}
function log(type: TaskHistoryEntry["type"], message: string, actorId = DEMO_ACTOR_ID, details: Partial<TaskHistoryEntry> = {}): TaskHistoryEntry {
  return { id: crypto.randomUUID(), date: new Date().toISOString(), type, message, actorId, ...details };
}
function isWaiting(status: TaskStatus) { return waitingStatuses.includes(status); }

export function createTask(input: TaskInput, current: TaskRecord[]): TaskRecord[] {
  const now = new Date().toISOString();
  const initialWait: WaitPeriod[] = isWaiting(input.status) ? [{ id: crypto.randomUUID(), status: input.status as WaitPeriod["status"], startedAt: now, endedAt: null }] : [];
  const task: TaskRecord = {
    ...input,
    id: crypto.randomUUID(),
    createdAt: now,
    completedAt: input.status === "Concluída" ? now : null,
    subtasks: input.subtasks.map((item) => ({ ...item })),
    history: [log("created", "Tarefa demonstrativa criada.")],
    transfers: [],
    waitPeriods: initialWait,
  };
  return persist([task, ...current]);
}

export function updateTask(id: string, input: TaskInput, current: TaskRecord[]): TaskRecord[] {
  return persist(current.map((task) => {
    if (task.id !== id) return task;
    const now = new Date().toISOString();
    const history = [...task.history];
    let waitPeriods = task.waitPeriods.map((period) => ({ ...period }));
    if (input.status !== task.status) {
      history.push(log("status", "Status alterado de " + task.status + " para " + input.status + ".", DEMO_ACTOR_ID, { previousStatus: task.status, newStatus: input.status }));
      const wasWaiting = isWaiting(task.status);
      const becomesWaiting = isWaiting(input.status);
      if (wasWaiting && (!becomesWaiting || task.status !== input.status)) {
        const openIndex = waitPeriods.reduce((last, period, index) => period.endedAt === null ? index : last, -1);
        if (openIndex >= 0) waitPeriods[openIndex] = { ...waitPeriods[openIndex], endedAt: now };
      }
      if (becomesWaiting && (!wasWaiting || task.status !== input.status)) {
        waitPeriods.push({ id: crypto.randomUUID(), status: input.status as WaitPeriod["status"], startedAt: now, endedAt: null });
      }
    }
    const changed = task.title !== input.title || task.description !== input.description ||
      task.processId !== input.processId || task.priority !== input.priority ||
      task.dueDate !== input.dueDate || task.startDate !== input.startDate ||
      task.assigneeId !== input.assigneeId;
    const subtasksChanged = JSON.stringify(task.subtasks) !== JSON.stringify(input.subtasks);
    if (changed || subtasksChanged) history.push(log("updated", "Informações da tarefa atualizadas."));
    const completedAt = input.status === "Concluída" ? task.completedAt ?? now : null;
    return { ...task, ...input, completedAt, history, waitPeriods };
  }));
}

export function transferTask(id: string, nextAssigneeId: string, justification: string, current: TaskRecord[]): TaskRecord[] {
  const reason = justification.trim();
  if (!reason) return current;
  return persist(current.map((task) => {
    if (task.id !== id || task.assigneeId === nextAssigneeId) return task;
    const now = new Date().toISOString();
    const transfer: ResponsibilityTransfer = { id: crypto.randomUUID(), fromAssigneeId: task.assigneeId, toAssigneeId: nextAssigneeId, date: now, justification: reason };
    const history = log("transfer", "Responsabilidade transferida. Justificativa: " + reason);
    return { ...task, assigneeId: nextAssigneeId, transfers: [...task.transfers, transfer], history: [...task.history, history] };
  }));
}

export function toggleSubtask(id: string, subtaskId: string, current: TaskRecord[]): TaskRecord[] {
  return persist(current.map((task) => {
    if (task.id !== id) return task;
    const subtasks = task.subtasks.map((item) => item.id === subtaskId ? { ...item, completed: !item.completed } : item);
    const changed = subtasks.find((item) => item.id === subtaskId);
    return changed ? { ...task, subtasks, history: [...task.history, log("subtask", (changed.completed ? "Subtarefa concluída: " : "Subtarefa reaberta: ") + changed.title)] } : task;
  }));
}

export function addSubtask(id: string, title: string, current: TaskRecord[]): TaskRecord[] {
  const normalized = title.trim();
  if (!normalized) return current;
  return persist(current.map((task) => task.id === id ? {
    ...task,
    subtasks: [...task.subtasks, { id: crypto.randomUUID(), title: normalized, completed: false }],
    history: [...task.history, log("subtask", "Subtarefa adicionada: " + normalized)],
  } : task));
}
