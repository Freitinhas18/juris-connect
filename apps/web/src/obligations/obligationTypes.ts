import type { TeamMember } from "../tasks/taskTypes";

export const periodicities = ["Pontual", "Mensal", "Trimestral", "Semestral", "Anual"] as const;
export const occurrenceStatuses = ["Programada", "Em preparação", "Aguardando validação", "Cumprida", "Atrasada", "Dispensada"] as const;

export type Periodicity = (typeof periodicities)[number];
export type OccurrenceStatus = (typeof occurrenceStatuses)[number];
export type ObligationStatus = "active" | "inactive";
export type ObligationHistoryEntry = { id: string; date: string; message: string; actorId: TeamMember["id"] };
export type OccurrenceHistoryEntry = { id: string; date: string; message: string; actorId: TeamMember["id"]; fromStatus?: OccurrenceStatus; toStatus?: OccurrenceStatus };
export type ObligationEvidence = { id: string; name: string; description: string; deliveredAt: string; notes: string };

export type ObligationOccurrence = {
  id: string;
  obligationId: string;
  referencePeriod: string;
  dueDate: string;
  status: OccurrenceStatus;
  responsibleId: TeamMember["id"];
  completedAt: string | null;
  evidence: ObligationEvidence[];
  observations: string;
  history: OccurrenceHistoryEntry[];
};

export type ObligationRecord = {
  id: string;
  title: string;
  description: string;
  processId: string;
  reference: string;
  authority: string;
  responsibleId: TeamMember["id"];
  periodicity: Periodicity;
  firstDueDate: string;
  requirements: string;
  expectedEvidence: string;
  status: ObligationStatus;
  createdAt: string;
  history: ObligationHistoryEntry[];
  occurrences: ObligationOccurrence[];
};

export type ObligationInput = Omit<ObligationRecord, "id" | "createdAt" | "history" | "occurrences">;
export type OccurrenceInput = Pick<ObligationOccurrence, "status" | "responsibleId" | "observations">;
