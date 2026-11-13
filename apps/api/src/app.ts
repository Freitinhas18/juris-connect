import Fastify from "fastify";
import multipart from "@fastify/multipart";
import { isIP } from "node:net";
import { APP_NAME } from "@juris-connect/shared";
import { sql } from "drizzle-orm";
import { db } from "./db/index.js";
import { channelRoutes } from "./routes/channels.js";
import { clientRoutes } from "./routes/clients.js";
import { enterpriseRoutes } from "./routes/enterprises.js";
import { processRoutes } from "./routes/processes.js";
import { taskRoutes } from "./routes/tasks.js";
import { obligationRoutes } from "./routes/obligations.js";
import { documentRoutes } from "./routes/documents.js";
import { documentEncryptionKey } from "./documents/storage.js";
import { setupSocket } from "./socket.js";
import { authRoutes, loadRequestAuth, publicAuthRoutes, type AuthEmailSender } from "./auth/routes.js";
import { hasPermission, type OrganizationPermission } from "./auth/context.js";
import { clearSessionCookie } from "./auth/sessions.js";
import { clearOrganizationContext, runWithOrganizationContext } from "./db/tenant-context.js";

export function parseTrustedProxies(value = process.env.TRUST_PROXY): string[] {
  if (!value?.trim()) return [];
  return value.split(",").map((part) => part.trim()).filter(Boolean).map((entry) => {
    const [address, prefix, ...rest] = entry.split("/");
    const version = isIP(address ?? "");
    const bits = version === 4 ? 32 : version === 6 ? 128 : 0;
    const numericPrefix = prefix === undefined ? bits : Number(prefix);
    if (rest.length || version === 0 || !Number.isInteger(numericPrefix) || numericPrefix < 1 || numericPrefix > bits) {
      throw new Error(`TRUST_PROXY contém um endereço/CIDR inválido ou amplo demais: ${entry}`);
    }
    return entry;
  });
}

export async function buildApp({ socket = true, logger = false, emailSender }: { socket?: boolean; logger?: boolean; emailSender?: AuthEmailSender } = {}) {
  const trustedProxies = parseTrustedProxies();
  const app = Fastify({ logger, trustProxy: trustedProxies.length ? trustedProxies : false });
  app.decorateRequest("auth", null);
  app.addHook("onRequest", async () => { clearOrganizationContext(); });
  const allowedOrigins = (process.env.CORS_ORIGINS ?? "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (process.env.NODE_ENV === "production" && !process.env.CORS_ORIGINS?.trim()) {
    throw new Error("CORS_ORIGINS deve listar as origens permitidas em produção.");
  }
  if (process.env.NODE_ENV === "production" && (!process.env.AUTH_RATE_LIMIT_SECRET || process.env.AUTH_RATE_LIMIT_SECRET.length < 32)) {
    throw new Error("AUTH_RATE_LIMIT_SECRET deve ter pelo menos 32 caracteres em produção.");
  }
  if (process.env.NODE_ENV === "production") {
    const rlsTables = ["clients", "enterprises", "processes", "tasks", "obligations", "obligation_occurrences", "obligation_evidence", "documents", "document_clients", "document_enterprises", "document_processes", "document_tasks", "document_occurrences", "channels", "channel_memberships", "messages", "organization_audit_events", "organization_memberships", "sessions"];
    const role = await db.execute(sql`SELECT r.rolsuper OR r.rolbypassrls AS bypasses_rls,
      EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = ANY(string_to_array(${rlsTables.join(",")}, ',')) AND pg_has_role(current_user, c.relowner, 'USAGE')) AS owns_protected_tables,
      (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = ANY(string_to_array(${rlsTables.join(",")}, ',')) AND c.relrowsecurity) AS enabled_table_count,
      (SELECT count(*)::int FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = ANY(string_to_array(${rlsTables.join(",")}, ',')) AND p.polname LIKE '%tenant%') AS tenant_policy_count,
      has_function_privilege(current_user, 'public.resolve_juris_session(text)', 'EXECUTE') AS can_resolve_session
      FROM pg_roles r WHERE r.rolname = current_user`);
    const runtimeRole = role.rows[0] as { bypasses_rls: boolean; owns_protected_tables: boolean; enabled_table_count: number; tenant_policy_count: number; can_resolve_session: boolean } | undefined;
    if (!runtimeRole || runtimeRole.bypasses_rls || runtimeRole.owns_protected_tables || runtimeRole.enabled_table_count !== rlsTables.length || runtimeRole.tenant_policy_count < rlsTables.length || !runtimeRole.can_resolve_session) {
      throw new Error("A API requer uma role PostgreSQL sem BYPASSRLS e sem propriedade das tabelas tenant-aware, com RLS e políticas aplicadas.");
    }
  }
  documentEncryptionKey();

  app.addHook("onRequest", async (request, reply) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-Frame-Options", "DENY");
    reply.header("Referrer-Policy", "no-referrer");
    reply.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    if (process.env.NODE_ENV === "production") {
      reply.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }

    const origin = request.headers.origin;
    if (origin) {
      reply.header("Vary", "Origin");
      if (!allowedOrigins.includes(origin)) return reply.code(403).send({ error: "Origem não permitida" });
      reply.header("Access-Control-Allow-Origin", origin);
      reply.header("Access-Control-Allow-Credentials", "true");
    }

    if (request.method === "OPTIONS") {
      if (!origin || !allowedOrigins.includes(origin)) return reply.code(403).send({ error: "Origem não permitida" });
      reply.header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
      reply.header("Access-Control-Allow-Headers", request.headers["access-control-request-headers"] ?? "Content-Type, Authorization, X-CSRF-Token");
      return reply.code(204).send();
    }
  });

  app.get("/health", async () => ({ status: "ok", app: APP_NAME }));
  app.get("/health/db", async () => { await db.execute(sql`select 1`); return { db: "ok" }; });
  await app.register(authRoutes, { emailSender });
  app.addHook("preHandler", (request, reply, done) => {
    const route = request.routeOptions.url ?? "";
    if (route === "/health" || route === "/health/db" || publicAuthRoutes.has(route)) return done();
    void loadRequestAuth(request).then((auth) => {
      if (!auth) {
        const secure = process.env.NODE_ENV === "production";
        reply.header("Set-Cookie", clearSessionCookie(secure));
        reply.code(401).send({ error: "Autenticação necessária" });
        return;
      }
      if (!["GET", "HEAD", "OPTIONS"].includes(request.method) && !request.headers.origin) {
        reply.code(403).send({ error: "Origem da solicitação ausente" });
        return;
      }
      request.auth = auth;
      const permission: OrganizationPermission = request.method === "GET" || request.method === "HEAD" ? "read" : request.method === "DELETE" ? "delete" : "write";
      if (!hasPermission(auth.role, permission)) {
        reply.code(403).send({ error: "Seu papel não permite esta operação" });
        return;
      }
      runWithOrganizationContext(auth.organizationId, () => done(), auth.userId);
    }).catch(done);
  });
  await app.register(multipart, { limits: { fileSize: 20 * 1024 * 1024, fieldSize: 2 * 1024 * 1024, files: 1, fields: 1, parts: 2 } });
  await app.register(channelRoutes);
  await app.register(clientRoutes);
  await app.register(enterpriseRoutes);
  await app.register(processRoutes);
  await app.register(taskRoutes);
  await app.register(obligationRoutes);
  await app.register(documentRoutes);
  if (socket) await setupSocket(app.server, app.log);
  return app;
}
