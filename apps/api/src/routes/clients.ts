import type { FastifyInstance } from "fastify";
import { and, asc, eq } from "drizzle-orm";
import { clientInputSchema, idParamSchema } from "@juris-connect/shared";
import { db } from "../db/index.js";
import { clients } from "../db/schema.js";
import { requireAuth } from "../auth/context.js";

function postgresCode(error: unknown): string | undefined {
  const value = error as { code?: string; cause?: { code?: string } };
  return value?.code ?? value?.cause?.code;
}

export async function clientRoutes(app: FastifyInstance) {
  app.get("/clients", async (request) => {
    const { organizationId } = requireAuth(request);
    return db.select().from(clients).where(eq(clients.organizationId, organizationId)).orderBy(asc(clients.name));
  });

  app.get("/clients/:id", async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: "ID de cliente inválido" });
    const { organizationId } = requireAuth(request);
    const [client] = await db.select().from(clients).where(and(eq(clients.id, params.data.id), eq(clients.organizationId, organizationId))).limit(1);
    if (!client) return reply.status(404).send({ error: "Cliente não encontrado" });
    return client;
  });

  app.post("/clients", async (request, reply) => {
    const body = clientInputSchema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: "Dados inválidos", details: body.error.issues });
    const { organizationId } = requireAuth(request);
    const [client] = await db.insert(clients).values({ ...body.data, organizationId }).returning();
    return reply.status(201).send(client);
  });

  app.put("/clients/:id", async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    const body = clientInputSchema.safeParse(request.body);
    if (!params.success) return reply.status(400).send({ error: "ID de cliente inválido" });
    if (!body.success) return reply.status(400).send({ error: "Dados inválidos", details: body.error.issues });
    const { organizationId } = requireAuth(request);
    const [client] = await db.update(clients).set({ ...body.data, updatedAt: new Date() }).where(and(eq(clients.id, params.data.id), eq(clients.organizationId, organizationId))).returning();
    if (!client) return reply.status(404).send({ error: "Cliente não encontrado" });
    return client;
  });

  app.delete("/clients/:id", async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: "ID de cliente inválido" });
    const { organizationId } = requireAuth(request);
    try {
      const [client] = await db.delete(clients).where(and(eq(clients.id, params.data.id), eq(clients.organizationId, organizationId))).returning({ id: clients.id });
      if (!client) return reply.status(404).send({ error: "Cliente não encontrado" });
      return reply.status(204).send();
    } catch (error) {
      if (postgresCode(error) === "23503") return reply.status(409).send({ error: "Cliente possui registros relacionados e não pode ser excluído" });
      throw error;
    }
  });
}
