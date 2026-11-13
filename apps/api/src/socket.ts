import type { Server as HttpServer } from "node:http";
import type { FastifyBaseLogger } from "fastify";
import { Server, type Socket } from "socket.io";
import { and, eq } from "drizzle-orm";
import {
  SOCKET_EVENTS,
  idParamSchema,
  sendMessageSchema,
  type ChatMessage,
} from "@juris-connect/shared";
import { db } from "./db/index.js";
import { runWithOrganizationContext } from "./db/tenant-context.js";
import { channelMemberships, channels, messages } from "./db/schema.js";
import { parseSessionCookie, resolveSession } from "./auth/sessions.js";
import { listenAuthRevocations } from "./auth/revocation.js";
import type { AuthContext } from "./auth/context.js";

type Ack = (response: { ok: true } | { ok: false; error: string }) => void;

const roomOf = (channelId: string) => `channel:${channelId}`;
let activeIo: Server | undefined;

export function invalidateSocketSession(sessionId: string) {
  if (!activeIo) return;
  for (const socket of activeIo.sockets.sockets.values()) {
    if (socket.data.auth?.sessionId === sessionId) socket.disconnect(true);
  }
}

export function invalidateUserSockets(userId: string) {
  if (!activeIo) return;
  for (const socket of activeIo.sockets.sockets.values()) {
    if (socket.data.auth?.userId === userId) socket.disconnect(true);
  }
}

async function currentSocketAuth(socket: Socket): Promise<AuthContext | null> {
  const token = parseSessionCookie(socket.handshake.headers.cookie);
  if (!token) return null;
  const auth = await resolveSession(token);
  if (auth) socket.data.auth = auth;
  return auth;
}

export async function revalidateSocketAuthorization(socket: Socket): Promise<boolean> {
  const auth = await currentSocketAuth(socket);
  if (!auth || socket.data.activeOrganizationId !== auth.organizationId) {
    socket.disconnect(true);
    return false;
  }
  return true;
}

export async function setupSocket(httpServer: HttpServer, log: FastifyBaseLogger) {
  const origins = (process.env.CORS_ORIGINS ?? "http://localhost:5173").split(",").map((value) => value.trim()).filter(Boolean);
  const io = new Server(httpServer, {
    cors: { origin: origins, credentials: true },
  });
  activeIo = io;
  const stopListening = await listenAuthRevocations((event) => {
    for (const socket of io.sockets.sockets.values()) {
      if ((event.type === "session" && socket.data.auth?.sessionId === event.id) || (event.type === "user" && socket.data.auth?.userId === event.id)) socket.disconnect(true);
    }
  }, log);
  httpServer.once("close", () => {
    void stopListening().catch((error: unknown) => log.error(error, "Could not stop auth revocation listener"));
  });

  io.use(async (socket, next) => {
    try {
      const origin = socket.handshake.headers.origin;
      if (!origin || !origins.includes(origin)) return next(new Error("Origem Socket.IO não permitida"));
      const auth = await currentSocketAuth(socket);
      if (!auth) return next(new Error("Sessão inválida ou expirada"));
      socket.data.activeOrganizationId = auth.organizationId;
      next();
    } catch (err) {
      log.error(err);
      next(new Error("Erro interno"));
    }
  });

  io.on("connection", (socket) => {
    const sessionCheck = setInterval(() => {
      void revalidateSocketAuthorization(socket).catch((err) => {
        log.error(err);
        socket.disconnect(true);
      });
    }, 60_000);
    sessionCheck.unref();
    socket.once("disconnect", () => clearInterval(sessionCheck));

    socket.on(
      SOCKET_EVENTS.joinChannel,
      async (payload: unknown, ack?: Ack) => {
        const parsed = idParamSchema.safeParse({ id: payload });
        if (!parsed.success) return ack?.({ ok: false, error: "Canal inválido" });

        try {
          if (!await revalidateSocketAuthorization(socket)) return ack?.({ ok: false, error: "Sessão ou organização ativa alterada; reconecte-se" });
          const auth = socket.data.auth as AuthContext;
          const result = await runWithOrganizationContext(auth.organizationId, async () => {
            const [channel] = await db.select({ id: channels.id, isPrivate: channels.isPrivate }).from(channels)
              .where(and(eq(channels.id, parsed.data.id), eq(channels.organizationId, auth.organizationId)));
            if (!channel) return { ok: false as const, error: "Canal não encontrado" };
            if (channel.isPrivate) {
              const [membership] = await db.select({ id: channelMemberships.id }).from(channelMemberships).where(and(eq(channelMemberships.organizationId, auth.organizationId), eq(channelMemberships.channelId, channel.id), eq(channelMemberships.userId, auth.userId))).limit(1);
              if (!membership) return { ok: false as const, error: "Você não participa deste canal" };
            }
            await socket.join(roomOf(channel.id));
            return { ok: true as const };
          }, auth.userId);
          ack?.(result);
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
        let auth: AuthContext | null;
        try {
          if (await revalidateSocketAuthorization(socket)) auth = socket.data.auth as AuthContext;
          else auth = null;
        }
        catch (err) { log.error(err); auth = null; }
        if (!auth) { socket.disconnect(true); return ack?.({ ok: false, error: "Sessão inválida ou expirada" }); }
        if (!socket.rooms.has(roomOf(channelId))) {
          return ack?.({
            ok: false,
            error: "Entre no canal antes de enviar mensagens",
          });
        }

        try {
          const result = await runWithOrganizationContext(auth.organizationId, async () => {
            const [channel] = await db.select({ id: channels.id, isPrivate: channels.isPrivate }).from(channels).where(and(eq(channels.id, channelId), eq(channels.organizationId, auth.organizationId))).limit(1);
            if (!channel) return { ok: false as const, error: "Canal não encontrado" };
            if (channel.isPrivate) {
              const [membership] = await db.select({ id: channelMemberships.id }).from(channelMemberships).where(and(eq(channelMemberships.organizationId, auth.organizationId), eq(channelMemberships.channelId, channelId), eq(channelMemberships.userId, auth.userId))).limit(1);
              if (!membership) return { ok: false as const, error: "Você não participa deste canal" };
            }
            const [saved] = await db.insert(messages).values({ channelId, authorId: auth.userId, organizationId: auth.organizationId, content }).returning();
            const message: ChatMessage = { id: saved!.id, channelId: saved!.channelId, authorId: saved!.authorId, authorName: auth.name, content: saved!.content, createdAt: saved!.createdAt.toISOString() };
            io.to(roomOf(channelId)).emit(SOCKET_EVENTS.newMessage, message);
            return { ok: true as const };
          }, auth.userId);
          ack?.(result);
        } catch (err) {
          log.error(err);
          ack?.({ ok: false, error: "Erro ao salvar a mensagem" });
        }
      },
    );
  });

  return io;
}
