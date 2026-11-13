export const processTypes = [
  "Licenciamento ambiental",
  "Outorga de uso da água",
  "Renovação de licença",
  "Autorização ambiental",
  "Regularização",
  "Outros",
] as const;

export const processStages = [
  "Preparação",
  "Documentação",
  "Protocolização",
  "Em análise",
  "Exigência ou complementação",
  "Aguardando retorno",
  "Concluído",
] as const;

export const processStatuses = [
  "Rascunho",
  "Em andamento",
  "Aguardando cliente",
  "Aguardando órgão responsável",
  "Concluído",
  "Suspenso",
  "Cancelado",
] as const;

export const processPriorities = ["Baixa", "Média", "Alta", "Urgente"] as const;

export type ProcessType = (typeof processTypes)[number];
export type ProcessStage = (typeof processStages)[number];
export type ProcessStatus = (typeof processStatuses)[number];
export type ProcessPriority = (typeof processPriorities)[number];

export type ProcessHistoryEntry = {
  id: string;
  date: string;
  type: "created" | "stage" | "status" | "updated";
  message: string;
};

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
};

export type ProcessInput = Omit<ProcessRecord, "id" | "history" | "createdAt">;
