import { demoDocuments } from "./documentDemoData";
import type { DocumentRecord } from "./documentTypes";

// Read-only compatibility layer for importing records created by the previous local demo.
export const DOCUMENT_STORAGE_KEY = "juris-connect:demo-documents:v1";
function valid(value: unknown): value is DocumentRecord {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<DocumentRecord>;
  return typeof item.id === "string" && typeof item.name === "string" && typeof item.originalName === "string" &&
    typeof item.extension === "string" && typeof item.mimeType === "string" && typeof item.size === "number" &&
    typeof item.addedAt === "string" && typeof item.description === "string" && typeof item.category === "string" &&
    typeof item.responsible === "string" && typeof item.status === "string" && Boolean(item.links &&
      Array.isArray(item.links.clientIds) && Array.isArray(item.links.enterpriseIds) && Array.isArray(item.links.processIds) &&
      Array.isArray(item.links.taskIds) && Array.isArray(item.links.occurrences)) && Array.isArray(item.history);
}
export function getDocuments(): DocumentRecord[] {
  try {
    const saved = window.localStorage.getItem(DOCUMENT_STORAGE_KEY);
    if (saved === null) return demoDocuments;
    const parsed: unknown = JSON.parse(saved);
    return Array.isArray(parsed) && parsed.every(valid) ? parsed.map((item) => ({ ...item, updatedAt: item.updatedAt || item.addedAt })) : [];
  } catch { return []; }
}
