import { createHmac } from "node:crypto";
import { and, desc, eq, gt, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { authTokenSchema, emailAddressSchema, historyQuerySchema, idParamSchema, loginSchema, organizationMemberCreateSchema, organizationMemberRoleSchema, organizationSelectionSchema, passwordResetSchema, registerAccountSchema } from "@juris-connect/shared";
import { db } from "../db/index.js";
import { authLoginLimits, authTokens, organizationAuditEvents, organizationMemberships, organizations, sessions, users } from "../db/schema.js";
import { hasPermission, type AuthContext } from "./context.js";
import { createOpaqueToken, hashOpaqueToken, hashPassword, verifyPassword } from "./crypto.js";
import { clearSessionCookie, readSessionCookie, resolveSession, SESSION_COOKIE, SESSION_TTL_MS, sessionCookie } from "./sessions.js";
import { invalidateSocketSession, invalidateUserSockets } from "../socket.js";
import { publishAuthRevocation } from "./revocation.js";
import { enterOrganizationContext, enterUserContext, runWithOrganizationContext } from "../db/tenant-context.js";

export interface AuthEmail {
  to: string;
  subject: string;
  text: string;
}

export type AuthEmailSender = (email: AuthEmail) => Promise<void>;

const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000;
const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_LOCK_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 5;
const PUBLIC_AUTH_MAX_ATTEMPTS = 10;
const AUTH_LIMIT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const AUTH_LIMIT_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
const dummyPasswordHash = hashPassword("juris-connect-invalid-account-dummy-secret");
let nextAuthLimitCleanupAt = 0;

function isUniqueViolation(error: unknown): boolean {
  const value = error as { code?: string; cause?: { code?: string } };
  return value?.code === "23505" || value?.cause?.code === "23505";
}

function secureCookie(): boolean {
  return process.env.NODE_ENV === "production";
}

function publicAppUrl(): string {
  const configured = process.env.WEB_APP_URL ?? "http://localhost:5173";
  const url = new URL(configured);
  const allowedOrigins = (process.env.CORS_ORIGINS ?? "http://localhost:5173").split(",").map((origin) => origin.trim());
  if (url.username || url.password || url.search || url.hash || !allowedOrigins.includes(url.origin) || (process.env.NODE_ENV === "production" && url.protocol !== "https:")) {
    throw new Error("WEB_APP_URL deve apontar para uma origem permitida por CORS_ORIGINS e usar HTTPS em produção.");
  }
  return url.toString().replace(/\/$/, "");
}

function loginLimitKey(email: string, ip: string): string {
  const secret = process.env.AUTH_RATE_LIMIT_SECRET;
  if (!secret || secret.length < 32) throw new Error("AUTH_RATE_LIMIT_SECRET deve ter pelo menos 32 caracteres.");
  return createHmac("sha256", secret).update(`${email}\u0000${ip}`).digest("hex");
}

async function isLoginLocked(key: string): Promise<boolean> {
  const [row] = await db.select({ lockedUntil: authLoginLimits.lockedUntil }).from(authLoginLimits).where(eq(authLoginLimits.key, key)).limit(1);
  return Boolean(row?.lockedUntil && row.lockedUntil > new Date());
}

async function recordLoginFailure(key: string, maximumAttempts = LOGIN_MAX_ATTEMPTS): Promise<number> {
  const now = new Date();
  const expiredWindow = lt(authLoginLimits.windowStartedAt, new Date(now.getTime() - LOGIN_WINDOW_MS));
  const reset = sql`CASE WHEN ${expiredWindow} THEN ${now} ELSE ${authLoginLimits.windowStartedAt} END`;
  const [record] = await db.insert(authLoginLimits).values({ key, windowStartedAt: now, attempts: 1, updatedAt: now }).onConflictDoUpdate({
    target: authLoginLimits.key,
    set: {
      windowStartedAt: reset,
      attempts: sql`CASE WHEN ${expiredWindow} THEN 1 ELSE ${authLoginLimits.attempts} + 1 END`,
      lockedUntil: sql`CASE WHEN ${expiredWindow} THEN NULL WHEN ${authLoginLimits.attempts} + 1 >= ${maximumAttempts} THEN ${new Date(now.getTime() + LOGIN_LOCK_MS)} ELSE ${authLoginLimits.lockedUntil} END`,
      updatedAt: now,
    },
  }).returning({ attempts: authLoginLimits.attempts });
  return record?.attempts ?? 0;
}

async function cleanupExpiredAuthLimits(): Promise<void> {
  const now = Date.now();
  if (now < nextAuthLimitCleanupAt) return;
  nextAuthLimitCleanupAt = now + AUTH_LIMIT_CLEANUP_INTERVAL_MS;
  try {
    await db.delete(authLoginLimits).where(lt(authLoginLimits.updatedAt, new Date(now - AUTH_LIMIT_RETENTION_MS)));
  } catch (error) {
    nextAuthLimitCleanupAt = 0;
    throw error;
  }
}

async function allowPublicAuthRequest(request: FastifyRequest, reply: FastifyReply, scope: string): Promise<boolean> {
  let key: string;
  try { key = loginLimitKey(`public:${scope}`, request.ip); }
  catch { await reply.code(503).send({ error: "Proteção de solicitações não configurada" }); return false; }
  await cleanupExpiredAuthLimits();
  const attempts = await recordLoginFailure(key, PUBLIC_AUTH_MAX_ATTEMPTS);
  if (attempts > PUBLIC_AUTH_MAX_ATTEMPTS) { await reply.code(429).send({ error: "Muitas solicitações. Aguarde antes de tentar novamente." }); return false; }
  return true;
}

async function issueEmailToken(userId: string, purpose: "verify_email" | "reset_password", expiresAt: Date) {
  const token = createOpaqueToken();
  const tokenHash = hashOpaqueToken(token);
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.update(authTokens).set({ consumedAt: now }).where(and(eq(authTokens.userId, userId), eq(authTokens.purpose, purpose), isNull(authTokens.consumedAt)));
    await tx.insert(authTokens).values({ userId, purpose, tokenHash, expiresAt });
  });
  return token;
}

