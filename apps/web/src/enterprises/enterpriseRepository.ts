import { demoEnterprises } from "./enterpriseDemoData";
import type { EnterpriseInput, EnterpriseRecord } from "./enterpriseTypes";

const STORAGE_KEY = "juris-connect:demo-enterprises:v1";

function isEnterpriseRecord(value: unknown): value is EnterpriseRecord {
  if (!value || typeof value !== "object") return false;
  const enterprise = value as Partial<EnterpriseRecord>;
  return typeof enterprise.id === "string" && typeof enterprise.clientId === "string" &&
    typeof enterprise.name === "string" && typeof enterprise.type === "string" &&
    typeof enterprise.activity === "string" && typeof enterprise.document === "string" &&
    typeof enterprise.address === "string" && typeof enterprise.municipality === "string" &&
    typeof enterprise.state === "string" && typeof enterprise.manager === "string" &&
    typeof enterprise.description === "string" && typeof enterprise.relatedCases === "number" &&
    typeof enterprise.createdAt === "string" &&
    (enterprise.status === "active" || enterprise.status === "inactive");
}

function copyDemoEnterprises(): EnterpriseRecord[] {
  return demoEnterprises.map((enterprise) => ({ ...enterprise }));
}

export function getEnterprises(): EnterpriseRecord[] {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === null) return copyDemoEnterprises();
    const parsed: unknown = JSON.parse(stored);
    return Array.isArray(parsed) && parsed.every(isEnterpriseRecord) ? parsed : copyDemoEnterprises();
  } catch {
    return copyDemoEnterprises();
  }
}

function save(enterprises: EnterpriseRecord[]): EnterpriseRecord[] {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(enterprises));
  } catch {
    // A interface segue disponível nesta sessão se o navegador bloquear o armazenamento.
  }
  return enterprises;
}

export function createEnterprise(input: EnterpriseInput, current: EnterpriseRecord[]): EnterpriseRecord[] {
  const enterprise: EnterpriseRecord = {
    ...input,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString().slice(0, 10),
  };
  return save([enterprise, ...current]);
}

export function updateEnterprise(id: string, input: EnterpriseInput, current: EnterpriseRecord[]): EnterpriseRecord[] {
  return save(current.map((enterprise) => enterprise.id === id ? { ...enterprise, ...input } : enterprise));
}

export function toggleEnterpriseStatus(id: string, current: EnterpriseRecord[]): EnterpriseRecord[] {
  return save(current.map((enterprise) => enterprise.id === id ? { ...enterprise, status: enterprise.status === "active" ? "inactive" : "active" } : enterprise));
}
