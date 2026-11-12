import type { FastifyInstance } from "fastify";
import { and, desc, eq, lt } from "drizzle-orm";
import {
  createChannelSchema,
  historyQuerySchema,
  idParamSchema,
  type ChatMessage,
} from "@juris-connect/shared";
import { db } from "../db/index.js";
import { channels, messages, users } from "../db/schema.js";

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === "23505" || e?.cause?.code === "23505";
}

export async function channelRoutes(app: FastifyInstance) {
  app.get("/channels", async () => {
    return db.select().from(channels).orderBy(channels.name);
  });

  app.post("/channels", async (request, reply) => {
    const body = createChannelSchema.safeParse(request.body);
    if (!body.success) {
      return reply
        .status(400)
        .send({ error: "Dados inválidos", details: body.error.issues });
    }
    try {
      const [channel] = await db
        .insert(channels)
        .values(body.data)
        .returning();
      return reply.status(201).send(channel);
    } catch (err) {
      if (isUniqueViolation(err)) {
        return reply
          .status(409)
          .send({ error: "Já existe um canal com esse nome" });
      }
      throw err;
    }
  });

  app.get("/channels/:id/messages", async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    const query = historyQuerySchema.safeParse(request.query);
    if (!params.success || !query.success) {
      return reply.status(400).send({ error: "Parâmetros inválidos" });
    }
    const { id } = params.data;
    const { before, limit } = query.data;

    const [channel] = await db
      .select({ id: channels.id })
      .from(channels)
      .where(eq(channels.id, id));
    if (!channel) {
      return reply.status(404).send({ error: "Canal não encontrado" });
    }

    const rows = await db
      .select({
        id: messages.id,
        channelId: messages.channelId,
        authorId: messages.authorId,
        authorName: users.name,
        content: messages.content,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .innerJoin(users, eq(messages.authorId, users.id))
      .where(
        and(
          eq(messages.channelId, id),
          before ? lt(messages.createdAt, before) : undefined,
        ),
      )
      .orderBy(desc(messages.createdAt))
      .limit(limit);

    const history: ChatMessage[] = rows.reverse().map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
    }));
    return history;
  });
}