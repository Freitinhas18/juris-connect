import type { TaskHistoryEntry, TaskInput, TaskPriority, TaskSubtask, TaskTransfer, TaskWaitPeriod, TaskStatus } from "@juris-connect/shared";
export { taskPriorities, taskStatuses } from "@juris-connect/shared";
export type { TaskHistoryEntry, TaskInput, TaskPriority, TaskSubtask, TaskStatus } from "@juris-connect/shared";
export type ResponsibilityTransfer = TaskTransfer;
export type WaitPeriod = TaskWaitPeriod;

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

export type TeamMember = { id: string; name: string; role: string; initials: string; color: string };
