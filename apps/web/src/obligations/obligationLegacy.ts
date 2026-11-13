import { demoObligations } from "./obligationDemoData";
import type { ObligationRecord } from "./obligationTypes";

export const LEGACY_OBLIGATIONS_KEY = "juris-connect:demo-obligations:v1";
const IMPORTED_KEY = "juris-connect:demo-obligations:migration:v1";
export type LegacyObligation = ObligationRecord;
export function inspectLegacyObligations() {
  try {
    const raw = window.localStorage.getItem(LEGACY_OBLIGATIONS_KEY);
    if (raw === null) return { exists: false, error: "", candidates: [] as LegacyObligation[] };
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return { exists: true, error: "O conteúdo local não possui o formato esperado.", candidates: [] as LegacyObligation[] };
    let imported: string[] = [];
    try { const value: unknown = JSON.parse(window.localStorage.getItem(IMPORTED_KEY) ?? "[]"); if (Array.isArray(value)) imported = value.filter((item): item is string => typeof item === "string"); } catch { /* retain source data */ }
    const candidates = parsed.filter((item): item is LegacyObligation => {
      if (!item || typeof item !== "object" || typeof item.id !== "string" || typeof item.processId !== "string" || !Array.isArray(item.occurrences) || imported.includes(item.id)) return false;
      return !demoObligations.some((demo) => demo.id === item.id && JSON.stringify(demo) === JSON.stringify(item));
    });
    return { exists: true, error: "", candidates };
  } catch { return { exists: true, error: "Não foi possível ler os dados locais; eles foram preservados.", candidates: [] as LegacyObligation[] }; }
}
export function preserveLegacyBackup(): string | null {
  try {
    const original = window.localStorage.getItem(LEGACY_OBLIGATIONS_KEY);
    if (original !== null && window.localStorage.getItem(`${LEGACY_OBLIGATIONS_KEY}:backup:v1`) === null) window.localStorage.setItem(`${LEGACY_OBLIGATIONS_KEY}:backup:v1`, original);
    return original;
  } catch { return null; }
}
export function markLegacyObligationImported(id: string) {
  let previous: string[] = [];
  try { const value: unknown = JSON.parse(window.localStorage.getItem(IMPORTED_KEY) ?? "[]"); if (Array.isArray(value)) previous = value.filter((item): item is string => typeof item === "string"); } catch { /* no marker to preserve */ }
  window.localStorage.setItem(IMPORTED_KEY, JSON.stringify([...new Set([...previous, id])]));
}
