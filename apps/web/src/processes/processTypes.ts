import type { ProcessHistoryEntry, ProcessInput as SharedProcessInput } from "@juris-connect/shared";
export { processPriorities, processStages, processStatuses, processTypes } from "@juris-connect/shared";
export type { ProcessHistoryEntry } from "@juris-connect/shared";

export type ProcessType = (typeof import("@juris-connect/shared").processTypes)[number];
export type ProcessStage = (typeof import("@juris-connect/shared").processStages)[number];
export type ProcessStatus = (typeof import("@juris-connect/shared").processStatuses)[number];
export type ProcessPriority = (typeof import("@juris-connect/shared").processPriorities)[number];

export type ProcessRecord = {
  id: string;
  enterpriseId: string;
  name: string;
  protocol: string;
  processType: ProcessType;
  entity: string;
  description: string;
  manager: string;
  startDate: string;
  dueDate: string;
  priority: ProcessPriority;
  stage: ProcessStage;
  status: ProcessStatus;
  history: ProcessHistoryEntry[];
  createdAt: string;
  updatedAt?: string;
};

export type ProcessInput = SharedProcessInput;
