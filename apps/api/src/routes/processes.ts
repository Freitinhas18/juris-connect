import type { FastifyInstance } from "fastify";
import { and, asc, eq } from "drizzle-orm";
import { createProcessSchema, idParamSchema, processInputSchema, type ProcessHistoryEntry } from "@juris-connect/shared";
import { db } from "../db/index.js";
import { enterprises, processes } from "../db/schema.js";
import { requireAuth } from "../auth/context.js";

function postgresCode(error: unknown): string | undefined {
  const value = error as { code?: string; cause?: { code?: string } };
  return value?.code ?? value?.cause?.code;
}

function historyEntry(type: ProcessHistoryEntry["type"], message: string): ProcessHistoryEntry {
  return { id: crypto.randomUUID(), date: new Date().toISOString(), type, message };
}

async function enterpriseExists(enterpriseId: string, organizationId: string): Promise<boolean> {
  const [enterprise] = await db.select({ id: enterprises.id }).from(enterprises).where(and(eq(enterprises.id, enterpriseId), eq(enterprises.organizationId, organizationId))).limit(1);
  return Boolean(enterprise);
}

export async function processRoutes(app: FastifyInstance) {
  app.get("/processes", async (request) => {
    const { organizationId } = requireAuth(request);
    return db.select().from(processes).where(eq(processes.organizationId, organizationId)).orderBy(asc(processes.dueDate), asc(processes.name));
  });

  app.get("/processes/:id", async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: "ID de processo inválido" });
    const { organizationId } = requireAuth(request);
    const [process] = await db.select().from(processes).where(and(eq(processes.id, params.data.id), eq(processes.organizationId, organizationId))).limit(1);
    if (!process) return reply.status(404).send({ error: "Processo não encontrado" });
    return process;
  });

  app.post("/processes", async (request, reply) => {
    const body = createProcessSchema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: "Dados inválidos", details: body.error.issues });
    const { organizationId } = requireAuth(request);
    if (!await enterpriseExists(body.data.enterpriseId, organizationId)) return reply.status(400).send({ error: "Empreendimento vinculado não encontrado" });
    const { createdAt, history, ...input } = body.data;
    const entries = history?.length ? history : [historyEntry("created", "Processo cadastrado no PostgreSQL.")];
    try {
      const [process] = await db.insert(processes).values({
        ...input,
        organizationId,
        history: entries,
        ...(createdAt ? { createdAt: new Date(createdAt) } : {}),
      }).returning();
      return reply.status(201).send(process);
    } catch (error) {
      if (postgresCode(error) === "23503") return reply.status(400).send({ error: "Empreendimento vinculado não encontrado" });
      throw error;
    }
  });

  app.put("/processes/:id", async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    const body = processInputSchema.safeParse(request.body);
    if (!params.success) return reply.status(400).send({ error: "ID de processo inválido" });
    if (!body.success) return reply.status(400).send({ error: "Dados inválidos", details: body.error.issues });
    const { organizationId } = requireAuth(request);
    if (!await enterpriseExists(body.data.enterpriseId, organizationId)) return reply.status(400).send({ error: "Empreendimento vinculado não encontrado" });

    const [current] = await db.select().from(processes).where(and(eq(processes.id, params.data.id), eq(processes.organizationId, organizationId))).limit(1);
    if (!current) return reply.status(404).send({ error: "Processo não encontrado" });
    const history = [...current.history];
    if (body.data.stage !== current.stage) history.push(historyEntry("stage", `Etapa atualizada para ${body.data.stage}.`));
    if (body.data.status !== current.status) history.push(historyEntry("status", `Status alterado para ${body.data.status}.`));
    const otherFieldsChanged = Object.entries(body.data).some(([key, value]) => {
      if (key === "stage" || key === "status") return false;
      return value !== current[key as keyof typeof current];
    });
    if (otherFieldsChanged) history.push(historyEntry("updated", "Informações gerais do processo atualizadas."));

    try {
      const [process] = await db.update(processes)
        .set({ ...body.data, history, updatedAt: new Date() })
        .where(and(eq(processes.id, params.data.id), eq(processes.organizationId, organizationId))).returning();
      return process;
    } catch (error) {
      if (postgresCode(error) === "23503") return reply.status(400).send({ error: "Empreendimento vinculado não encontrado" });
      throw error;
    }
  });

  app.delete("/processes/:id", async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: "ID de processo inválido" });
    const { organizationId } = requireAuth(request);
    try {
      const [process] = await db.delete(processes).where(and(eq(processes.id, params.data.id), eq(processes.organizationId, organizationId))).returning({ id: processes.id });
      if (!process) return reply.status(404).send({ error: "Processo não encontrado" });
      return reply.status(204).send();
    } catch (error) {
      if (postgresCode(error) === "23503") return reply.status(409).send({ error: "Processo possui tarefas, condicionantes ou documentos relacionados e não pode ser excluído" });
      throw error;
    }
  });
}
