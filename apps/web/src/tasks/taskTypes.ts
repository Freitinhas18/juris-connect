export const taskStatuses = [
  "A fazer",
  "Em andamento",
  "Em revisão",
  "Aguardando cliente",
  "Aguardando órgão ou terceiro",
  "Concluída",
  "Cancelada",
] as const;

export const taskPriorities = ["Baixa", "Média", "Alta", "Urgente"] as const;

export type TaskStatus = (typeof taskStatuses)[number];
export type TaskPriority = (typeof taskPriorities)[number];
export type TaskSubtask = { id: string; title: string; completed: boolean };

export type TaskHistoryEntry = {
  id: string;
  date: string;
  type: "created" | "status" | "transfer" | "subtask" | "updated";
  message: string;
  previousStatus?: TaskStatus;
  newStatus?: TaskStatus;
  actorId: string;
};

export type ResponsibilityTransfer = {
  id: string;
  fromAssigneeId: string;
  toAssigneeId: string;
  date: string;
  justification: string;
};

export type WaitPeriod = {
  id: string;
  status: Extract<TaskStatus, "Aguardando cliente" | "Aguardando órgão ou terceiro">;
  startedAt: string;
  endedAt: string | null;
};

export type TaskRecord = {
  id: string;
  title: string;
  description: string;
  processId: string;
  assigneeId: string;
  status: TaskStatus;
  priority: TaskPriority;
  createdAt: string;
  startDate: string;
  dueDate: string;
  completedAt: string | null;
  subtasks: TaskSubtask[];
  history: TaskHistoryEntry[];
  transfers: ResponsibilityTransfer[];
  waitPeriods: WaitPeriod[];
};

export type TaskInput = Pick<TaskRecord, "title" | "description" | "processId" | "assigneeId" | "status" | "priority" | "startDate" | "dueDate" | "subtasks">;

export type TeamMember = { id: string; name: string; role: string; initials: string; color: string };
