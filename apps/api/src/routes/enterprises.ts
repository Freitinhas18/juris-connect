import type { FastifyInstance } from "fastify";
import { and, asc, count, eq } from "drizzle-orm";
import { createEnterpriseSchema, enterpriseInputSchema, idParamSchema } from "@juris-connect/shared";
import { db } from "../db/index.js";
import { clients, enterprises, processes } from "../db/schema.js";
import { requireAuth } from "../auth/context.js";

function postgresCode(error: unknown): string | undefined {
  const value = error as { code?: string; cause?: { code?: string } };
  return value?.code ?? value?.cause?.code;
}

async function clientExists(clientId: string, organizationId: string): Promise<boolean> {
  const [client] = await db.select({ id: clients.id }).from(clients).where(and(eq(clients.id, clientId), eq(clients.organizationId, organizationId))).limit(1);
  return Boolean(client);
}

export async function enterpriseRoutes(app: FastifyInstance) {
  app.get("/enterprises", async (request) => {
    const { organizationId } = requireAuth(request);
    const records = await db.select({ enterprise: enterprises, relatedCases: count(processes.id) })
      .from(enterprises).leftJoin(processes, and(eq(processes.enterpriseId, enterprises.id), eq(processes.organizationId, organizationId)))
      .where(eq(enterprises.organizationId, organizationId)).groupBy(enterprises.id).orderBy(asc(enterprises.name));
    return records.map(({ enterprise, relatedCases }) => ({ ...enterprise, relatedCases }));
  });

  app.get("/enterprises/:id", async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: "ID de empreendimento inválido" });
    const { organizationId } = requireAuth(request);
    const [record] = await db.select({ enterprise: enterprises, relatedCases: count(processes.id) })
      .from(enterprises).leftJoin(processes, and(eq(processes.enterpriseId, enterprises.id), eq(processes.organizationId, organizationId)))
      .where(and(eq(enterprises.id, params.data.id), eq(enterprises.organizationId, organizationId))).groupBy(enterprises.id).limit(1);
    if (!record) return reply.status(404).send({ error: "Empreendimento não encontrado" });
    return { ...record.enterprise, relatedCases: record.relatedCases };
  });

  app.post("/enterprises", async (request, reply) => {
    const body = createEnterpriseSchema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: "Dados inválidos", details: body.error.issues });
    const { organizationId } = requireAuth(request);
    if (!await clientExists(body.data.clientId, organizationId)) return reply.status(400).send({ error: "Cliente vinculado não encontrado" });
    const { createdAt, ...input } = body.data;
    try {
      const [enterprise] = await db.insert(enterprises).values({ ...input, organizationId, relatedCases: 0, ...(createdAt ? { createdAt: new Date(createdAt) } : {}) }).returning();
      return reply.status(201).send({ ...enterprise, relatedCases: 0 });
    } catch (error) {
      if (postgresCode(error) === "23503") return reply.status(400).send({ error: "Cliente vinculado não encontrado" });
      throw error;
    }
  });

  app.put("/enterprises/:id", async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    const body = enterpriseInputSchema.safeParse(request.body);
    if (!params.success) return reply.status(400).send({ error: "ID de empreendimento inválido" });
    if (!body.success) return reply.status(400).send({ error: "Dados inválidos", details: body.error.issues });
    const { organizationId } = requireAuth(request);
    if (!await clientExists(body.data.clientId, organizationId)) return reply.status(400).send({ error: "Cliente vinculado não encontrado" });
    try {
      const [enterprise] = await db.update(enterprises).set({ ...body.data, relatedCases: 0, updatedAt: new Date() }).where(and(eq(enterprises.id, params.data.id), eq(enterprises.organizationId, organizationId))).returning();
      if (!enterprise) return reply.status(404).send({ error: "Empreendimento não encontrado" });
      const [{ relatedCases }] = await db.select({ relatedCases: count(processes.id) }).from(processes).where(and(eq(processes.enterpriseId, enterprise.id), eq(processes.organizationId, organizationId)));
      return { ...enterprise, relatedCases };
    } catch (error) {
      if (postgresCode(error) === "23503") return reply.status(400).send({ error: "Cliente vinculado não encontrado" });
      throw error;
    }
  });

  app.delete("/enterprises/:id", async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: "ID de empreendimento inválido" });
    const { organizationId } = requireAuth(request);
    try {
      const [enterprise] = await db.delete(enterprises).where(and(eq(enterprises.id, params.data.id), eq(enterprises.organizationId, organizationId))).returning({ id: enterprises.id });
      if (!enterprise) return reply.status(404).send({ error: "Empreendimento não encontrado" });
      return reply.status(204).send();
    } catch (error) {
      if (postgresCode(error) === "23503") return reply.status(409).send({ error: "Empreendimento possui processos ou documentos relacionados e não pode ser excluído" });
      throw error;
    }
  });
}
