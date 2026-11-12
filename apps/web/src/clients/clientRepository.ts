import { demoClients } from "./clientDemoData";
import type { ClientInput, ClientRecord } from "./clientTypes";

const STORAGE_KEY = "juris-connect:demo-clients:v1";

function isClientRecord(value: unknown): value is ClientRecord {
  if (!value || typeof value !== "object") return false;
  const client = value as Partial<ClientRecord>;
  return typeof client.id === "string" && typeof client.name === "string" &&
    typeof client.kind === "string" && typeof client.contactName === "string" &&
    typeof client.email === "string" && typeof client.phone === "string" &&
    typeof client.address === "string" && typeof client.notes === "string" &&
    Array.isArray(client.ventures) && (client.status === "active" || client.status === "inactive");
}

export function getClients(): ClientRecord[] {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === null) return demoClients.map((client) => ({ ...client, ventures: [...client.ventures] }));
    const parsed: unknown = JSON.parse(stored);
    return Array.isArray(parsed) && parsed.every(isClientRecord) ? parsed : demoClients.map((client) => ({ ...client, ventures: [...client.ventures] }));
  } catch {
    return demoClients.map((client) => ({ ...client, ventures: [...client.ventures] }));
  }
}

function save(clients: ClientRecord[]): ClientRecord[] {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(clients));
  } catch {
    // A interface continua utilizável nesta sessão se o navegador bloquear o armazenamento.
  }
  return clients;
}

export function createClient(input: ClientInput, current: ClientRecord[]): ClientRecord[] {
  const client: ClientRecord = {
    ...input,
    id: crypto.randomUUID(),
    ventures: [],
    createdAt: new Date().toISOString().slice(0, 10),
  };
  return save([client, ...current]);
}

export function updateClient(id: string, input: ClientInput, current: ClientRecord[]): ClientRecord[] {
  return save(current.map((client) => client.id === id ? { ...client, ...input } : client));
}

export function toggleClientStatus(id: string, current: ClientRecord[]): ClientRecord[] {
  return save(current.map((client) => client.id === id ? { ...client, status: client.status === "active" ? "inactive" : "active" } : client));
}
