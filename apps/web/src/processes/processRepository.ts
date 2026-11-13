import { demoProcesses } from "./processDemoData";
import { demoEnterprises } from "../enterprises/enterpriseDemoData";
import type { EnterpriseRecord } from "../enterprises/enterpriseTypes";
import type { ProcessHistoryEntry, ProcessRecord } from "./processTypes";

export const LEGACY_PROCESSES_KEY = "juris-connect:demo-processes:v1";
const IMPORTED_PROCESSES_KEY = "juris-connect:demo-processes:migration:v1";

export type LegacyProcessCandidate = {
  sourceId: string;
  process: ProcessRecord;
  previousEnterpriseName: string;
  enterpriseId: string;
};
export type LegacyProcessInspection = {
  exists: boolean;
  invalidCount: number;
  unchangedDemoCount: number;
  candidates: LegacyProcessCandidate[];
  parseError: boolean;
};

// Preserve the read-only local source for modules not yet integrated with the API.
export function getProcesses(): ProcessRecord[] {
  try {
    const stored = window.localStorage.getItem(LEGACY_PROCESSES_KEY);
    if (stored !== null) {
      const parsed: unknown = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.every(isProcessRecord)) return parsed;
    }
  } catch { /* Keep existing dependent demo screens available if storage cannot be read. */ }
  return demoProcesses.map((process) => ({ ...process, history: process.history.map((entry) => ({ ...entry })) }));
}

function validHistoryEntry(value: unknown): value is ProcessHistoryEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<ProcessHistoryEntry>;
  return typeof entry.id === "string" && typeof entry.date === "string" && !Number.isNaN(Date.parse(entry.date)) &&
    typeof entry.message === "string" && ["created", "stage", "status", "updated"].includes(entry.type ?? "");
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

function unchangedDemo(record: ProcessRecord): boolean {
  const original = demoProcesses.find((item) => item.id === record.id);
  return original !== undefined && JSON.stringify(record) === JSON.stringify(original);
}

function oldEnterpriseName(enterpriseId: string): string {
  const demo = demoEnterprises.find((item) => item.id === enterpriseId);
  if (demo) return demo.name;
  try {
    const raw = window.localStorage.getItem("juris-connect:demo-enterprises:v1");
    const parsed: unknown = raw === null ? null : JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const match = parsed.find((item) => item && typeof item === "object" && "id" in item && item.id === enterpriseId && "name" in item && typeof item.name === "string");
      if (match && "name" in match && typeof match.name === "string") return match.name;
    }
  } catch { /* Keep the process copy available for manual relationship mapping. */ }
  return "";
}

function importedMap(): Record<string, string> {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(IMPORTED_PROCESSES_KEY) ?? "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  } catch { return {}; }
}

export function inspectLegacyProcesses(enterprises: EnterpriseRecord[]): LegacyProcessInspection {
  let raw: string | null;
  try { raw = window.localStorage.getItem(LEGACY_PROCESSES_KEY); }
  catch { return { exists: false, invalidCount: 0, unchangedDemoCount: 0, candidates: [], parseError: true }; }
  if (raw === null) return { exists: false, invalidCount: 0, unchangedDemoCount: 0, candidates: [], parseError: false };
  let parsed: unknown;
  try { parsed = JSON.parse(raw); }
  catch { return { exists: true, invalidCount: 1, unchangedDemoCount: 0, candidates: [], parseError: true }; }
  if (!Array.isArray(parsed)) return { exists: true, invalidCount: 1, unchangedDemoCount: 0, candidates: [], parseError: true };
  const done = importedMap();
  const candidates: LegacyProcessCandidate[] = [];
  let invalidCount = 0;
  let unchangedDemoCount = 0;
  for (const value of parsed) {
    if (!isProcessRecord(value)) { invalidCount++; continue; }
    if (unchangedDemo(value)) { unchangedDemoCount++; continue; }
    if (done[value.id]) continue;
    const previousEnterpriseName = oldEnterpriseName(value.enterpriseId);
    const matchingEnterprise = enterprises.find((item) => item.id === value.enterpriseId) ?? (previousEnterpriseName
      ? enterprises.find((item) => item.name.trim().toLocaleLowerCase("pt-BR") === previousEnterpriseName.trim().toLocaleLowerCase("pt-BR"))
      : undefined);
    candidates.push({ sourceId: value.id, process: value, previousEnterpriseName, enterpriseId: matchingEnterprise?.id ?? "" });
  }
  return { exists: true, invalidCount, unchangedDemoCount, candidates, parseError: false };
}

export function markLegacyProcessImported(sourceId: string, destinationId: string): void {
  const current = importedMap();
  window.localStorage.setItem(IMPORTED_PROCESSES_KEY, JSON.stringify({ ...current, [sourceId]: destinationId }));
}

export function getLegacyProcessBackup(): string | null {
  try { return window.localStorage.getItem(LEGACY_PROCESSES_KEY); }
  catch { return null; }
}