async function sendActionEmail(sender: AuthEmailSender, to: string, action: "verify-email" | "reset-password", token: string) {
  const url = `${publicAppUrl()}/${action}#token=${encodeURIComponent(token)}`;
  await sender({
    to,
    subject: action === "verify-email" ? "Confirme seu e-mail — Juris Connect" : "Redefina sua senha — Juris Connect",
    text: `Use este link de uso único dentro do prazo informado para continuar:\n\n${url}\n\nSe você não solicitou esta ação, ignore esta mensagem.`,
  });
}

async function requireSession(request: FastifyRequest, reply: FastifyReply): Promise<AuthContext | null> {
  const token = readSessionCookie(request);
  const auth = token ? await resolveSession(token) : null;
  if (!auth) {
    reply.header("Set-Cookie", clearSessionCookie(secureCookie()));
    await reply.code(401).send({ error: "Sessão inválida ou expirada" });
    return null;
  }
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method) && !request.headers.origin) {
    await reply.code(403).send({ error: "Origem da solicitação ausente" });
    return null;
  }
  request.auth = auth;
  enterOrganizationContext(auth.organizationId, auth.userId);
  return auth;
}

export async function authRoutes(app: FastifyInstance, options: { emailSender?: AuthEmailSender } = {}) {
  app.post("/auth/register", async (request, reply) => {
    if (!await allowPublicAuthRequest(request, reply, "register")) return;
    const parsed = registerAccountSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Dados inválidos", details: parsed.error.issues });
    if (!options.emailSender) return reply.code(503).send({ error: "Envio de e-mail não configurado; cadastro indisponível" });
    try { publicAppUrl(); } catch { return reply.code(503).send({ error: "URL da aplicação não configurada com uma origem permitida" }); }

    const input = parsed.data;
    const [existing] = await db.select({ id: users.id, emailVerifiedAt: users.emailVerifiedAt }).from(users).where(eq(users.email, input.email)).limit(1);
    if (existing) return reply.code(202).send({ message: "Se o cadastro puder ser iniciado, você receberá instruções por e-mail." });

    let userId = "";
    let token = "";
    const slugSuffix = createOpaqueToken().slice(0, 8);
    const slugBase = input.organizationName.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "escritorio";
    try {
      await db.transaction(async (tx) => {
        const [user] = await tx.insert(users).values({ name: input.name, email: input.email, passwordHash: await hashPassword(input.password) }).returning({ id: users.id });
        userId = user!.id;
        const [organization] = await tx.insert(organizations).values({ name: input.organizationName, slug: `${slugBase}-${slugSuffix}` }).returning({ id: organizations.id });
        await runWithOrganizationContext(organization!.id, async () => await tx.insert(organizationMemberships).values({ organizationId: organization!.id, userId, role: "owner" }), userId);
        token = createOpaqueToken();
        await tx.insert(authTokens).values({ userId, purpose: "verify_email", tokenHash: hashOpaqueToken(token), expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS) });
      });
    } catch (error) {
      if (isUniqueViolation(error)) return reply.code(202).send({ message: "Se o cadastro puder ser iniciado, você receberá instruções por e-mail." });
      throw error;
    }
    try {
      await sendActionEmail(options.emailSender, input.email, "verify-email", token);
    } catch {
      return reply.code(503).send({ error: "Não foi possível enviar a confirmação. Tente novamente mais tarde." });
    }
    return reply.code(202).send({ message: "Se o cadastro puder ser iniciado, você receberá instruções por e-mail." });
  });

  app.post("/auth/email-verification/resend", async (request, reply) => {
    if (!await allowPublicAuthRequest(request, reply, "email-verification-resend")) return;
    const parsed = emailAddressSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "E-mail inválido" });
    if (!options.emailSender) return reply.code(503).send({ error: "Envio de e-mail não configurado" });
    try { publicAppUrl(); } catch { return reply.code(503).send({ error: "URL da aplicação não configurada com uma origem permitida" }); }
    const [user] = await db.select({ id: users.id, email: users.email, emailVerifiedAt: users.emailVerifiedAt }).from(users).where(eq(users.email, parsed.data.email)).limit(1);
    if (user && !user.emailVerifiedAt) {
      const token = await issueEmailToken(user.id, "verify_email", new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS));
      try { await sendActionEmail(options.emailSender, user.email, "verify-email", token); } catch { return reply.code(503).send({ error: "Não foi possível enviar a confirmação" }); }
    }
    return reply.code(202).send({ message: "Se houver uma confirmação pendente, enviaremos instruções por e-mail." });
  });

  app.post("/auth/email-verification/confirm", async (request, reply) => {
    if (!await allowPublicAuthRequest(request, reply, "email-verification-confirm")) return;
    const parsed = authTokenSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Token inválido" });
    const tokenHash = hashOpaqueToken(parsed.data.token);
    const now = new Date();
    const [token] = await db.select({ id: authTokens.id, userId: authTokens.userId }).from(authTokens).where(and(eq(authTokens.tokenHash, tokenHash), eq(authTokens.purpose, "verify_email"), isNull(authTokens.consumedAt), gt(authTokens.expiresAt, now))).limit(1);
    if (!token) return reply.code(400).send({ error: "Token inválido ou expirado" });
    const consumed = await db.transaction(async (tx) => {
      const [updatedToken] = await tx.update(authTokens).set({ consumedAt: now }).where(and(eq(authTokens.id, token.id), isNull(authTokens.consumedAt), gt(authTokens.expiresAt, now))).returning({ id: authTokens.id });
      if (!updatedToken) return false;
      await tx.update(users).set({ emailVerifiedAt: now }).where(eq(users.id, token.userId));
      return true;
    });
    if (!consumed) return reply.code(400).send({ error: "Token inválido ou expirado" });
    return reply.code(200).send({ message: "E-mail confirmado. Você já pode entrar." });
  });

  app.post("/auth/login", async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Dados de acesso inválidos" });
    if (!await allowPublicAuthRequest(request, reply, "login-ip")) return;
    let key: string;
    try { key = loginLimitKey(parsed.data.email, request.ip); }
    catch { return reply.code(503).send({ error: "Proteção de login não configurada" }); }
    if (await isLoginLocked(key)) return reply.code(429).send({ error: "Muitas tentativas. Aguarde antes de tentar novamente." });

    const [user] = await db.select({ id: users.id, name: users.name, email: users.email, passwordHash: users.passwordHash, emailVerifiedAt: users.emailVerifiedAt }).from(users).where(eq(users.email, parsed.data.email)).limit(1);
    const storedHash = user?.passwordHash ?? await dummyPasswordHash;
    const passwordMatches = await verifyPassword(parsed.data.password, storedHash);
    if (!user || !passwordMatches || !user.emailVerifiedAt || !user.passwordHash) {
      await recordLoginFailure(key);
      return reply.code(401).send({ error: "E-mail ou senha inválidos" });
    }
    enterUserContext(user.id);
    const [membership] = await db.select({ organizationId: organizationMemberships.organizationId }).from(organizationMemberships).where(eq(organizationMemberships.userId, user.id)).orderBy(organizationMemberships.createdAt).limit(1);
    if (!membership) {
      await recordLoginFailure(key);
      return reply.code(401).send({ error: "E-mail ou senha inválidos" });
    }
    enterOrganizationContext(membership.organizationId, user.id);
    const token = createOpaqueToken();
    await db.insert(sessions).values({ userId: user.id, organizationId: membership.organizationId, tokenHash: hashOpaqueToken(token), expiresAt: new Date(Date.now() + SESSION_TTL_MS) });
    await db.delete(authLoginLimits).where(eq(authLoginLimits.key, key));
    reply.header("Set-Cookie", sessionCookie(token, secureCookie()));
    return reply.code(200).send({ user: { id: user.id, name: user.name, email: user.email }, organizationId: membership.organizationId });
  });

  app.post("/auth/password-recovery/request", async (request, reply) => {
    if (!await allowPublicAuthRequest(request, reply, "password-recovery-request")) return;
    const parsed = emailAddressSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "E-mail inválido" });
    if (!options.emailSender) return reply.code(503).send({ error: "Envio de e-mail não configurado" });
    try { publicAppUrl(); } catch { return reply.code(503).send({ error: "URL da aplicação não configurada com uma origem permitida" }); }
    const [user] = await db.select({ id: users.id, email: users.email }).from(users).where(and(eq(users.email, parsed.data.email), sql`${users.emailVerifiedAt} IS NOT NULL`)).limit(1);
    if (user) {
      const token = await issueEmailToken(user.id, "reset_password", new Date(Date.now() + PASSWORD_RESET_TTL_MS));
      try { await sendActionEmail(options.emailSender, user.email, "reset-password", token); } catch { return reply.code(503).send({ error: "Não foi possível processar a solicitação" }); }
    }
    return reply.code(202).send({ message: "Se houver uma conta confirmada para esse e-mail, enviaremos instruções." });
  });

  app.post("/auth/password-recovery/confirm", async (request, reply) => {
    if (!await allowPublicAuthRequest(request, reply, "password-recovery-confirm")) return;
    const parsed = passwordResetSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Token ou nova senha inválidos", details: parsed.error.issues });
    const tokenHash = hashOpaqueToken(parsed.data.token);
    const [token] = await db.select({ id: authTokens.id, userId: authTokens.userId }).from(authTokens).where(and(eq(authTokens.tokenHash, tokenHash), eq(authTokens.purpose, "reset_password"), isNull(authTokens.consumedAt), gt(authTokens.expiresAt, new Date()))).limit(1);
    if (!token) return reply.code(400).send({ error: "Token inválido ou expirado" });
    enterUserContext(token.userId);
    const passwordHash = await hashPassword(parsed.data.password);
    const now = new Date();
    const changed = await db.transaction(async (tx) => {
      const [updatedToken] = await tx.update(authTokens).set({ consumedAt: now }).where(and(eq(authTokens.id, token.id), isNull(authTokens.consumedAt), gt(authTokens.expiresAt, now))).returning({ id: authTokens.id });
      if (!updatedToken) return false;
      await tx.update(users).set({ passwordHash }).where(eq(users.id, token.userId));
      await tx.update(sessions).set({ revokedAt: now }).where(and(eq(sessions.userId, token.userId), isNull(sessions.revokedAt)));
      return true;
    });
    if (!changed) return reply.code(400).send({ error: "Token inválido ou expirado" });
    invalidateUserSockets(token.userId);
    await publishAuthRevocation({ type: "user", id: token.userId }).catch((error: unknown) => app.log.error(error, "Could not publish password-reset socket revocation"));
    return reply.code(200).send({ message: "Senha redefinida. Entre novamente com a nova senha." });
  });

  app.get("/auth/me", async (request, reply) => {
    const auth = await requireSession(request, reply);
    if (!auth) return;
    const [organization] = await db.select({ id: organizations.id, name: organizations.name }).from(organizations).where(eq(organizations.id, auth.organizationId)).limit(1);
    return { user: { id: auth.userId, name: auth.name, email: auth.email }, organization, role: auth.role };
  });

  app.get("/auth/organizations", async (request, reply) => {
    const auth = await requireSession(request, reply);
    if (!auth) return;
    return db.select({ id: organizations.id, name: organizations.name, role: organizationMemberships.role })
      .from(organizationMemberships).innerJoin(organizations, eq(organizationMemberships.organizationId, organizations.id))
      .where(eq(organizationMemberships.userId, auth.userId)).orderBy(organizations.name);
  });

  app.get("/auth/members", async (request, reply) => {
    const auth = await requireSession(request, reply);
    if (!auth) return;
    if (!hasPermission(auth.role, "manage_members")) return reply.code(403).send({ error: "Seu papel não permite gerenciar membros" });
    return db.select({
      id: organizationMemberships.id,
      userId: users.id,
      name: users.name,
      email: users.email,
      role: organizationMemberships.role,
      createdAt: organizationMemberships.createdAt,
    }).from(organizationMemberships)
      .innerJoin(users, eq(organizationMemberships.userId, users.id))
      .where(eq(organizationMemberships.organizationId, auth.organizationId))
      .orderBy(organizationMemberships.createdAt);
  });

  app.get("/auth/audit-events", async (request, reply) => {
    const auth = await requireSession(request, reply);
    if (!auth) return;
    if (!hasPermission(auth.role, "manage_members")) return reply.code(403).send({ error: "Seu papel não permite consultar eventos de auditoria" });
    const parsed = historyQuerySchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const actor = alias(users, "audit_actor");
    const target = alias(users, "audit_target");
    return db.select({ id: organizationAuditEvents.id, actorUserId: organizationAuditEvents.actorUserId, actorName: actor.name, targetUserId: organizationAuditEvents.targetUserId, targetName: target.name, action: organizationAuditEvents.action, metadata: organizationAuditEvents.metadata, createdAt: organizationAuditEvents.createdAt })
      .from(organizationAuditEvents).innerJoin(actor, eq(organizationAuditEvents.actorUserId, actor.id)).leftJoin(target, eq(organizationAuditEvents.targetUserId, target.id))
      .where(and(eq(organizationAuditEvents.organizationId, auth.organizationId), parsed.data.before ? lt(organizationAuditEvents.createdAt, parsed.data.before) : undefined))
      .orderBy(desc(organizationAuditEvents.createdAt))
      .limit(parsed.data.limit);
  });

  app.post("/auth/members", async (request, reply) => {
    const auth = await requireSession(request, reply);
    if (!auth) return;
    if (!hasPermission(auth.role, "manage_members")) return reply.code(403).send({ error: "Seu papel não permite gerenciar membros" });
    const parsed = organizationMemberCreateSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Dados inválidos", details: parsed.error.issues });
    const [user] = await db.select({ id: users.id, name: users.name, email: users.email }).from(users)
      .where(and(eq(users.email, parsed.data.email), isNotNull(users.emailVerifiedAt))).limit(1);
    if (!user) return reply.code(404).send({ error: "Conta verificada não encontrada" });
    try {
      const membership = await db.transaction(async (tx) => {
        const [created] = await tx.insert(organizationMemberships).values({ organizationId: auth.organizationId, userId: user.id, role: parsed.data.role }).returning();
        await tx.insert(organizationAuditEvents).values({ organizationId: auth.organizationId, actorUserId: auth.userId, targetUserId: user.id, action: "member.added", metadata: { role: parsed.data.role } });
        return created!;
      });
      request.log.info({ event: "organization_member_added", actorUserId: auth.userId, targetUserId: user.id, organizationId: auth.organizationId, role: parsed.data.role }, "Organization member added");
      return reply.code(201).send({ ...membership, userId: user.id, name: user.name, email: user.email });
    } catch (error) {
      if (isUniqueViolation(error)) return reply.code(409).send({ error: "Esta conta já participa da organização" });
      throw error;
    }
  });

  app.patch("/auth/members/:id", async (request, reply) => {
    const auth = await requireSession(request, reply);
    if (!auth) return;
    if (!hasPermission(auth.role, "manage_members")) return reply.code(403).send({ error: "Seu papel não permite gerenciar membros" });
    const params = idParamSchema.safeParse(request.params);
    const parsed = organizationMemberRoleSchema.safeParse(request.body);
    if (!params.success || !parsed.success) return reply.code(400).send({ error: "Membro ou papel inválido" });
    const result = await db.transaction(async (tx) => {
      const organizationMembers = await tx.select().from(organizationMemberships)
        .where(eq(organizationMemberships.organizationId, auth.organizationId)).for("update");
      const target = organizationMembers.find((item) => item.id === params.data.id);
      if (!target) return { status: 404 as const };
      if ((target.role === "owner" || parsed.data.role === "owner") && auth.role !== "owner") return { status: 403 as const };
      if (target.role === "owner" && parsed.data.role !== "owner" && organizationMembers.filter((item) => item.role === "owner").length <= 1) return { status: 409 as const };
      const [membership] = await tx.update(organizationMemberships).set({ role: parsed.data.role })
        .where(and(eq(organizationMemberships.id, target.id), eq(organizationMemberships.organizationId, auth.organizationId))).returning();
      await tx.insert(organizationAuditEvents).values({ organizationId: auth.organizationId, actorUserId: auth.userId, targetUserId: target.userId, action: "member.role_changed", metadata: { previousRole: target.role, newRole: parsed.data.role } });
      return { status: 200 as const, membership, targetUserId: target.userId, previousRole: target.role };
    });
    if (result.status === 404) return reply.code(404).send({ error: "Membro não encontrado" });
    if (result.status === 403) return reply.code(403).send({ error: "Somente um owner pode atribuir ou alterar o papel de owner" });
    if (result.status === 409) return reply.code(409).send({ error: "A organização precisa manter ao menos um owner" });
    request.log.info({ event: "organization_member_role_changed", actorUserId: auth.userId, targetUserId: result.targetUserId, organizationId: auth.organizationId, previousRole: result.previousRole, newRole: parsed.data.role }, "Organization member role changed");
    return result.membership;
  });

  app.delete("/auth/members/:id", async (request, reply) => {
    const auth = await requireSession(request, reply);
    if (!auth) return;
    if (!hasPermission(auth.role, "manage_members")) return reply.code(403).send({ error: "Seu papel não permite gerenciar membros" });
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Membro inválido" });
    const result = await db.transaction(async (tx) => {
      const organizationMembers = await tx.select().from(organizationMemberships)
        .where(eq(organizationMemberships.organizationId, auth.organizationId)).for("update");
      const target = organizationMembers.find((item) => item.id === params.data.id);
      if (!target) return { status: 404 as const, sessionIds: [] as string[] };
      if (target.userId === auth.userId) return { status: 409 as const, sessionIds: [] as string[] };
      if (target.role === "owner" && auth.role !== "owner") return { status: 403 as const, sessionIds: [] as string[] };
      if (target.role === "owner" && organizationMembers.filter((item) => item.role === "owner").length <= 1) return { status: 409 as const, sessionIds: [] as string[] };
      const revokedSessions = await tx.select({ id: sessions.id }).from(sessions)
        .where(and(eq(sessions.organizationId, auth.organizationId), eq(sessions.userId, target.userId), isNull(sessions.revokedAt)));
      await tx.insert(organizationAuditEvents).values({ organizationId: auth.organizationId, actorUserId: auth.userId, targetUserId: target.userId, action: "member.removed", metadata: { previousRole: target.role, revokedSessionCount: revokedSessions.length } });
      await tx.delete(organizationMemberships).where(and(eq(organizationMemberships.id, target.id), eq(organizationMemberships.organizationId, auth.organizationId)));
      return { status: 204 as const, targetUserId: target.userId, targetRole: target.role, sessionIds: revokedSessions.map((session) => session.id) };
    });
    if (result.status === 404) return reply.code(404).send({ error: "Membro não encontrado" });
    if (result.status === 403) return reply.code(403).send({ error: "Somente um owner pode remover outro owner" });
    if (result.status === 409) return reply.code(409).send({ error: "Não é possível remover a própria associação nem deixar a organização sem owner" });
    request.log.info({ event: "organization_member_removed", actorUserId: auth.userId, targetUserId: result.targetUserId, organizationId: auth.organizationId, previousRole: result.targetRole, revokedSessionCount: result.sessionIds.length }, "Organization member removed");
    for (const sessionId of result.sessionIds) {
      invalidateSocketSession(sessionId);
      await publishAuthRevocation({ type: "session", id: sessionId }).catch((error: unknown) => app.log.error(error, "Could not publish member session revocation"));
    }
    return reply.code(204).send();
  });

  app.get("/auth/sessions", async (request, reply) => {
    const auth = await requireSession(request, reply);
    if (!auth) return;
    const rows = await db.select({ id: sessions.id, createdAt: sessions.createdAt, lastSeenAt: sessions.lastSeenAt, expiresAt: sessions.expiresAt })
      .from(sessions)
      .where(and(eq(sessions.userId, auth.userId), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())))
      .orderBy(sessions.createdAt);
    return rows.map((session) => ({
      ...session,
      createdAt: session.createdAt.toISOString(),
      lastSeenAt: session.lastSeenAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
      isCurrent: session.id === auth.sessionId,
    }));
  });

  app.post("/auth/sessions/:id/revoke", async (request, reply) => {
    const auth = await requireSession(request, reply);
    if (!auth) return;
    const parsed = idParamSchema.safeParse(request.params);
    if (!parsed.success) return reply.code(400).send({ error: "Sessão inválida" });
    if (parsed.data.id === auth.sessionId) return reply.code(400).send({ error: "Use sair da conta para encerrar a sessão atual" });
    const [revoked] = await db.update(sessions).set({ revokedAt: new Date() })
      .where(and(eq(sessions.id, parsed.data.id), eq(sessions.userId, auth.userId), isNull(sessions.revokedAt)))
      .returning({ id: sessions.id });
    if (!revoked) return reply.code(404).send({ error: "Sessão não encontrada" });
    invalidateSocketSession(revoked.id);
    await publishAuthRevocation({ type: "session", id: revoked.id }).catch((error: unknown) => app.log.error(error, "Could not publish session revocation"));
    return reply.code(204).send();
  });

  app.post("/auth/organizations/active", async (request, reply) => {
    const auth = await requireSession(request, reply);
    if (!auth) return;
    const parsed = organizationSelectionSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Organização inválida" });
    const [membership] = await db.select({ role: organizationMemberships.role }).from(organizationMemberships).where(and(eq(organizationMemberships.organizationId, parsed.data.organizationId), eq(organizationMemberships.userId, auth.userId))).limit(1);
    if (!membership) return reply.code(403).send({ error: "Você não participa desta organização" });
    await db.update(sessions).set({ organizationId: parsed.data.organizationId, lastSeenAt: new Date() }).where(eq(sessions.id, auth.sessionId));
    invalidateSocketSession(auth.sessionId);
    await publishAuthRevocation({ type: "session", id: auth.sessionId }).catch((error: unknown) => app.log.error(error, "Could not publish organization-switch socket revocation"));
    return { organizationId: parsed.data.organizationId, role: membership.role };
  });

  app.post("/auth/logout", async (request, reply) => {
    const auth = await requireSession(request, reply);
    if (!auth) return;
    await db.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.id, auth.sessionId), isNull(sessions.revokedAt)));
    invalidateSocketSession(auth.sessionId);
    await publishAuthRevocation({ type: "session", id: auth.sessionId }).catch((error: unknown) => app.log.error(error, "Could not publish logout socket revocation"));
    reply.header("Set-Cookie", clearSessionCookie(secureCookie()));
    return reply.code(204).send();
  });
}

export async function loadRequestAuth(request: FastifyRequest): Promise<AuthContext | null> {
  const token = readSessionCookie(request);
  if (!token) return null;
  const auth = await resolveSession(token);
  if (auth) enterOrganizationContext(auth.organizationId, auth.userId);
  return auth;
}

export const publicAuthRoutes = new Set([
  "/auth/register",
  "/auth/email-verification/resend",
  "/auth/email-verification/confirm",
  "/auth/login",
  "/auth/password-recovery/request",
  "/auth/password-recovery/confirm",
]);

export const sessionCookieName = SESSION_COOKIE;
