import type { Server as HttpServer } from "node:http";
import type { FastifyBaseLogger } from "fastify";
import { Server } from "socket.io";
import { eq } from "drizzle-orm";
import {
  SOCKET_EVENTS,
  idParamSchema,
  sendMessageSchema,
  type ChatMessage,
} from "@juris-connect/shared";
import { db } from "./db/index.js";
import { channels, messages, users } from "./db/schema.js";

type Ack = (response: { ok: true } | { ok: false; error: string }) => void;

const roomOf = (channelId: string) => `channel:${channelId}`;

export function setupSocket(httpServer: HttpServer, log: FastifyBaseLogger) {
  const io = new Server(httpServer, {
    cors: { origin: "http://localhost:5173" },
  });

  // PROVISÓRIO: identifica o usuário pelo id enviado na conexão.
  // Será substituído pela autenticação real (login + token) no passo 7.
  io.use(async (socket, next) => {
    try {
      const parsed = idParamSchema.safeParse({
        id: socket.handshake.auth.userId,
      });
      if (!parsed.success) return next(new Error("userId inválido"));

      const [user] = await db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(eq(users.id, parsed.data.id));
      if (!user) return next(new Error("Usuário não encontrado"));

      socket.data.userId = user.id;
      socket.data.userName = user.name;
      next();
    } catch (err) {
      log.error(err);
      next(new Error("Erro interno"));
    }
  });

  io.on("connection", (socket) => {
    socket.on(
      SOCKET_EVENTS.joinChannel,
      async (payload: unknown, ack?: Ack) => {
        const parsed = idParamSchema.safeParse({ id: payload });
        if (!parsed.success) return ack?.({ ok: false, error: "Canal inválido" });

        try {
          const [channel] = await db
            .select({ id: channels.id })
            .from(channels)
            .where(eq(channels.id, parsed.data.id));
          if (!channel) {
            return ack?.({ ok: false, error: "Canal não encontrado" });
          }
          await socket.join(roomOf(channel.id));
          ack?.({ ok: true });
        } catch (err) {
          log.error(err);
          ack?.({ ok: false, error: "Erro ao entrar no canal" });
        }
      },
    );

    socket.on(
      SOCKET_EVENTS.sendMessage,
      async (payload: unknown, ack?: Ack) => {
        const parsed = sendMessageSchema.safeParse(payload);
        if (!parsed.success) return ack?.({ ok: false, error: "Mensagem inválida" });

        const { channelId, content } = parsed.data;
        if (!socket.rooms.has(roomOf(channelId))) {
          return ack?.({
            ok: false,
            error: "Entre no canal antes de enviar mensagens",
          });
        }

        try {
          const [saved] = await db
            .insert(messages)
            .values({ channelId, authorId: socket.data.userId, content })
            .returning();

          const message: ChatMessage = {
            id: saved.id,
            channelId: saved.channelId,
            authorId: saved.authorId,
            authorName: socket.data.userName,
            content: saved.content,
            createdAt: saved.createdAt.toISOString(),
          };
          io.to(roomOf(channelId)).emit(SOCKET_EVENTS.newMessage, message);
          ack?.({ ok: true });
        } catch (err) {
          log.error(err);
          ack?.({ ok: false, error: "Erro ao salvar a mensagem" });
        }
      },
    );
  });

  return io;
}