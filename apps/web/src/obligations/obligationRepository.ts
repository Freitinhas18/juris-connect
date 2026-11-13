import { demoObligations } from "./obligationDemoData";
import type { ObligationEvidence, ObligationInput, ObligationOccurrence, ObligationRecord, OccurrenceInput } from "./obligationTypes";

const STORAGE_KEY = "juris-connect:demo-obligations:v1";
const ACTOR_ID = "demo-team-lucas";
const monthIntervals: Record<string, number> = { Mensal: 1, Trimestral: 3, Semestral: 6, Anual: 12 };

function isObject(value: unknown): value is Record<string, unknown> { return Boolean(value && typeof value === "object"); }
function isHistory(value: unknown): boolean { return isObject(value) && typeof value.id === "string" && typeof value.date === "string" && typeof value.message === "string" && typeof value.actorId === "string"; }
function isEvidence(value: unknown): value is ObligationEvidence { return isObject(value) && typeof value.id === "string" && typeof value.name === "string" && typeof value.description === "string" && typeof value.deliveredAt === "string" && typeof value.notes === "string"; }
function isOccurrence(value: unknown): value is ObligationOccurrence {
  if (!isObject(value)) return false;
  return typeof value.id === "string" && typeof value.obligationId === "string" &&
    typeof value.referencePeriod === "string" && typeof value.dueDate === "string" &&
    typeof value.status === "string" && typeof value.responsibleId === "string" &&
    (typeof value.completedAt === "string" || value.completedAt === null) &&
    Array.isArray(value.evidence) && value.evidence.every(isEvidence) &&
    typeof value.observations === "string" && Array.isArray(value.history) && value.history.every(isHistory);
}
function isObligation(value: unknown): value is ObligationRecord {
  if (!isObject(value)) return false;
  return typeof value.id === "string" && typeof value.title === "string" &&
    typeof value.description === "string" && typeof value.processId === "string" &&
    typeof value.reference === "string" && typeof value.authority === "string" &&
    typeof value.responsibleId === "string" && typeof value.periodicity === "string" &&
    typeof value.firstDueDate === "string" && typeof value.requirements === "string" &&
    typeof value.expectedEvidence === "string" && (value.status === "active" || value.status === "inactive") &&
    typeof value.createdAt === "string" && Array.isArray(value.history) && value.history.every(isHistory) &&
    Array.isArray(value.occurrences) && value.occurrences.every(isOccurrence);
}
function cloneDemo(): ObligationRecord[] {
  return demoObligations.map((obligation) => ({
    ...obligation,
    history: obligation.history.map((entry) => ({ ...entry })),
    occurrences: obligation.occurrences.map((occurrence) => ({
      ...occurrence,
      evidence: occurrence.evidence.map((evidence) => ({ ...evidence })),
      history: occurrence.history.map((entry) => ({ ...entry })),
    })),
  }));
}
export function getObligations(): ObligationRecord[] {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === null) return cloneDemo();
    const parsed: unknown = JSON.parse(saved);
    return Array.isArray(parsed) && parsed.every(isObligation) ? parsed : cloneDemo();
  } catch { return cloneDemo(); }
}
function persist(records: ObligationRecord[]): ObligationRecord[] {
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records)); }
  catch { /* A interface permanece disponível nesta sessão se o armazenamento estiver bloqueado. */ }
  return records;
}
function entry(message: string, date = new Date().toISOString()) { return { id: crypto.randomUUID(), date, message, actorId: ACTOR_ID }; }
function occurrenceHistory(message: string, date = new Date().toISOString()) { return { ...entry(message, date) }; }

function periodReference(date: string, periodicity: ObligationRecord["periodicity"]): string {
  const [year, month, day] = date.split("-").map(Number);
  if (periodicity === "Mensal") return year + "-" + String(month).padStart(2, "0");
  if (periodicity === "Trimestral") return year + "-T" + Math.ceil(month / 3);
  if (periodicity === "Semestral") return year + "-S" + (month <= 6 ? 1 : 2);
  if (periodicity === "Anual") return String(year);
  return [year, String(month).padStart(2, "0"), String(day).padStart(2, "0")].join("-");
}

export function calculateNextDueDate(date: string, periodicity: ObligationRecord["periodicity"]): string | null {
  const interval = monthIntervals[periodicity];
  if (!interval) return null;
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) return null;
  const monthIndex = year * 12 + month - 1 + interval;
  const nextYear = Math.floor(monthIndex / 12);
  const nextMonth = monthIndex % 12 + 1;
  const lastDay = new Date(nextYear, nextMonth, 0).getDate();
  return [nextYear, String(nextMonth).padStart(2, "0"), String(Math.min(day, lastDay)).padStart(2, "0")].join("-");
}

