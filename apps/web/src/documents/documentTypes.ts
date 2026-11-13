export const documentCategories = ["Licenças e autorizações", "Relatórios técnicos", "Protocolos", "Pareceres", "Comprovantes", "Contratos", "Documentos cadastrais", "Evidências de cumprimento", "Outros"] as const;
export const documentStatuses = ["Pendente", "Em análise", "Aprovado", "Rejeitado"] as const;
export type DocumentCategory = (typeof documentCategories)[number];
export type DocumentStatus = (typeof documentStatuses)[number];
export type DocumentLinks = { clientIds: string[]; enterpriseIds: string[]; processIds: string[]; taskIds: string[]; occurrences: { obligationId: string; occurrenceId: string }[] };
export type DocumentHistoryEntry = { id: string; date: string; message: string; actor: string };
export type DocumentRecord = { id: string; name: string; originalName: string; extension: string; mimeType: string; size: number; addedAt: string; description: string; category: DocumentCategory; responsible: string; status: DocumentStatus; links: DocumentLinks; history: DocumentHistoryEntry[] };
export type DocumentInput = Pick<DocumentRecord, "name" | "description" | "category" | "responsible" | "status" | "links">;
