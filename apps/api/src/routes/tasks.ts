import type { FastifyInstance } from "fastify";
import { and, asc, eq } from "drizzle-orm";
import { createTaskSchema, idParamSchema, taskInputSchema, transferTaskSchema, type TaskHistoryEntry, type TaskStatus, type TaskWaitPeriod } from "@juris-connect/shared";
import { db } from "../db/index.js";
import { processes, tasks } from "../db/schema.js";
import { requireAuth } from "../auth/context.js";

const waitingStatuses = ["Aguardando cliente", "Aguardando órgão ou terceiro"] as const;

function postgresCode(error: unknown): string | undefined {
  const value = error as { code?: string; cause?: { code?: string } };
  return value?.code ?? value?.cause?.code;
}
function log(type: TaskHistoryEntry["type"], message: string, actorId: string, details: Partial<TaskHistoryEntry> = {}): TaskHistoryEntry {
  return { id: crypto.randomUUID(), date: new Date().toISOString(), type, message, actorId, ...details };
}
function isWaiting(status: string): status is TaskWaitPeriod["status"] {
  return waitingStatuses.includes(status as (typeof waitingStatuses)[number]);
}
async function processExists(processId: string, organizationId: string): Promise<boolean> {
  const [process] = await db.select({ id: processes.id }).from(processes).where(and(eq(processes.id, processId), eq(processes.organizationId, organizationId))).limit(1);
  return Boolean(process);
}