export function createObligation(input: ObligationInput, current: ObligationRecord[]): ObligationRecord[] {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const occurrence: ObligationOccurrence = {
    id: crypto.randomUUID(), obligationId: id, referencePeriod: periodReference(input.firstDueDate, input.periodicity),
    dueDate: input.firstDueDate, status: "Programada", responsibleId: input.responsibleId,
    completedAt: null, evidence: [], observations: "",
    history: [occurrenceHistory("Primeira ocorrência programada para " + input.firstDueDate + ".", now)],
  };
  const obligation: ObligationRecord = { ...input, id, createdAt: now, history: [entry("Condicionante demonstrativa cadastrada.", now)], occurrences: [occurrence] };
  return persist([obligation, ...current]);
}

export function updateObligation(id: string, input: ObligationInput, current: ObligationRecord[]): ObligationRecord[] {
  return persist(current.map((obligation) => {
    if (obligation.id !== id) return obligation;
    const history = [...obligation.history];
    if (input.responsibleId !== obligation.responsibleId) history.push(entry("Responsável alterado."));
    if (input.status !== obligation.status) history.push(entry("Situação da condicionante alterada para " + (input.status === "active" ? "Ativa." : "Inativa.")));
    const otherChanged = input.title !== obligation.title || input.description !== obligation.description ||
      input.processId !== obligation.processId || input.reference !== obligation.reference ||
      input.authority !== obligation.authority || input.periodicity !== obligation.periodicity ||
      input.firstDueDate !== obligation.firstDueDate || input.requirements !== obligation.requirements ||
      input.expectedEvidence !== obligation.expectedEvidence;
    if (otherChanged) history.push(entry("Dados da obrigação atualizados."));
    return { ...obligation, ...input, history };
  }));
}

export function generateNextOccurrence(id: string, current: ObligationRecord[]): ObligationRecord[] {
  return persist(current.map((obligation) => {
    if (obligation.id !== id || obligation.status !== "active" || obligation.periodicity === "Pontual") return obligation;
    const latest = [...obligation.occurrences].sort((a, b) => b.dueDate.localeCompare(a.dueDate))[0];
    const nextDate = calculateNextDueDate(latest?.dueDate ?? obligation.firstDueDate, obligation.periodicity);
    if (!nextDate) return obligation;
    const referencePeriod = periodReference(nextDate, obligation.periodicity);
    if (obligation.occurrences.some((occurrence) => occurrence.referencePeriod === referencePeriod)) return obligation;
    const now = new Date().toISOString();
    const occurrence: ObligationOccurrence = {
      id: crypto.randomUUID(), obligationId: obligation.id, referencePeriod, dueDate: nextDate,
      status: "Programada", responsibleId: obligation.responsibleId, completedAt: null,
      evidence: [], observations: "",
      history: [occurrenceHistory("Ocorrência " + referencePeriod + " gerada a partir da periodicidade configurada.", now)],
    };
    return { ...obligation, occurrences: [...obligation.occurrences, occurrence], history: [...obligation.history, entry("Próxima ocorrência gerada para " + referencePeriod + ".", now)] };
  }));
}

export function updateOccurrence(obligationId: string, occurrenceId: string, input: OccurrenceInput, current: ObligationRecord[]): ObligationRecord[] {
  return persist(current.map((obligation) => {
    if (obligation.id !== obligationId) return obligation;
    const occurrences = obligation.occurrences.map((occurrence) => {
      if (occurrence.id !== occurrenceId) return occurrence;
      const history = [...occurrence.history];
      if (input.status !== occurrence.status) history.push({ ...occurrenceHistory("Situação alterada de " + occurrence.status + " para " + input.status + "."), fromStatus: occurrence.status, toStatus: input.status });
      if (input.responsibleId !== occurrence.responsibleId) history.push(occurrenceHistory("Responsável pela ocorrência atualizado."));
      if (input.observations !== occurrence.observations) history.push(occurrenceHistory("Observações da ocorrência atualizadas."));
      return { ...occurrence, ...input, completedAt: input.status === "Cumprida" ? occurrence.completedAt ?? new Date().toISOString() : null, history };
    });
    return { ...obligation, occurrences };
  }));
}

export function addOccurrenceEvidence(obligationId: string, occurrenceId: string, evidence: Omit<ObligationEvidence, "id">, current: ObligationRecord[]): ObligationRecord[] {
  if (!evidence.name.trim() || !evidence.deliveredAt) return current;
  return persist(current.map((obligation) => obligation.id !== obligationId ? obligation : {
    ...obligation,
    occurrences: obligation.occurrences.map((occurrence) => occurrence.id !== occurrenceId ? occurrence : {
      ...occurrence,
      evidence: [...occurrence.evidence, { ...evidence, id: crypto.randomUUID(), name: evidence.name.trim(), description: evidence.description.trim(), notes: evidence.notes.trim() }],
      history: [...occurrence.history, occurrenceHistory("Evidência registrada: " + evidence.name.trim() + ".")],
    }),
  }));
}
