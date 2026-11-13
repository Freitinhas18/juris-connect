import type { FastifyInstance } from "fastify";
import { and, desc, eq, lt } from "drizzle-orm";
import {
  createChannelSchema,
  historyQuerySchema,
  idParamSchema,
  type ChatMessage,
} from "@juris-connect/shared";
import { db } from "../db/index.js";
import { channelMemberships, channels, messages, users } from "../db/schema.js";
import { requireAuth } from "../auth/context.js";

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === "23505" || e?.cause?.code === "23505";
}

export async function channelRoutes(app: FastifyInstance) {
  app.get("/channels", async (request) => {
    const { organizationId, userId } = requireAuth(request);
    const [channelRows, memberRows] = await Promise.all([
      db.select().from(channels).where(eq(channels.organizationId, organizationId)).orderBy(channels.name),
      db.select({ channelId: channelMemberships.channelId }).from(channelMemberships).where(and(eq(channelMemberships.organizationId, organizationId), eq(channelMemberships.userId, userId))),
    ]);
    const memberships = new Set(memberRows.map(({ channelId }) => channelId));
    return channelRows.filter((channel) => !channel.isPrivate || memberships.has(channel.id));
  });

  app.post("/channels", async (request, reply) => {
    const body = createChannelSchema.safeParse(request.body);
    if (!body.success) {
      return reply
        .status(400)
        .send({ error: "Dados inválidos", details: body.error.issues });
    }
    const { organizationId, userId } = requireAuth(request);
    try {
      const channel = await db.transaction(async (tx) => {
        const [created] = await tx.insert(channels).values({ ...body.data, organizationId }).returning();
        if (created!.isPrivate) await tx.insert(channelMemberships).values({ organizationId, channelId: created!.id, userId });
        return created!;
      });
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
    const { organizationId, userId } = requireAuth(request);

    const [channel] = await db
      .select({ id: channels.id, isPrivate: channels.isPrivate })
      .from(channels)
      .where(and(eq(channels.id, id), eq(channels.organizationId, organizationId)));
    if (!channel) {
      return reply.status(404).send({ error: "Canal não encontrado" });
    }
    if (channel.isPrivate) {
      const [membership] = await db.select({ id: channelMemberships.id }).from(channelMemberships).where(and(eq(channelMemberships.organizationId, organizationId), eq(channelMemberships.channelId, id), eq(channelMemberships.userId, userId))).limit(1);
      if (!membership) return reply.status(404).send({ error: "Canal não encontrado" });
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
          eq(messages.organizationId, organizationId),
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
