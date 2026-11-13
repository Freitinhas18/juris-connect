import { demoDocuments } from "./documentDemoData";
import { DOCUMENT_STORAGE_KEY, getDocuments } from "./documentRepository";
import { readDocumentFile } from "./documentStorage";
import type { DocumentRecord } from "./documentTypes";
import { getClients } from "../clients/clientRepository";
import { getEnterprises } from "../enterprises/enterpriseRepository";
import { getProcesses } from "../processes/processRepository";
import { getTasks } from "../tasks/taskRepository";
import { getObligations } from "../obligations/obligationRepository";
import type { ClientRecord } from "../clients/clientTypes";
import type { EnterpriseRecord } from "../enterprises/enterpriseTypes";
import type { ProcessRecord } from "../processes/processTypes";
import type { TaskRecord } from "../tasks/taskTypes";
import type { ObligationRecord } from "../obligations/obligationTypes";

const IMPORTED_KEY = "juris-connect:demo-documents:migration:v1";
export function inspectLegacyDocuments() {
  try {
    const raw = window.localStorage.getItem(DOCUMENT_STORAGE_KEY);
    if (raw === null) return { exists: false, invalid: false, candidates: [] as DocumentRecord[] };
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { return { exists: true, invalid: true, candidates: [] as DocumentRecord[] }; }
    if (!Array.isArray(parsed)) return { exists: true, invalid: true, candidates: [] as DocumentRecord[] };
    const records = getDocuments();
    if (records.length !== parsed.length) return { exists: true, invalid: true, candidates: [] as DocumentRecord[] };
    let imported: string[] = [];
    try { const value: unknown = JSON.parse(window.localStorage.getItem(IMPORTED_KEY) ?? "[]"); if (Array.isArray(value)) imported = value.filter((item): item is string => typeof item === "string"); } catch { /* source remains intact */ }
    const candidates = records.filter((record) => !demoDocuments.some((demo) => demo.id === record.id && JSON.stringify(demo) === JSON.stringify(record)) && !imported.includes(record.id));
    return { exists: true, invalid: false, candidates };
  } catch { return { exists: false, invalid: true, candidates: [] as DocumentRecord[] }; }
}
export async function legacyFile(record: DocumentRecord) {
  const blob = await readDocumentFile(record.id);
  if (!blob) return null;
  return new File([blob], record.originalName, { type: record.mimeType || "application/octet-stream", lastModified: Date.parse(record.addedAt) || Date.now() });
}
export type LegacyAssociationIssue = { kind: "clientIds" | "enterpriseIds" | "processIds" | "taskIds" | "occurrences"; oldValue: string; label: string };
export function mapLegacyLinks(record: DocumentRecord, current: { clients: ClientRecord[]; enterprises: EnterpriseRecord[]; processes: ProcessRecord[]; tasks: TaskRecord[]; obligations: ObligationRecord[] }) {
  const oldClients = getClients(); const oldEnterprises = getEnterprises(); const oldProcesses = getProcesses(); const oldTasks = getTasks(); const oldObligations = getObligations();
  const issues: LegacyAssociationIssue[] = [];
  function mapIds(kind: LegacyAssociationIssue["kind"], ids: string[], oldList: { id: string; name?: string; title?: string }[], currentList: { id: string; name?: string; title?: string }[]) {
    const mapped: string[] = [];
    for (const id of ids) {
      if (currentList.some((item) => item.id === id)) { mapped.push(id); continue; }
      const old = oldList.find((item) => item.id === id); const label = old?.name ?? old?.title ?? id;
      const candidates = old ? currentList.filter((item) => (item.name ?? item.title ?? "").trim().toLocaleLowerCase("pt-BR") === label.trim().toLocaleLowerCase("pt-BR")) : [];
      if (candidates.length === 1) mapped.push(candidates[0].id);
      else issues.push({ kind, oldValue: id, label });
    }
    return mapped;
  }
  const clientIds = mapIds("clientIds", record.links.clientIds, oldClients, current.clients);
  const enterpriseIds = mapIds("enterpriseIds", record.links.enterpriseIds, oldEnterprises, current.enterprises);
  const processIds = mapIds("processIds", record.links.processIds, oldProcesses, current.processes);
  const taskIds = mapIds("taskIds", record.links.taskIds, oldTasks, current.tasks);
  const occurrences: DocumentRecord["links"]["occurrences"] = [];
  for (const link of record.links.occurrences) {
    if (current.obligations.some((obligation) => obligation.id === link.obligationId && obligation.occurrences.some((occurrence) => occurrence.id === link.occurrenceId))) { occurrences.push(link); continue; }
    const oldObligation = oldObligations.find((item) => item.id === link.obligationId);
    const oldOccurrence = oldObligation?.occurrences.find((item) => item.id === link.occurrenceId);
    const candidates = oldObligation && oldOccurrence ? current.obligations.flatMap((item) => item.title.trim().toLocaleLowerCase("pt-BR") === oldObligation.title.trim().toLocaleLowerCase("pt-BR") ? item.occurrences.filter((occurrence) => occurrence.referencePeriod === oldOccurrence.referencePeriod).map((occurrence) => ({ obligationId: item.id, occurrenceId: occurrence.id })) : []) : [];
    if (candidates.length === 1) occurrences.push(candidates[0]);
    else issues.push({ kind: "occurrences", oldValue: `${link.obligationId}|${link.occurrenceId}`, label: `${oldObligation?.title ?? link.obligationId} · ${oldOccurrence?.referencePeriod ?? link.occurrenceId}` });
  }
  return { links: { clientIds, enterpriseIds, processIds, taskIds, occurrences }, issues };
}
export function backupLegacyDocuments() {
  const raw = window.localStorage.getItem(DOCUMENT_STORAGE_KEY);
  if (raw !== null && window.localStorage.getItem(`${DOCUMENT_STORAGE_KEY}:backup:v1`) === null) window.localStorage.setItem(`${DOCUMENT_STORAGE_KEY}:backup:v1`, raw);
  return raw;
}
export function markLegacyDocumentImported(id: string) {
  let previous: string[] = [];
  try { const value: unknown = JSON.parse(window.localStorage.getItem(IMPORTED_KEY) ?? "[]"); if (Array.isArray(value)) previous = value.filter((item): item is string => typeof item === "string"); } catch { /* no prior markers */ }
  window.localStorage.setItem(IMPORTED_KEY, JSON.stringify([...new Set([...previous, id])]));
}