export async function taskRoutes(app: FastifyInstance) {
  app.get("/tasks", async (request) => {
    const { organizationId } = requireAuth(request);
    return db.select().from(tasks).where(eq(tasks.organizationId, organizationId)).orderBy(asc(tasks.dueDate), asc(tasks.title));
  });

  app.get("/tasks/:id", async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: "ID de tarefa inválido" });
    const { organizationId } = requireAuth(request);
    const [task] = await db.select().from(tasks).where(and(eq(tasks.id, params.data.id), eq(tasks.organizationId, organizationId))).limit(1);
    if (!task) return reply.status(404).send({ error: "Tarefa não encontrada" });
    return task;
  });

  app.post("/tasks", async (request, reply) => {
    const body = createTaskSchema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: "Dados inválidos", details: body.error.issues });
    const { organizationId, userId } = requireAuth(request);
    if (!await processExists(body.data.processId, organizationId)) return reply.status(400).send({ error: "Processo vinculado não encontrado" });
    const { createdAt, completedAt, history, transfers, waitPeriods, ...input } = body.data;
    const now = new Date();
    const initialWaits: TaskWaitPeriod[] = waitPeriods ?? (isWaiting(input.status)
      ? [{ id: crypto.randomUUID(), status: input.status, startedAt: now.toISOString(), endedAt: null }]
      : []);
    try {
      const [task] = await db.insert(tasks).values({
        ...input,
        organizationId,
        subtasks: input.subtasks,
        history: history?.length ? history : [log("created", "Tarefa criada no PostgreSQL.", userId)],
        transfers: transfers ?? [],
        waitPeriods: initialWaits,
        completedAt: completedAt !== undefined ? (completedAt ? new Date(completedAt) : null) : input.status === "Concluída" ? now : null,
        ...(createdAt ? { createdAt: new Date(createdAt) } : {}),
      }).returning();
      return reply.status(201).send(task);
    } catch (error) {
      if (postgresCode(error) === "23503") return reply.status(400).send({ error: "Processo vinculado não encontrado" });
      throw error;
    }
  });

  app.put("/tasks/:id", async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    const body = taskInputSchema.safeParse(request.body);
    if (!params.success) return reply.status(400).send({ error: "ID de tarefa inválido" });
    if (!body.success) return reply.status(400).send({ error: "Dados inválidos", details: body.error.issues });
    const { organizationId, userId } = requireAuth(request);
    if (!await processExists(body.data.processId, organizationId)) return reply.status(400).send({ error: "Processo vinculado não encontrado" });
    const [current] = await db.select().from(tasks).where(and(eq(tasks.id, params.data.id), eq(tasks.organizationId, organizationId))).limit(1);
    if (!current) return reply.status(404).send({ error: "Tarefa não encontrada" });

    const now = new Date();
    const history = [...current.history];
    let waitPeriods = current.waitPeriods.map((period) => ({ ...period }));
    if (body.data.status !== current.status) {
      history.push(log("status", `Status alterado de ${current.status} para ${body.data.status}.`, userId, { previousStatus: current.status as TaskStatus, newStatus: body.data.status }));
      const wasWaiting = isWaiting(current.status);
      const becomesWaiting = isWaiting(body.data.status);
      if (wasWaiting && (!becomesWaiting || current.status !== body.data.status)) {
        const openIndex = waitPeriods.reduce((last, period, index) => period.endedAt === null ? index : last, -1);
        if (openIndex >= 0) waitPeriods[openIndex] = { ...waitPeriods[openIndex], endedAt: now.toISOString() };
      }
      if (becomesWaiting && (!wasWaiting || current.status !== body.data.status)) {
        waitPeriods.push({ id: crypto.randomUUID(), status: body.data.status as TaskWaitPeriod["status"], startedAt: now.toISOString(), endedAt: null });
      }
    }

    let subtasksChanged = JSON.stringify(current.subtasks) !== JSON.stringify(body.data.subtasks);
    if (subtasksChanged) {
      const beforeById = new Map(current.subtasks.map((item) => [item.id, item]));
      const afterById = new Map(body.data.subtasks.map((item) => [item.id, item]));
      let logged = false;
      for (const item of body.data.subtasks) {
        const previous = beforeById.get(item.id);
        if (!previous) { history.push(log("subtask", `Subtarefa adicionada: ${item.title}`, userId)); logged = true; }
        else if (previous.completed !== item.completed) { history.push(log("subtask", `${item.completed ? "Subtarefa concluída" : "Subtarefa reaberta"}: ${item.title}`, userId)); logged = true; }
      }
      if (!logged || [...beforeById.keys()].some((id) => !afterById.has(id))) history.push(log("subtask", "Lista de subtarefas atualizada.", userId));
    }
    const { status, subtasks, ...otherFields } = body.data;
    const otherFieldsChanged = Object.entries(otherFields).some(([key, value]) => value !== current[key as keyof typeof current]);
    if (otherFieldsChanged) history.push(log("updated", "Informações da tarefa atualizadas.", userId));
    const completedAt = status === "Concluída" ? current.completedAt ?? now : null;
    try {
      const [task] = await db.update(tasks).set({ ...body.data, history, waitPeriods, completedAt, updatedAt: now }).where(and(eq(tasks.id, params.data.id), eq(tasks.organizationId, organizationId))).returning();
      return task;
    } catch (error) {
      if (postgresCode(error) === "23503") return reply.status(400).send({ error: "Processo vinculado não encontrado" });
      throw error;
    }
  });

  app.post("/tasks/:id/transfers", async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    const body = transferTaskSchema.safeParse(request.body);
    if (!params.success) return reply.status(400).send({ error: "ID de tarefa inválido" });
    if (!body.success) return reply.status(400).send({ error: "Dados inválidos", details: body.error.issues });
    const { organizationId, userId } = requireAuth(request);
    const [current] = await db.select().from(tasks).where(and(eq(tasks.id, params.data.id), eq(tasks.organizationId, organizationId))).limit(1);
    if (!current) return reply.status(404).send({ error: "Tarefa não encontrada" });
    if (current.assigneeId === body.data.toAssigneeId) return reply.status(400).send({ error: "Escolha um integrante diferente do responsável atual" });
    const now = new Date().toISOString();
    const transfer = { id: crypto.randomUUID(), fromAssigneeId: current.assigneeId, toAssigneeId: body.data.toAssigneeId, date: now, justification: body.data.justification };
    const history = log("transfer", `Responsabilidade transferida. Justificativa: ${body.data.justification}`, userId);
    const [task] = await db.update(tasks).set({
      assigneeId: body.data.toAssigneeId,
      transfers: [...current.transfers, transfer],
      history: [...current.history, history],
      updatedAt: new Date(now),
    }).where(and(eq(tasks.id, params.data.id), eq(tasks.organizationId, organizationId))).returning();
    return task;
  });

  app.delete("/tasks/:id", async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: "ID de tarefa inválido" });
    const { organizationId } = requireAuth(request);
    try {
      const [task] = await db.delete(tasks).where(and(eq(tasks.id, params.data.id), eq(tasks.organizationId, organizationId))).returning({ id: tasks.id });
      if (!task) return reply.status(404).send({ error: "Tarefa não encontrada" });
      return reply.status(204).send();
    } catch (error) {
      if (postgresCode(error) === "23503") return reply.status(409).send({ error: "Tarefa possui documentos relacionados e não pode ser excluída" });
      throw error;
    }
  });
}
