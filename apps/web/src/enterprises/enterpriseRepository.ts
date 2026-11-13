import { demoClients } from "../clients/clientDemoData";
import { demoEnterprises } from "./enterpriseDemoData";
import type { ClientRecord } from "../clients/clientTypes";
import type { EnterpriseRecord } from "./enterpriseTypes";

export const LEGACY_ENTERPRISES_KEY = "juris-connect:demo-enterprises:v1";
const LEGACY_CLIENTS_KEY = "juris-connect:demo-clients:v1";
const IMPORTED_ENTERPRISES_KEY = "juris-connect:demo-enterprises:migration:v1";

export type LegacyEnterpriseCandidate = {
  sourceId: string;
  enterprise: EnterpriseRecord;
  previousClientName: string;
  clientId: string;
};
export type LegacyEnterpriseInspection = {
  exists: boolean;
  invalidCount: number;
  unchangedDemoCount: number;
  candidates: LegacyEnterpriseCandidate[];
  parseError: boolean;
};

// Synchronous demo source retained for modules that have not yet moved to the API.
export function getEnterprises(): EnterpriseRecord[] { return demoEnterprises.map((record) => ({ ...record })); }

function isRecord(value: unknown): value is EnterpriseRecord {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<EnterpriseRecord>;
  return typeof item.id === "string" && typeof item.clientId === "string" &&
    typeof item.name === "string" && typeof item.type === "string" &&
    typeof item.activity === "string" && typeof item.document === "string" &&
    typeof item.address === "string" && typeof item.municipality === "string" &&
    typeof item.state === "string" && typeof item.manager === "string" &&
    typeof item.description === "string" && typeof item.relatedCases === "number" &&
    typeof item.createdAt === "string" && (item.status === "active" || item.status === "inactive");
}

function unchangedDemo(record: EnterpriseRecord): boolean {
  const original = demoEnterprises.find((item) => item.id === record.id);
  if (!original) return false;
  return (Object.keys(original) as (keyof EnterpriseRecord)[]).every((key) => record[key] === original[key]);
}

function oldClientName(clientId: string): string {
  const demoClient = demoClients.find((client) => client.id === clientId);
  if (demoClient) return demoClient.name;
  try {
    const raw = window.localStorage.getItem(LEGACY_CLIENTS_KEY);
    const parsed: unknown = raw === null ? null : JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const match = parsed.find((item) => item && typeof item === "object" && "id" in item && item.id === clientId && "name" in item && typeof item.name === "string");
      if (match && "name" in match && typeof match.name === "string") return match.name;
    }
  } catch { /* An unreadable legacy client list does not block review of enterprise data. */ }
  return "";
}

function importedMap(): Record<string, string> {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(IMPORTED_ENTERPRISES_KEY) ?? "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  } catch { return {}; }
}

export function inspectLegacyEnterprises(clients: ClientRecord[]): LegacyEnterpriseInspection {
  let raw: string | null;
  try { raw = window.localStorage.getItem(LEGACY_ENTERPRISES_KEY); }
  catch { return { exists: false, invalidCount: 0, unchangedDemoCount: 0, candidates: [], parseError: true }; }
  if (raw === null) return { exists: false, invalidCount: 0, unchangedDemoCount: 0, candidates: [], parseError: false };
  let parsed: unknown;
  try { parsed = JSON.parse(raw); }
  catch { return { exists: true, invalidCount: 1, unchangedDemoCount: 0, candidates: [], parseError: true }; }
  if (!Array.isArray(parsed)) return { exists: true, invalidCount: 1, unchangedDemoCount: 0, candidates: [], parseError: true };
  const done = importedMap();
  let invalidCount = 0;
  let unchangedDemoCount = 0;
  const candidates: LegacyEnterpriseCandidate[] = [];
  for (const value of parsed) {
    if (!isRecord(value)) { invalidCount++; continue; }
    if (unchangedDemo(value)) { unchangedDemoCount++; continue; }
    if (done[value.id]) continue;
    const previousClientName = oldClientName(value.clientId);
    const directMatch = clients.find((client) => client.id === value.clientId);
    const nameMatch = previousClientName ? clients.find((client) => client.name.trim().toLocaleLowerCase("pt-BR") === previousClientName.trim().toLocaleLowerCase("pt-BR")) : undefined;
    candidates.push({ sourceId: value.id, enterprise: value, previousClientName, clientId: directMatch?.id ?? nameMatch?.id ?? "" });
  }
  return { exists: true, invalidCount, unchangedDemoCount, candidates, parseError: false };
}

export function markLegacyEnterpriseImported(sourceId: string, destinationId: string): void {
  const current = importedMap();
  window.localStorage.setItem(IMPORTED_ENTERPRISES_KEY, JSON.stringify({ ...current, [sourceId]: destinationId }));
}

export function getLegacyEnterpriseBackup(): string | null {
  try { return window.localStorage.getItem(LEGACY_ENTERPRISES_KEY); }
  catch { return null; }
}
