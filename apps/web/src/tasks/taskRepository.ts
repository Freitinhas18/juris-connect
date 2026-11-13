import { demoTasks } from "./taskDemoData";
import type { ResponsibilityTransfer, TaskHistoryEntry, TaskInput, TaskRecord, TaskStatus, TaskSubtask, WaitPeriod } from "./taskTypes";

const STORAGE_KEY = "juris-connect:demo-tasks:v1";
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
