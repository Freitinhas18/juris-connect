import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { createHmac, randomUUID } from "node:crypto";
import { test } from "node:test";
import { createOpaqueToken, hashOpaqueToken, hashPassword } from "../src/auth/crypto.js";
import { sessionCookie } from "../src/auth/sessions.js";
import type { AuthEmail } from "../src/auth/routes.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL ausente. Testes interrompidos; não há fallback automático.");
const parsedDatabaseUrl = new URL(databaseUrl);
if (parsedDatabaseUrl.pathname.replace(/^\//, "") !== "juris_connect_test" || !["localhost", "127.0.0.1"].includes(parsedDatabaseUrl.hostname)) {
  throw new Error("Testes interrompidos: DATABASE_URL deve apontar para localhost/juris_connect_test.");
}
const baseStorage = process.env.DOCUMENT_STORAGE_PATH;
if (!baseStorage) throw new Error("DOCUMENT_STORAGE_PATH isolado ausente.");
const productionStorage = resolve(process.cwd(), ".data", "documents");
const runStorage = resolve(baseStorage, `run-${randomUUID()}`);
if (runStorage === productionStorage || runStorage.startsWith(productionStorage + sep)) throw new Error("Testes interrompidos: armazenamento de teste coincide com o diretório de documentos principal.");
process.env.DOCUMENT_STORAGE_PATH = runStorage;

// Database modules are deliberately imported only after the strict safety guard above.
const [{ buildApp, parseTrustedProxies }, { db }, schema, { eq, inArray, sql }, { io: socketClient }, FastifyModule, { setupSocket, revalidateSocketAuthorization }, { mapLegacyLinks }, { demoObligations }, { documentEncryptionKey, readStoredFile }] = await Promise.all([
  import("../src/app.js"), import("../src/db/index.js"), import("../src/db/schema.js"), import("drizzle-orm"), import("socket.io-client"), import("fastify"), import("../src/socket.js"), import("../../web/src/documents/documentLegacy.ts"), import("../../web/src/obligations/obligationDemoData.ts"), import("../src/documents/storage.js"),
]);
const Fastify = FastifyModule.default;
const { and } = await import("drizzle-orm");
const prefix = `test-${randomUUID()}`;
const staleRateLimitKey = createHmac("sha256", process.env.AUTH_RATE_LIMIT_SECRET!).update(`${prefix}-stale-auth-limit`).digest("hex");
const freshRateLimitKey = createHmac("sha256", process.env.AUTH_RATE_LIMIT_SECRET!).update(`${prefix}-fresh-auth-limit`).digest("hex");
const authRateLimitKeys = [
  ...["register", "email-verification-resend", "email-verification-confirm", "login-ip", "password-recovery-request", "password-recovery-confirm"].map((scope) => createHmac("sha256", process.env.AUTH_RATE_LIMIT_SECRET!).update(`public:${scope}\u0000127.0.0.1`).digest("hex")),
  createHmac("sha256", process.env.AUTH_RATE_LIMIT_SECRET!).update(`${prefix}-locked@example.test\u0000127.0.0.1`).digest("hex"),
  staleRateLimitKey,
  freshRateLimitKey,
];
const ids: Record<string, string[]> = { clients: [], enterprises: [], processes: [], tasks: [], obligations: [], documents: [], channels: [], users: [], organizations: [], sessions: [], memberships: [] };
let app: Awaited<ReturnType<typeof buildApp>>;
let clientId = ""; let enterpriseId = ""; let processId = ""; let taskId = ""; let obligationId = ""; let occurrenceId = ""; let userId = "";
let organizationId = ""; let authCookie = "";
let organizationBId = ""; let organizationBClientId = ""; let organizationBEnterpriseId = ""; let organizationBProcessId = ""; let organizationBTaskId = ""; let organizationBObligationId = ""; let organizationBOccurrenceId = ""; let organizationWithoutMembershipId = "";
let crossTenantCookie = "";
const emailOutbox: AuthEmail[] = [];

function body(response: { json(): unknown }) { return response.json() as Record<string, any>; }
function jsonRequest(method: string, url: string, payload?: unknown) { return app.inject({ method, url, headers: { cookie: authCookie, origin: "http://localhost:5173" }, ...(payload === undefined ? {} : { payload }) }); }
function cookieValue(response: { headers: Record<string, unknown> }): string {
  const raw = response.headers["set-cookie"];
  const value = Array.isArray(raw) ? String(raw[0]) : String(raw ?? "");
  const cookie = value.split(";")[0];
  assert.match(cookie, /^juris_connect_session=[A-Za-z0-9_-]{43}$/);
  return cookie;
}
function sessionRequest(method: string, url: string, cookie: string, payload?: unknown) { return app.inject({ method, url, headers: { cookie, origin: "http://localhost:5173" }, ...(payload === undefined ? {} : { payload }) }); }
function clientInput(name = `${prefix} client`) { return { name, kind: "Empresa", document: "", contactName: "Teste Sintético", email: "teste@example.test", phone: "(11) 3000-4000", address: "Rua Sintética, 1", notes: "Fixture automatizada", status: "active" }; }
function enterpriseInput(client: string, name = `${prefix} enterprise`) { return { clientId: client, name, type: "Unidade de teste", activity: "Atividade sintética", document: "", address: "Rua Sintética, 2", municipality: "São Paulo", state: "SP", manager: "Equipe teste", description: "Fixture", status: "active", relatedCases: 0 }; }
function processInput(enterprise: string, name = `${prefix} process`) { return { enterpriseId: enterprise, name, protocol: `${prefix}-PROTO`, processType: "Licenciamento ambiental", entity: "Órgão sintético", description: "Fixture automatizada", manager: "Equipe teste", startDate: "2026-01-01", dueDate: "2026-12-01", priority: "Média", stage: "Preparação", status: "Em andamento" }; }
function taskInput(process: string) { return { title: `${prefix} task`, description: "Fixture automatizada", processId: process, assigneeId: "demo-team-lucas", status: "Aguardando cliente", priority: "Média", startDate: "2026-11-01", dueDate: "2026-11-30", subtasks: [{ id: "fixture-subtask", title: "Etapa sintética", completed: false }] }; }
function obligationInput(process: string) { return { title: `${prefix} obligation`, description: "Fixture automatizada", processId: process, reference: "TEST-1", authority: "Órgão sintético", responsibleId: "demo-team-lucas", periodicity: "Mensal", firstDueDate: "2026-11-15", requirements: "Requisito sintético", expectedEvidence: "Comprovante sintético", status: "active" }; }
function documentInput(links: Record<string, unknown> = {}) { return { name: `${prefix} document`, description: "Fixture automatizada", category: "Outros", responsible: "Equipe teste", status: "Pendente", links: { clientIds: [], enterpriseIds: [], processIds: [], taskIds: [], occurrences: [], ...links } }; }
function multipart(metadata: unknown, filename: string, mime: string, file: Buffer) {
  const boundary = `----juris-test-${randomUUID()}`;
  const payload = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="metadata"\r\n\r\n${JSON.stringify(metadata)}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mime}\r\n\r\n`), file,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { payload, headers: { "content-type": `multipart/form-data; boundary=${boundary}`, cookie: authCookie, origin: "http://localhost:5173" } };
}
function minimalPdf(size = 256) { const buffer = Buffer.alloc(size, 0x20); Buffer.from("%PDF-1.4\nSynthetic test document\n").copy(buffer); return buffer; }

await test("Juris Connect API integration suite (isolated synthetic fixtures)", async (t) => {
  await mkdir(runStorage, { recursive: true });
  await db.delete(schema.authLoginLimits).where(inArray(schema.authLoginLimits.key, authRateLimitKeys));
  app = await buildApp({ socket: false, emailSender: async (email) => { emailOutbox.push(email); } });
  await app.ready();
  try {
    await t.test("Schema de organizações: legado sem atribuição e sessão exige membership", async () => {
      const [legacyClient] = await db.insert(schema.clients).values({ name: `${prefix} legacy unassigned`, kind: "Empresa", contactName: "Fixture", email: `${prefix}-legacy@example.test`, phone: "", organizationId: null }).returning();
      ids.clients.push(legacyClient!.id);
      assert.equal(legacyClient!.organizationId, null, "registro legado deve permanecer sem organização atribuída");

      const [user] = await db.insert(schema.users).values({ name: "Usuário de autenticação sintético", email: `${prefix}-auth@example.test`, passwordHash: await hashPassword("Senha sintética segura 2026!"), emailVerifiedAt: new Date() }).returning();
      userId = user.id;
      ids.users.push(user.id);
      const [organizationA] = await db.insert(schema.organizations).values({ name: `${prefix} organização A`, slug: `${prefix}-org-a` }).returning();
      const [organizationB] = await db.insert(schema.organizations).values({ name: `${prefix} organização B`, slug: `${prefix}-org-b` }).returning();
      const [organizationWithoutMembership] = await db.insert(schema.organizations).values({ name: `${prefix} organização isolada`, slug: `${prefix}-org-unlinked` }).returning();
      ids.organizations.push(organizationA.id, organizationB.id, organizationWithoutMembership.id);
      organizationBId = organizationB.id;
      organizationWithoutMembershipId = organizationWithoutMembership.id;
      const memberships = await db.insert(schema.organizationMemberships).values([
        { organizationId: organizationA.id, userId: user.id, role: "owner" },
        { organizationId: organizationB.id, userId: user.id, role: "owner" },
      ]).returning();
      ids.memberships.push(...memberships.map((membership) => membership.id));
      const [session] = await db.insert(schema.sessions).values({ userId: user.id, organizationId: organizationA.id, tokenHash: `${prefix}-session-hash`, expiresAt: new Date(Date.now() + 60_000) }).returning();
      ids.sessions.push(session.id);
      const rawSessionToken = createOpaqueToken();
      const [apiSession] = await db.insert(schema.sessions).values({ userId: user.id, organizationId: organizationA.id, tokenHash: hashOpaqueToken(rawSessionToken), expiresAt: new Date(Date.now() + 60 * 60 * 1000) }).returning();
      ids.sessions.push(apiSession.id);
      const tenantBToken = createOpaqueToken();
      const [tenantBSession] = await db.insert(schema.sessions).values({ userId: user.id, organizationId: organizationB.id, tokenHash: hashOpaqueToken(tenantBToken), expiresAt: new Date(Date.now() + 60 * 60 * 1000) }).returning();
      ids.sessions.push(tenantBSession.id);
      crossTenantCookie = sessionCookie(tenantBToken, false).split(";")[0]!;
      organizationId = organizationA.id;
      authCookie = sessionCookie(rawSessionToken, false);
      const [organizationAClient] = await db.insert(schema.clients).values({ ...clientInput(`${prefix} client A`), organizationId: organizationA.id }).returning();
      const [organizationBClient] = await db.insert(schema.clients).values({ ...clientInput(`${prefix} client B`), email: `${prefix}-client-b@example.test`, organizationId: organizationB.id }).returning();
      ids.clients.push(organizationAClient!.id, organizationBClient!.id);
      await assert.rejects(
        () => db.insert(schema.enterprises).values({ ...enterpriseInput(organizationBClient!.id), organizationId: organizationA.id }),
        (error: unknown) => {
          const wrapped = error as { cause?: { code?: string }; code?: string };
          assert.equal(wrapped.cause?.code ?? wrapped.code, "23503", "FK composta deve bloquear associação entre organizações diretamente no PostgreSQL");
          return true;
        },
      );
      await assert.rejects(
        () => db.insert(schema.sessions).values({ userId: user.id, organizationId: organizationWithoutMembership.id, tokenHash: `${prefix}-invalid-session-hash`, expiresAt: new Date(Date.now() + 60_000) }),
        (error: unknown) => {
          const wrapped = error as { cause?: { code?: string }; code?: string };
          assert.equal(wrapped.cause?.code ?? wrapped.code, "23503");
          return true;
        },
      );
      const expiredToken = createOpaqueToken();
      const [expiredSession] = await db.insert(schema.sessions).values({ userId: user.id, organizationId: organizationA.id, tokenHash: hashOpaqueToken(expiredToken), expiresAt: new Date(Date.now() - 1000) }).returning();
      ids.sessions.push(expiredSession!.id);
      assert.equal((await sessionRequest("GET", "/auth/me", sessionCookie(expiredToken, false))).statusCode, 401, "sessão expirada deve ser rejeitada");
      assert.equal((await app.inject({ method: "POST", url: "/clients", headers: { cookie: authCookie }, payload: clientInput("Sem origem") })).statusCode, 403, "mutação sem Origin deve ser rejeitada como proteção CSRF");
    });

    await t.test("Segurança HTTP: cabeçalhos e CORS com allowlist", async () => {
      assert.deepEqual(parseTrustedProxies("127.0.0.1,10.2.0.0/24"), ["127.0.0.1", "10.2.0.0/24"]);
      assert.throws(() => parseTrustedProxies("true"), /TRUST_PROXY/);
      assert.throws(() => parseTrustedProxies("0.0.0.0/0"), /TRUST_PROXY/);
      const allowed = await app.inject({ method: "GET", url: "/health", headers: { origin: "http://localhost:5173" } });
      assert.equal(allowed.statusCode, 200);
      assert.equal(allowed.headers["access-control-allow-origin"], "http://localhost:5173");
      assert.equal(allowed.headers["access-control-allow-credentials"], "true");
      assert.equal(allowed.headers["x-content-type-options"], "nosniff");
      assert.equal(allowed.headers["x-frame-options"], "DENY");

      const preflight = await app.inject({ method: "OPTIONS", url: "/clients", headers: { origin: "http://localhost:5173", "access-control-request-method": "POST" } });
      assert.equal(preflight.statusCode, 204);
      assert.match(String(preflight.headers["access-control-allow-methods"]), /POST/);

      const rejected = await app.inject({ method: "GET", url: "/health", headers: { origin: "https://not-allowed.example" } });
      assert.equal(rejected.statusCode, 403);

      const previousEnvironment = process.env.NODE_ENV;
      const previousSecret = process.env.AUTH_RATE_LIMIT_SECRET;
      process.env.NODE_ENV = "production";
      delete process.env.AUTH_RATE_LIMIT_SECRET;
      try { await assert.rejects(() => buildApp({ socket: false }), /AUTH_RATE_LIMIT_SECRET/); }
      finally {
        if (previousEnvironment === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousEnvironment;
        if (previousSecret === undefined) delete process.env.AUTH_RATE_LIMIT_SECRET; else process.env.AUTH_RATE_LIMIT_SECRET = previousSecret;
      }

      const previousKey = process.env.DOCUMENT_ENCRYPTION_KEY;
      try {
        delete process.env.DOCUMENT_ENCRYPTION_KEY;
        assert.throws(() => documentEncryptionKey(), /DOCUMENT_ENCRYPTION_KEY/);
        process.env.DOCUMENT_ENCRYPTION_KEY = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
        assert.equal(documentEncryptionKey().length, 32);
        process.env.DOCUMENT_ENCRYPTION_KEY = "invalid-key";
        assert.throws(() => documentEncryptionKey(), /Base64 canônico/);
        await assert.rejects(() => buildApp({ socket: false }), /Base64 canônico/, "a API não deve iniciar com chave de documentos inválida");
      } finally {
        if (previousKey === undefined) delete process.env.DOCUMENT_ENCRYPTION_KEY; else process.env.DOCUMENT_ENCRYPTION_KEY = previousKey;
      }
    });

    await t.test("Autenticação: cadastro, verificação, sessão, troca de organização, recuperação e logout", async () => {
      emailOutbox.length = 0;
      const oldTimestamp = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
      await db.insert(schema.authLoginLimits).values([
        { key: staleRateLimitKey, windowStartedAt: oldTimestamp, attempts: 5, updatedAt: oldTimestamp },
        { key: freshRateLimitKey, windowStartedAt: new Date(), attempts: 1, updatedAt: new Date() },
      ]);
      assert.equal((await jsonRequest("POST", "/auth/register", {})).statusCode, 400, "requisição de probe inválida deve chegar à validação depois da limpeza");
      assert.equal((await db.select().from(schema.authLoginLimits).where(eq(schema.authLoginLimits.key, staleRateLimitKey))).length, 0, "limites com mais de 30 dias devem ser removidos");
      assert.equal((await db.select().from(schema.authLoginLimits).where(eq(schema.authLoginLimits.key, freshRateLimitKey))).length, 1, "limites recentes devem ser preservados");
      const previousWebAppUrl = process.env.WEB_APP_URL;
      process.env.WEB_APP_URL = "https://untrusted.example";
      const rejectedEmail = `${prefix}-rejected-origin@example.test`;
      try {
        const rejectedRegistration = await jsonRequest("POST", "/auth/register", {
          name: "Cadastro bloqueado",
          email: rejectedEmail,
          password: "Senha Sintética Segura 2026!",
          organizationName: `${prefix} origem inválida`,
        });
        assert.equal(rejectedRegistration.statusCode, 503, "cadastro deve falhar fechado quando WEB_APP_URL não está na allowlist");
        assert.equal(emailOutbox.length, 0, "não deve emitir link para uma origem não confiável");
        assert.equal((await db.select().from(schema.users).where(eq(schema.users.email, rejectedEmail)).limit(1)).length, 0, "não deve persistir usuário quando a configuração de link é inválida");
      } finally {
        if (previousWebAppUrl === undefined) delete process.env.WEB_APP_URL; else process.env.WEB_APP_URL = previousWebAppUrl;
      }

      const email = `${prefix}-new-user@example.test`;
      const password = "Senha Forte de Demonstração 2026!";
      const registration = await jsonRequest("POST", "/auth/register", { name: "Nova pessoa usuária", email, password, organizationName: `${prefix} escritório inicial` });
      assert.equal(registration.statusCode, 202);
      assert.equal(emailOutbox.length, 1);
      const verificationLink = new URL(emailOutbox[0]!.text.match(/https?:\/\/\S+/)![0]);
      assert.equal(verificationLink.search, "", "token de verificação não deve ser enviado em query string");
      const verificationToken = new URLSearchParams(verificationLink.hash.slice(1)).get("token");
      assert.ok(verificationToken);
      const [pendingUser] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
      ids.users.push(pendingUser!.id);
      const signupMemberships = await db.select().from(schema.organizationMemberships).where(eq(schema.organizationMemberships.userId, pendingUser!.id));
      ids.memberships.push(...signupMemberships.map((membership) => membership.id));
      ids.organizations.push(...signupMemberships.map((membership) => membership.organizationId));
      assert.ok(pendingUser?.passwordHash?.startsWith("scrypt$"));
      assert.equal(pendingUser?.emailVerifiedAt, null);
      assert.ok(!(pendingUser?.passwordHash ?? "").includes(password));
      assert.equal((await jsonRequest("POST", "/auth/email-verification/confirm", { token: verificationToken })).statusCode, 200);
      assert.equal((await jsonRequest("POST", "/auth/email-verification/confirm", { token: verificationToken })).statusCode, 400);

      const login = await jsonRequest("POST", "/auth/login", { email, password });
      assert.equal(login.statusCode, 200);
      const newCookie = cookieValue(login);
      const cookieHeader = login.headers["set-cookie"] as string;
      assert.match(cookieHeader, /HttpOnly/);
      assert.match(cookieHeader, /SameSite=Strict/);
      assert.equal((await sessionRequest("GET", "/auth/me", newCookie)).statusCode, 200);

      const organizationsResponse = await sessionRequest("GET", "/auth/organizations", newCookie);
      const userOrganizations = body(organizationsResponse) as unknown as Array<{ id: string; role: string }>;
      assert.equal(userOrganizations.length, 1);
      assert.equal(userOrganizations[0]!.role, "owner");

      const extraDeviceToken = createOpaqueToken();
      const [extraDeviceSession] = await db.insert(schema.sessions).values({ userId: pendingUser!.id, organizationId: signupMemberships[0]!.organizationId, tokenHash: hashOpaqueToken(extraDeviceToken), expiresAt: new Date(Date.now() + 60 * 60 * 1000) }).returning();
      ids.sessions.push(extraDeviceSession!.id);
      const listedSessions = body(await sessionRequest("GET", "/auth/sessions", newCookie)) as unknown as Array<{ id: string; isCurrent: boolean; createdAt: string; lastSeenAt: string; expiresAt: string }>;
      assert.equal(listedSessions.length, 2, "a lista deve incluir somente as duas sessões ativas da conta autenticada");
      assert.equal(listedSessions.filter((item) => item.isCurrent).length, 1);
      assert.ok(listedSessions.every((item) => Number.isFinite(Date.parse(item.createdAt)) && Number.isFinite(Date.parse(item.lastSeenAt)) && Number.isFinite(Date.parse(item.expiresAt))));
      assert.ok(!JSON.stringify(listedSessions).includes("tokenHash"), "a resposta não deve expor hashes nem tokens de sessão");
      assert.equal((await sessionRequest("POST", `/auth/sessions/${listedSessions.find((item) => item.isCurrent)!.id}/revoke`, newCookie)).statusCode, 400, "a sessão atual só pode ser encerrada pelo logout");
      const revokeExtra = await sessionRequest("POST", `/auth/sessions/${extraDeviceSession!.id}/revoke`, newCookie);
      assert.equal(revokeExtra.statusCode, 204);
      assert.equal((await sessionRequest("GET", "/auth/me", sessionCookie(extraDeviceToken, false))).statusCode, 401, "a sessão revogada não deve autenticar novas solicitações");
      assert.equal((body(await sessionRequest("GET", "/auth/sessions", newCookie)) as unknown[]).length, 1, "a lista deve refletir a revogação persistida");
      assert.equal((await sessionRequest("POST", `/auth/sessions/${randomUUID()}/revoke`, newCookie)).statusCode, 404, "não deve revelar nem revogar sessão inexistente/de outra conta");

      const recoveryOutboxStart = emailOutbox.length;
      assert.equal((await jsonRequest("POST", "/auth/password-recovery/request", { email })).statusCode, 202);
      assert.equal(emailOutbox.length, recoveryOutboxStart + 1);
      const resetLink = new URL(emailOutbox.at(-1)!.text.match(/https?:\/\/\S+/)![0]);
      assert.equal(resetLink.search, "", "token de recuperação não deve ser enviado em query string");
      const resetToken = new URLSearchParams(resetLink.hash.slice(1)).get("token");
      assert.ok(resetToken);
      const newPassword = "Outra Senha Forte de 2026!";
      assert.equal((await jsonRequest("POST", "/auth/password-recovery/confirm", { token: resetToken, password: newPassword })).statusCode, 200);
      assert.equal((await sessionRequest("GET", "/auth/me", newCookie)).statusCode, 401, "reset deve invalidar sessões anteriores");
      assert.equal((await jsonRequest("POST", "/auth/password-recovery/confirm", { token: resetToken, password })).statusCode, 400, "token de recuperação deve ser de uso único");
      const relogin = await jsonRequest("POST", "/auth/login", { email, password: newPassword });
      assert.equal(relogin.statusCode, 200);
      const reloginCookie = cookieValue(relogin);
      assert.equal((await sessionRequest("POST", "/auth/logout", reloginCookie)).statusCode, 204);
      assert.equal((await sessionRequest("GET", "/auth/me", reloginCookie)).statusCode, 401);

      const orgList = await sessionRequest("GET", "/auth/organizations", authCookie);
      assert.equal(orgList.statusCode, 200, JSON.stringify(body(orgList)));
      assert.equal((body(orgList) as unknown[]).length, 2);
      assert.equal((await sessionRequest("POST", "/auth/organizations/active", authCookie, { organizationId: organizationBId })).statusCode, 200);
      assert.equal(body(await sessionRequest("GET", "/auth/me", authCookie)).organization.id, organizationBId);
      assert.equal((await sessionRequest("POST", "/auth/organizations/active", authCookie, { organizationId: organizationWithoutMembershipId })).statusCode, 403);
      assert.equal((await sessionRequest("POST", "/auth/organizations/active", authCookie, { organizationId })).statusCode, 200);

      const orgBOwnerMembership = await db.select().from(schema.organizationMemberships).where(and(eq(schema.organizationMemberships.organizationId, organizationBId), eq(schema.organizationMemberships.userId, userId))).limit(1);
      assert.equal((await sessionRequest("POST", "/auth/organizations/active", authCookie, { organizationId: organizationBId })).statusCode, 200);
      assert.equal((await sessionRequest("PATCH", `/auth/members/${orgBOwnerMembership[0]!.id}`, authCookie, { role: "admin" })).statusCode, 409, "não é possível rebaixar o último owner");
      assert.equal((await sessionRequest("DELETE", `/auth/members/${orgBOwnerMembership[0]!.id}`, authCookie)).statusCode, 409, "não é possível remover a associação do último owner");
      const [concurrentOwnerUser] = await db.insert(schema.users).values({ name: `${prefix} concurrent owner`, email: `${prefix}-concurrent-owner@example.test`, emailVerifiedAt: new Date() }).returning();
      ids.users.push(concurrentOwnerUser!.id);
      const [concurrentOwnerMembership] = await db.insert(schema.organizationMemberships).values({ organizationId: organizationBId, userId: concurrentOwnerUser!.id, role: "owner" }).returning();
      ids.memberships.push(concurrentOwnerMembership!.id);
      const simultaneousDemotions = await Promise.all([
        sessionRequest("PATCH", `/auth/members/${orgBOwnerMembership[0]!.id}`, authCookie, { role: "admin" }),
        sessionRequest("PATCH", `/auth/members/${concurrentOwnerMembership!.id}`, authCookie, { role: "admin" }),
      ]);
      assert.deepEqual(simultaneousDemotions.map((response) => response.statusCode).sort(), [200, 403], "a segunda tentativa concorrente deve perder a permissão ao consultar o papel já alterado");
      const remainingOwners = await db.select().from(schema.organizationMemberships).where(and(eq(schema.organizationMemberships.organizationId, organizationBId), eq(schema.organizationMemberships.role, "owner")));
      assert.equal(remainingOwners.length, 1);
      await db.update(schema.organizationMemberships).set({ role: "owner" }).where(eq(schema.organizationMemberships.id, orgBOwnerMembership[0]!.id));
      assert.equal((await sessionRequest("POST", "/auth/organizations/active", authCookie, { organizationId })).statusCode, 200);

      const [newMember] = await db.insert(schema.users).values({ name: `${prefix} managed member`, email: `${prefix}-managed-member@example.test`, emailVerifiedAt: new Date() }).returning();
      ids.users.push(newMember!.id);
      const [unverifiedMember] = await db.insert(schema.users).values({ name: `${prefix} pending member`, email: `${prefix}-pending-member@example.test` }).returning();
      ids.users.push(unverifiedMember!.id);
      assert.equal((await sessionRequest("POST", "/auth/members", authCookie, { email: "invalid", role: "member" })).statusCode, 400);
      assert.equal((await sessionRequest("POST", "/auth/members", authCookie, { email: unverifiedMember!.email })).statusCode, 404, "contas sem e-mail verificado não podem ser associadas");
      const addedMember = await sessionRequest("POST", "/auth/members", authCookie, { email: newMember!.email });
      assert.equal(addedMember.statusCode, 201, JSON.stringify(body(addedMember)));
      const managedMembershipId = body(addedMember).id as string; ids.memberships.push(managedMembershipId);
      assert.equal(body(addedMember).role, "member", "conta adicionada deve receber apenas o papel mínimo por padrão");
      assert.equal((await sessionRequest("POST", "/auth/members", authCookie, { email: newMember!.email })).statusCode, 409);
      const orgAMembers = body(await sessionRequest("GET", "/auth/members", authCookie)) as unknown as Array<{ id: string; email: string; role: string }>;
      assert.ok(orgAMembers.some((item) => item.id === managedMembershipId && item.email === newMember!.email));
      const orgBMembers = body(await sessionRequest("GET", "/auth/members", crossTenantCookie)) as unknown as Array<{ email: string }>;
      assert.ok(!orgBMembers.some((item) => item.email === newMember!.email), "a listagem de membros deve respeitar a organização ativa");
      const adminSessionToken = createOpaqueToken();
      const [adminSession] = await db.insert(schema.sessions).values({ userId: newMember!.id, organizationId, tokenHash: hashOpaqueToken(adminSessionToken), expiresAt: new Date(Date.now() + 60 * 60 * 1000) }).returning();
      ids.sessions.push(adminSession!.id);
      const managedCookie = sessionCookie(adminSessionToken, false).split(";")[0]!;
      assert.equal((await sessionRequest("GET", "/auth/members", managedCookie)).statusCode, 403, "membro não pode administrar membros");
      assert.equal((await sessionRequest("PATCH", `/auth/members/${managedMembershipId}`, authCookie, { role: "admin" })).statusCode, 200);
      assert.equal((await sessionRequest("GET", "/auth/members", managedCookie)).statusCode, 200, "admin pode consultar membros");
      assert.equal((await sessionRequest("PATCH", `/auth/members/${managedMembershipId}`, managedCookie, { role: "owner" })).statusCode, 403, "admin não pode atribuir owner");
      const ownerMembership = await db.select().from(schema.organizationMemberships).where(and(eq(schema.organizationMemberships.organizationId, organizationId), eq(schema.organizationMemberships.userId, userId))).limit(1);
      assert.equal((await sessionRequest("DELETE", `/auth/members/${ownerMembership[0]!.id}`, managedCookie)).statusCode, 403, "admin não pode remover owner");
      assert.equal((await sessionRequest("PATCH", `/auth/members/${managedMembershipId}`, authCookie, { role: "member" })).statusCode, 200);
      assert.equal((await sessionRequest("DELETE", `/auth/members/${managedMembershipId}`, authCookie)).statusCode, 204);
      ids.memberships = ids.memberships.filter((id) => id !== managedMembershipId);
      assert.equal((await sessionRequest("GET", "/auth/me", managedCookie)).statusCode, 401, "remover membro deve invalidar suas sessões");
      const memberAudit = body(await sessionRequest("GET", "/auth/audit-events?limit=100", authCookie)) as unknown as Array<{ actorUserId: string; targetUserId: string | null; action: string; metadata: Record<string, unknown> }>;
      const managedMemberEvents = memberAudit.filter((event) => event.targetUserId === newMember!.id);
      assert.deepEqual(managedMemberEvents.map((event) => event.action).sort(), ["member.added", "member.removed", "member.role_changed", "member.role_changed"]);
      assert.ok(managedMemberEvents.every((event) => event.actorUserId === userId));
      assert.ok(!JSON.stringify(managedMemberEvents).includes(newMember!.email), "eventos de auditoria não devem duplicar e-mail");
      const auditEventId = (await db.select({ id: schema.organizationAuditEvents.id }).from(schema.organizationAuditEvents).where(eq(schema.organizationAuditEvents.organizationId, organizationId)).limit(1))[0]?.id;
      assert.ok(auditEventId, "evento de auditoria esperado para validar proteção append-only");
      await assert.rejects(() => db.update(schema.organizationAuditEvents).set({ action: "alterado" }).where(eq(schema.organizationAuditEvents.id, auditEventId!)), "UPDATE de auditoria deve ser bloqueado");
      await assert.rejects(() => db.delete(schema.organizationAuditEvents).where(eq(schema.organizationAuditEvents.id, auditEventId!)), "DELETE de auditoria deve ser bloqueado");
      await assert.rejects(() => db.execute(sql`TRUNCATE TABLE organization_audit_events`), "TRUNCATE de auditoria deve ser bloqueado");
      const orgBAudit = body(await sessionRequest("GET", "/auth/audit-events", crossTenantCookie)) as unknown as Array<{ targetUserId: string | null }>;
      assert.ok(!orgBAudit.some((event) => event.targetUserId === newMember!.id), "auditoria deve respeitar o tenant ativo");

      const limitedEmail = `${prefix}-locked@example.test`;
      for (let attempt = 0; attempt < 5; attempt += 1) assert.equal((await jsonRequest("POST", "/auth/login", { email: limitedEmail, password })).statusCode, 401);
      assert.equal((await jsonRequest("POST", "/auth/login", { email: limitedEmail, password })).statusCode, 429);
      const limitKey = createHmac("sha256", process.env.AUTH_RATE_LIMIT_SECRET!).update(`${limitedEmail}\u0000127.0.0.1`).digest("hex");
      const [limitRecord] = await db.select().from(schema.authLoginLimits).where(eq(schema.authLoginLimits.key, limitKey)).limit(1);
      assert.equal(limitRecord?.attempts, 5);
      assert.match(limitRecord?.key ?? "", /^[a-f0-9]{64}$/);
      assert.ok(!limitRecord?.key.includes(limitedEmail));

      const unknownEmail = `${prefix}-not-registered@example.test`;
      for (let attempt = 0; attempt < 10; attempt += 1) assert.equal((await jsonRequest("POST", "/auth/email-verification/resend", { email: unknownEmail })).statusCode, 202);
      assert.equal((await jsonRequest("POST", "/auth/email-verification/resend", { email: unknownEmail })).statusCode, 429, "solicitações públicas de e-mail devem ter limite persistente por IP e rota");
      const concurrentAttempts = await Promise.all(Array.from({ length: 15 }, () => jsonRequest("POST", "/auth/email-verification/confirm", { token: "synthetic-invalid-verification-token" })));
      assert.equal(concurrentAttempts.filter((response) => response.statusCode === 400).length, 8, "duas confirmações anteriores já consumiram o limite desta rota");
      assert.equal(concurrentAttempts.filter((response) => response.statusCode === 429).length, 7, "o rate limit deve impor o limite em chamadas concorrentes");
    });

    await t.test("Clientes: CRUD, validação e bloqueio por dependências", async () => {
      let response = await jsonRequest("POST", "/clients", clientInput()); assert.equal(response.statusCode, 201);
      const created = body(response); clientId = created.id; ids.clients.push(clientId);
      assert.equal((await jsonRequest("GET", "/clients")).statusCode, 200);
      assert.equal((await jsonRequest("GET", `/clients/${clientId}`)).statusCode, 200);
      assert.equal((await sessionRequest("GET", `/clients/${clientId}`, crossTenantCookie)).statusCode, 404);
      assert.equal((await sessionRequest("PUT", `/clients/${clientId}`, crossTenantCookie, clientInput("Tentativa cruzada"))).statusCode, 404);
      assert.equal((await sessionRequest("DELETE", `/clients/${clientId}`, crossTenantCookie)).statusCode, 404);
      const otherClients = body(await sessionRequest("GET", "/clients", crossTenantCookie)) as unknown as Array<{ id: string }>;
      assert.ok(!otherClients.some((item) => item.id === clientId));
      const foreignClient = await sessionRequest("POST", "/clients", crossTenantCookie, clientInput(`${prefix} organization B client`)); assert.equal(foreignClient.statusCode, 201);
      organizationBClientId = body(foreignClient).id as string; ids.clients.push(organizationBClientId);
      assert.equal((await sessionRequest("POST", "/enterprises", crossTenantCookie, enterpriseInput(clientId))).statusCode, 400);
      const [memberUser] = await db.insert(schema.users).values({ name: `${prefix} membro`, email: `${prefix}-member@example.test`, emailVerifiedAt: new Date() }).returning();
      ids.users.push(memberUser!.id);
      const [memberMembership] = await db.insert(schema.organizationMemberships).values({ organizationId: organizationBId, userId: memberUser!.id, role: "member" }).returning();
      ids.memberships.push(memberMembership!.id);
      const memberToken = createOpaqueToken();
      const [memberSession] = await db.insert(schema.sessions).values({ userId: memberUser!.id, organizationId: organizationBId, tokenHash: hashOpaqueToken(memberToken), expiresAt: new Date(Date.now() + 60 * 60 * 1000) }).returning();
      ids.sessions.push(memberSession!.id);
      const memberCookie = sessionCookie(memberToken, false).split(";")[0]!;
      const memberClient = await sessionRequest("POST", "/clients", memberCookie, clientInput(`${prefix} member client`)); assert.equal(memberClient.statusCode, 201);
      const memberClientId = body(memberClient).id as string; ids.clients.push(memberClientId);
      assert.equal((await sessionRequest("DELETE", `/clients/${memberClientId}`, memberCookie)).statusCode, 403, "papel member não pode excluir registros");
      response = await jsonRequest("PUT", `/clients/${clientId}`, { ...clientInput(), name: `${prefix} client updated` }); assert.equal(response.statusCode, 200); assert.equal(body(response).name, `${prefix} client updated`);
      assert.equal((await jsonRequest("POST", "/clients", { ...clientInput(), email: "invalid" })).statusCode, 400);
      assert.equal((await jsonRequest("GET", "/clients/not-a-uuid")).statusCode, 400);
      response = await jsonRequest("POST", "/clients", clientInput(`${prefix} unlinked client`)); assert.equal(response.statusCode, 201); const unlinked = body(response).id; ids.clients.push(unlinked);
      assert.equal((await jsonRequest("DELETE", `/clients/${unlinked}`)).statusCode, 204);
      ids.clients = ids.clients.filter((id) => id !== unlinked);
    });

    await t.test("Empreendimentos: vínculo, contagem e exclusão restrita", async () => {
      let response = await jsonRequest("POST", "/enterprises", enterpriseInput(clientId)); assert.equal(response.statusCode, 201);
      const created = body(response); enterpriseId = created.id; ids.enterprises.push(enterpriseId); assert.equal(created.relatedCases, 0);
      assert.equal((await jsonRequest("GET", "/enterprises")).statusCode, 200);
      assert.equal((await jsonRequest("GET", `/enterprises/${enterpriseId}`)).statusCode, 200);
      assert.equal((await sessionRequest("GET", `/enterprises/${enterpriseId}`, crossTenantCookie)).statusCode, 404);
      assert.equal((await sessionRequest("PUT", `/enterprises/${enterpriseId}`, crossTenantCookie, enterpriseInput(organizationBClientId))).statusCode, 404);
      assert.equal((await sessionRequest("DELETE", `/enterprises/${enterpriseId}`, crossTenantCookie)).statusCode, 404);
      assert.equal((await sessionRequest("POST", "/processes", crossTenantCookie, processInput(enterpriseId))).statusCode, 400);
      assert.equal((await jsonRequest("POST", "/enterprises", enterpriseInput(randomUUID()))).statusCode, 400);
      response = await sessionRequest("POST", "/enterprises", crossTenantCookie, enterpriseInput(organizationBClientId, `${prefix} organization B enterprise`)); assert.equal(response.statusCode, 201);
      organizationBEnterpriseId = body(response).id; ids.enterprises.push(organizationBEnterpriseId);
      response = await jsonRequest("PUT", `/enterprises/${enterpriseId}`, { ...enterpriseInput(clientId), name: `${prefix} enterprise updated` }); assert.equal(response.statusCode, 200);
      response = await jsonRequest("POST", "/enterprises", enterpriseInput(clientId, `${prefix} unlinked enterprise`)); assert.equal(response.statusCode, 201); const unlinked = body(response).id; ids.enterprises.push(unlinked);
      assert.equal((await jsonRequest("DELETE", `/enterprises/${unlinked}`)).statusCode, 204); ids.enterprises = ids.enterprises.filter((id) => id !== unlinked);
    });

    await t.test("Processos: vínculo, histórico, validação e restrição de exclusão", async () => {
      let response = await jsonRequest("POST", "/processes", processInput(enterpriseId)); assert.equal(response.statusCode, 201);
      const created = body(response); processId = created.id; ids.processes.push(processId); assert.ok(created.history.length >= 1);
      assert.equal((await jsonRequest("GET", `/processes/${processId}`)).statusCode, 200);
      assert.equal((await sessionRequest("GET", `/processes/${processId}`, crossTenantCookie)).statusCode, 404);
      assert.equal((await sessionRequest("PUT", `/processes/${processId}`, crossTenantCookie, processInput(organizationBEnterpriseId))).statusCode, 404);
      assert.equal((await sessionRequest("DELETE", `/processes/${processId}`, crossTenantCookie)).statusCode, 404);
      assert.equal((await sessionRequest("POST", "/tasks", crossTenantCookie, taskInput(processId))).statusCode, 400);
      assert.equal((await jsonRequest("POST", "/processes", processInput(randomUUID()))).statusCode, 400);
      response = await sessionRequest("POST", "/processes", crossTenantCookie, processInput(organizationBEnterpriseId, `${prefix} organization B process`)); assert.equal(response.statusCode, 201);
      organizationBProcessId = body(response).id; ids.processes.push(organizationBProcessId);
      assert.equal((await sessionRequest("GET", `/processes/${organizationBProcessId}`, authCookie)).statusCode, 404);
      assert.equal((await sessionRequest("PUT", `/processes/${organizationBProcessId}`, authCookie, processInput(enterpriseId))).statusCode, 404);
      assert.equal((await sessionRequest("DELETE", `/processes/${organizationBProcessId}`, authCookie)).statusCode, 404);
      assert.equal((await jsonRequest("POST", "/processes", processInput(organizationBEnterpriseId))).statusCode, 400);
      const edited = await jsonRequest("PUT", `/processes/${processId}`, { ...processInput(enterpriseId), stage: "Documentação", status: "Aguardando cliente" });
      assert.equal(edited.statusCode, 200); assert.ok(body(edited).history.length >= 3);
      response = await jsonRequest("POST", "/processes", processInput(enterpriseId, `${prefix} unlinked process`)); assert.equal(response.statusCode, 201); const unlinked = body(response).id; ids.processes.push(unlinked);
      assert.equal((await jsonRequest("DELETE", `/processes/${unlinked}`)).statusCode, 204); ids.processes = ids.processes.filter((id) => id !== unlinked);
    });

    await t.test("Tarefas: status, conclusão, subtarefas, transferências, espera e persistência", async () => {
      let response = await jsonRequest("POST", "/tasks", taskInput(processId)); assert.equal(response.statusCode, 201);
      let task = body(response); taskId = task.id; ids.tasks.push(taskId); assert.equal(task.waitPeriods.length, 1);
      assert.equal((await jsonRequest("GET", `/tasks/${taskId}`)).statusCode, 200);
      assert.equal((await sessionRequest("GET", `/tasks/${taskId}`, crossTenantCookie)).statusCode, 404);
      assert.equal((await sessionRequest("PUT", `/tasks/${taskId}`, crossTenantCookie, taskInput(organizationBProcessId))).statusCode, 404);
      assert.equal((await sessionRequest("POST", `/tasks/${taskId}/transfers`, crossTenantCookie, { toAssigneeId: "demo-team-mariana", justification: "Tentativa cruzada" })).statusCode, 404);
      assert.equal((await sessionRequest("DELETE", `/tasks/${taskId}`, crossTenantCookie)).statusCode, 404);
      assert.equal((await sessionRequest("POST", "/obligations", crossTenantCookie, obligationInput(processId))).statusCode, 400);
      response = await sessionRequest("POST", "/tasks", crossTenantCookie, taskInput(organizationBProcessId)); assert.equal(response.statusCode, 201);
      organizationBTaskId = body(response).id; ids.tasks.push(organizationBTaskId);
      assert.equal((await sessionRequest("GET", `/tasks/${organizationBTaskId}`, authCookie)).statusCode, 404);
      assert.equal((await sessionRequest("PUT", `/tasks/${organizationBTaskId}`, authCookie, taskInput(processId))).statusCode, 404);
      assert.equal((await sessionRequest("POST", `/tasks/${organizationBTaskId}/transfers`, authCookie, { toAssigneeId: "demo-team-mariana", justification: "Tentativa cruzada" })).statusCode, 404);
      assert.equal((await sessionRequest("DELETE", `/tasks/${organizationBTaskId}`, authCookie)).statusCode, 404);
      assert.equal((await jsonRequest("POST", "/tasks", taskInput(organizationBProcessId))).statusCode, 400);
      const updated = await jsonRequest("PUT", `/tasks/${taskId}`, { ...taskInput(processId), status: "Concluída", subtasks: [{ id: "fixture-subtask", title: "Etapa sintética", completed: true }] });
      assert.equal(updated.statusCode, 200); task = body(updated); assert.ok(task.completedAt); assert.equal(task.subtasks[0].completed, true); assert.ok(task.waitPeriods[0].endedAt); assert.ok(task.history.some((entry: { type: string }) => entry.type === "status"));
      const transfer = await jsonRequest("POST", `/tasks/${taskId}/transfers`, { toAssigneeId: "demo-team-mariana", justification: "Transferência sintética" });
      assert.equal(transfer.statusCode, 200); assert.equal(body(transfer).assigneeId, "demo-team-mariana"); assert.equal(body(transfer).transfers.length, 1);
      const persisted = await jsonRequest("GET", `/tasks/${taskId}`); assert.equal(persisted.statusCode, 200); assert.equal(body(persisted).history.length, body(transfer).history.length);
      assert.equal((await jsonRequest("POST", "/tasks", { ...taskInput(randomUUID()) })).statusCode, 400);
    });

    await t.test("Condicionantes: ciclos, histórico, evidências e arquivamento", async () => {
      let response = await jsonRequest("POST", "/obligations", obligationInput(processId)); assert.equal(response.statusCode, 201);
      let obligation = body(response); obligationId = obligation.id; ids.obligations.push(obligationId); occurrenceId = obligation.occurrences[0].id;
      assert.equal((await sessionRequest("GET", `/obligations/${obligationId}`, crossTenantCookie)).statusCode, 404);
      assert.equal((await sessionRequest("PUT", `/obligations/${obligationId}`, crossTenantCookie, obligationInput(processId))).statusCode, 404);
      assert.equal((await sessionRequest("POST", `/obligations/${obligationId}/occurrences`, crossTenantCookie)).statusCode, 404);
      assert.equal((await sessionRequest("PUT", `/obligations/${obligationId}/occurrences/${occurrenceId}`, crossTenantCookie, { status: "Cumprida", responsibleId: "demo-team-mariana", observations: "Tentativa cruzada" })).statusCode, 404);
      assert.equal((await sessionRequest("POST", `/obligations/${obligationId}/occurrences/${occurrenceId}/evidence`, crossTenantCookie, { name: "Tentativa", description: "Teste", deliveredAt: "2026-11-12", notes: "Tentativa cruzada" })).statusCode, 404);
      assert.equal((await sessionRequest("DELETE", `/obligations/${obligationId}`, crossTenantCookie)).statusCode, 404);
      response = await sessionRequest("POST", "/obligations", crossTenantCookie, obligationInput(organizationBProcessId)); assert.equal(response.statusCode, 201);
      const tenantBObligation = body(response); organizationBObligationId = tenantBObligation.id; organizationBOccurrenceId = tenantBObligation.occurrences[0].id; ids.obligations.push(organizationBObligationId);
      assert.equal((await sessionRequest("GET", `/obligations/${organizationBObligationId}`, authCookie)).statusCode, 404);
      assert.equal((await sessionRequest("PUT", `/obligations/${organizationBObligationId}`, authCookie, obligationInput(organizationBProcessId))).statusCode, 404);
      assert.equal((await sessionRequest("POST", `/obligations/${organizationBObligationId}/occurrences`, authCookie)).statusCode, 404);
      assert.equal((await sessionRequest("PUT", `/obligations/${organizationBObligationId}/occurrences/${organizationBOccurrenceId}`, authCookie, { status: "Cumprida", responsibleId: "demo-team-mariana", observations: "Tentativa cruzada" })).statusCode, 404);
      assert.equal((await sessionRequest("POST", `/obligations/${organizationBObligationId}/occurrences/${organizationBOccurrenceId}/evidence`, authCookie, { name: "Tentativa", description: "Teste", deliveredAt: "2026-11-12", notes: "Tentativa cruzada" })).statusCode, 404);
      assert.equal((await sessionRequest("DELETE", `/obligations/${organizationBObligationId}`, authCookie)).statusCode, 404);
      assert.equal((await jsonRequest("POST", "/obligations", obligationInput(organizationBProcessId))).statusCode, 400);
      assert.equal((await jsonRequest("PUT", `/obligations/${obligationId}`, { ...obligationInput(processId), title: `${prefix} obligation updated` })).statusCode, 200);
      response = await jsonRequest("POST", `/obligations/${obligationId}/occurrences`); assert.equal(response.statusCode, 200); obligation = body(response); assert.equal(obligation.occurrences.length, 2);
      response = await jsonRequest("POST", `/obligations/${obligationId}/occurrences`); assert.equal(response.statusCode, 200); assert.equal(body(response).occurrences.length, 3);
      const evidence = await jsonRequest("POST", `/obligations/${obligationId}/occurrences/${occurrenceId}/evidence`, { name: "Relatório sintético", description: "Teste", deliveredAt: "2026-11-12", notes: "Fixture" }); assert.equal(evidence.statusCode, 201);
      const updateOccurrence = await jsonRequest("PUT", `/obligations/${obligationId}/occurrences/${occurrenceId}`, { status: "Cumprida", responsibleId: "demo-team-mariana", observations: "Concluída no teste" });
      assert.equal(updateOccurrence.statusCode, 200); obligation = body(updateOccurrence); assert.equal(obligation.occurrences.find((item: { id: string }) => item.id === occurrenceId).evidence.length, 1); assert.ok(obligation.history.length >= 2);
      const archived = await jsonRequest("DELETE", `/obligations/${obligationId}`); assert.equal(archived.statusCode, 200); assert.equal(body(archived).status, "inactive"); assert.ok(body(archived).history.some((entry: { message: string }) => entry.message.includes("arquivada")));
    });

    await t.test("Documentos: importação de legado, arquivo físico, links, preview, download e validações", async () => {
      const legacyPlainId = randomUUID(); const legacyPlainBytes = Buffer.from("synthetic legacy plaintext document");
      await writeFile(join(runStorage, legacyPlainId), legacyPlainBytes, { mode: 0o600 });
      assert.deepEqual(await readStoredFile(legacyPlainId), legacyPlainBytes, "arquivos legados em claro devem permanecer legíveis sem reescrita");
      await rm(join(runStorage, legacyPlainId));
      const legacyClient = { ...clientInput("Residencial Aurora") };
      const responseClient = await jsonRequest("POST", "/clients", legacyClient); assert.equal(responseClient.statusCode, 201); const mappedClientId = body(responseClient).id; ids.clients.push(mappedClientId);
      const responseEnterprise = await jsonRequest("POST", "/enterprises", enterpriseInput(mappedClientId, "Residencial Aurora")); assert.equal(responseEnterprise.statusCode, 201); const mappedEnterpriseId = body(responseEnterprise).id; ids.enterprises.push(mappedEnterpriseId);
      const responseProcess = await jsonRequest("POST", "/processes", processInput(mappedEnterpriseId, "Licença de operação — Residencial Aurora")); assert.equal(responseProcess.statusCode, 201); const mappedProcessId = body(responseProcess).id; ids.processes.push(mappedProcessId);
      const mappedTaskPayload = { ...taskInput(mappedProcessId), title: "Conferir documentos da renovação" };
      const responseTask = await jsonRequest("POST", "/tasks", mappedTaskPayload); assert.equal(responseTask.statusCode, 201); const mappedTaskId = body(responseTask).id; ids.tasks.push(mappedTaskId);
      const responseObligation = await jsonRequest("POST", "/obligations", { ...obligationInput(mappedProcessId), title: "Relatório de gerenciamento de resíduos", firstDueDate: "2026-10-10" }); assert.equal(responseObligation.statusCode, 201); const mappedObligation = body(responseObligation); ids.obligations.push(mappedObligation.id);

      const sourceObligation = demoObligations[0]; const sourceOccurrence = sourceObligation.occurrences[0];
      const legacy = { id: "legacy-doc-fixture", name: `${prefix} migrated PDF`, originalName: "arquivo legado.pdf", extension: "PDF", mimeType: "application/pdf", size: 9_600_000, addedAt: "2026-11-01T12:00:00.000Z", updatedAt: "2026-11-01T12:00:00.000Z", description: "Documento sintético migrado", category: "Outros", responsible: "Equipe teste", status: "Em análise", history: [], links: { clientIds: ["demo-client-aurora"], enterpriseIds: ["demo-enterprise-aurora-residencial"], processIds: ["demo-process-aurora-license"], taskIds: ["demo-task-aurora-docs"], occurrences: [{ obligationId: sourceObligation.id, occurrenceId: sourceOccurrence.id }] } };
      const mapped = mapLegacyLinks(legacy as never, { clients: [{ id: mappedClientId, name: "Residencial Aurora" }] as never, enterprises: [{ id: mappedEnterpriseId, name: "Residencial Aurora" }] as never, processes: [{ id: mappedProcessId, name: "Licença de operação — Residencial Aurora" }] as never, tasks: [{ id: mappedTaskId, title: "Conferir documentos da renovação" }] as never, obligations: [mappedObligation] as never });
      assert.equal(mapped.issues.length, 0, "IDs demonstrativos antigos devem ser remapeados a UUIDs reais pelo nome e período");
      assert.equal(mapped.links.clientIds[0], mappedClientId); assert.equal(mapped.links.occurrences[0].obligationId, mappedObligation.id);
      const pdf = minimalPdf(9_600_000);
      const legacyMetadata = { name: legacy.name, description: legacy.description, category: legacy.category, responsible: legacy.responsible, status: legacy.status, links: mapped.links, legacyImportId: legacy.id };
      const upload = await app.inject({ method: "POST", url: "/documents", ...multipart(legacyMetadata, legacy.originalName, "application/pdf", pdf) });
      assert.equal(upload.statusCode, 201, JSON.stringify(body(upload))); const document = body(upload); ids.documents.push(document.id);
      const encryptedDiskFile = await readFile(join(runStorage, document.id));
      assert.deepEqual(encryptedDiskFile.subarray(0, 8), Buffer.from([0x4a, 0x43, 0x44, 0x4f, 0x43, 0x01, 0x00, 0xff]), "novos arquivos devem ser gravados com envelope criptografado");
      assert.ok(!encryptedDiskFile.includes(Buffer.from("%PDF-1.4")), "o arquivo em repouso não deve conter o PDF em claro");
      assert.deepEqual(await readStoredFile(document.id), pdf, "o storage deve descriptografar preservando os bytes originais");
      assert.equal((await sessionRequest("GET", `/documents/${document.id}`, crossTenantCookie)).statusCode, 404);
      assert.equal((await sessionRequest("GET", `/documents/${document.id}/file`, crossTenantCookie)).statusCode, 404);
      assert.equal((await sessionRequest("PUT", `/documents/${document.id}`, crossTenantCookie, documentInput())).statusCode, 404);
      assert.equal((await sessionRequest("DELETE", `/documents/${document.id}`, crossTenantCookie)).statusCode, 404);
      assert.equal(document.size, pdf.length); assert.deepEqual(document.links.clientIds, [mappedClientId]); assert.deepEqual(document.links.processIds, [mappedProcessId]);
      const retryUpload = await app.inject({ method: "POST", url: "/documents", ...multipart(legacyMetadata, legacy.originalName, "application/pdf", pdf) });
      assert.equal(retryUpload.statusCode, 200); assert.equal(body(retryUpload).id, document.id);
      const docsAfterRetry = body(await jsonRequest("GET", "/documents")) as unknown as Array<{ id: string }>;
      assert.equal(docsAfterRetry.filter((item) => item.id === document.id).length, 1);
      assert.equal((await jsonRequest("GET", "/documents")).statusCode, 200); assert.equal((await jsonRequest("GET", `/documents/${document.id}`)).statusCode, 200);
      const file = await jsonRequest("GET", `/documents/${document.id}/file`); assert.equal(file.statusCode, 200); assert.equal(file.headers["content-disposition"].startsWith("attachment;"), true); assert.equal(file.rawPayload.length, pdf.length);
      const preview = await jsonRequest("GET", `/documents/${document.id}/file?inline=true`); assert.equal(preview.statusCode, 200); assert.equal(preview.headers["content-disposition"].startsWith("inline;"), true);
      const corruptedFile = Buffer.from(encryptedDiskFile); corruptedFile[corruptedFile.length - 1] ^= 0x01;
      await writeFile(join(runStorage, document.id), corruptedFile, { mode: 0o600 });
      assert.equal((await jsonRequest("GET", `/documents/${document.id}/file`)).statusCode, 500, "alteração do ciphertext deve falhar na autenticação GCM");
      await writeFile(join(runStorage, document.id), encryptedDiskFile, { mode: 0o600 });
      const edited = await jsonRequest("PUT", `/documents/${document.id}`, { name: `${prefix} edited document`, description: "Editado", category: "Protocolos", responsible: "Equipe teste", status: "Aprovado", links: mapped.links }); assert.equal(edited.statusCode, 200); assert.equal(body(edited).status, "Aprovado");
      const badLegacyLinks = await app.inject({ method: "POST", url: "/documents", ...multipart({ ...documentInput({ clientIds: ["demo-client-aurora"] }) }, "legacy.pdf", "application/pdf", minimalPdf()) });
      assert.equal(badLegacyLinks.statusCode, 400); assert.equal(body(badLegacyLinks).error, "Metadados inválidos"); assert.ok(body(badLegacyLinks).details.some((issue: { path: unknown[] }) => issue.path.join(".").includes("clientIds")));
      const badType = await app.inject({ method: "POST", url: "/documents", ...multipart(documentInput(), "malware.exe", "application/octet-stream", Buffer.from("MZ")) }); assert.equal(badType.statusCode, 415);
      const oversized = await app.inject({ method: "POST", url: "/documents", ...multipart(documentInput(), "large.pdf", "application/pdf", minimalPdf(20 * 1024 * 1024 + 1)) }); assert.ok([413, 400].includes(oversized.statusCode));
      const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/pL8AAAAASUVORK5CYII=", "base64");
      const imageUpload = await app.inject({ method: "POST", url: "/documents", ...multipart({ ...documentInput(), name: `${prefix} image` }, "synthetic.png", "image/png", png) }); assert.equal(imageUpload.statusCode, 201); const image = body(imageUpload); ids.documents.push(image.id);
      const imagePreview = await jsonRequest("GET", `/documents/${image.id}/file?inline=true`); assert.equal(imagePreview.statusCode, 200); assert.equal(imagePreview.headers["content-type"], "image/png");
      const removed = await jsonRequest("DELETE", `/documents/${image.id}`); assert.equal(removed.statusCode, 204); ids.documents = ids.documents.filter((id) => id !== image.id); assert.equal((await jsonRequest("GET", `/documents/${image.id}`)).statusCode, 404);
      const removedPdf = await jsonRequest("DELETE", `/documents/${document.id}`); assert.equal(removedPdf.statusCode, 204); ids.documents = ids.documents.filter((id) => id !== document.id);

      const recoveryId = randomUUID(); await writeFile(join(runStorage, `${recoveryId}.upload`), Buffer.from("temporary")); await writeFile(join(runStorage, `${randomUUID()}`), Buffer.from("orphan synthetic"));
      const { reconcileStorage } = await import("../src/documents/storage.js"); await reconcileStorage();
      assert.ok(!(await readdir(runStorage)).some((name) => name.endsWith(".upload")));
      assert.ok((await readdir(runStorage)).some((name) => name.endsWith(".orphan")));
    });

    await t.test("Comunicação: canais, Socket.IO, persistência e reconexão", async () => {
      const channelResponse = await jsonRequest("POST", "/channels", { name: `${prefix} channel`, isPrivate: false }); assert.equal(channelResponse.statusCode, 201); const channel = body(channelResponse); ids.channels.push(channel.id);
      assert.equal((await jsonRequest("GET", "/channels")).statusCode, 200);
      assert.equal((await jsonRequest("GET", `/channels/${channel.id}/messages`)).statusCode, 200);
      const tenantBChannels = body(await sessionRequest("GET", "/channels", crossTenantCookie)) as unknown as Array<{ id: string }>;
      assert.ok(!tenantBChannels.some((item) => item.id === channel.id));
      assert.equal((await sessionRequest("GET", `/channels/${channel.id}/messages`, crossTenantCookie)).statusCode, 404);
      assert.equal((await jsonRequest("POST", "/channels", { name: "" })).statusCode, 400);
      const privateResponse = await jsonRequest("POST", "/channels", { name: `${prefix} private channel`, isPrivate: true }); assert.equal(privateResponse.statusCode, 201); const privateChannel = body(privateResponse); ids.channels.push(privateChannel.id);
      assert.ok((body(await jsonRequest("GET", "/channels")) as unknown as Array<{ id: string }>).some((item) => item.id === privateChannel.id));
      assert.ok(!(body(await sessionRequest("GET", "/channels", crossTenantCookie)) as unknown as Array<{ id: string }>).some((item) => item.id === privateChannel.id));
      const [sameOrganizationUser] = await db.insert(schema.users).values({ name: `${prefix} membro sem canal`, email: `${prefix}-channel-member@example.test`, emailVerifiedAt: new Date() }).returning();
      ids.users.push(sameOrganizationUser!.id);
      const [sameOrganizationMembership] = await db.insert(schema.organizationMemberships).values({ organizationId, userId: sameOrganizationUser!.id, role: "member" }).returning();
      ids.memberships.push(sameOrganizationMembership!.id);
      const sameOrgToken = createOpaqueToken();
      const [sameOrgSession] = await db.insert(schema.sessions).values({ userId: sameOrganizationUser!.id, organizationId, tokenHash: hashOpaqueToken(sameOrgToken), expiresAt: new Date(Date.now() + 60 * 60 * 1000) }).returning();
      ids.sessions.push(sameOrgSession!.id);
      const sameOrgCookie = sessionCookie(sameOrgToken, false).split(";")[0]!;
      assert.equal((await sessionRequest("GET", `/channels/${privateChannel.id}/messages`, sameOrgCookie)).statusCode, 404);
      assert.ok(!(body(await sessionRequest("GET", "/channels", sameOrgCookie)) as unknown as Array<{ id: string }>).some((item) => item.id === privateChannel.id));
      const host = Fastify(); const server = createServer(); const ioServer = await setupSocket(server, host.log);
      await new Promise<void>((resolveListen, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolveListen); });
      const address = server.address(); assert.ok(address && typeof address === "object");
      const spoofed = socketClient(`http://127.0.0.1:${address.port}`, { auth: { userId }, extraHeaders: { origin: "http://localhost:5173" }, transports: ["websocket"], reconnection: false });
      try { await new Promise<void>((resolveRejected, reject) => { spoofed.once("connect", () => reject(new Error("Socket não deveria confiar no userId recebido"))); spoofed.once("connect_error", () => resolveRejected()); setTimeout(() => reject(new Error("A conexão sem sessão não foi rejeitada")), 5000).unref(); }); }
      finally { spoofed.disconnect(); }
      const rejectedOriginSocket = socketClient(`http://127.0.0.1:${address.port}`, { extraHeaders: { cookie: authCookie.split(";")[0]!, origin: "https://not-allowed.example" }, transports: ["websocket"], reconnection: false });
      try { await new Promise<void>((resolveRejected, reject) => { rejectedOriginSocket.once("connect", () => reject(new Error("Socket aceitou origem não permitida"))); rejectedOriginSocket.once("connect_error", () => resolveRejected()); setTimeout(() => reject(new Error("Origem não autorizada não foi rejeitada")), 5000).unref(); }); }
      finally { rejectedOriginSocket.disconnect(); }
      const tenantBSocket = socketClient(`http://127.0.0.1:${address.port}`, { extraHeaders: { cookie: crossTenantCookie, origin: "http://localhost:5173" }, transports: ["websocket"], reconnection: false });
      try {
        await new Promise<void>((resolveConnect, reject) => { tenantBSocket.once("connect", () => resolveConnect()); tenantBSocket.once("connect_error", reject); setTimeout(() => reject(new Error("Tenant B socket connection timeout")), 5000).unref(); });
        const joinForeign = await new Promise<{ ok: boolean }>((resolveAck) => tenantBSocket.emit("channel:join", channel.id, resolveAck));
        assert.equal(joinForeign.ok, false, "membro de outra organização não deve entrar no canal");
      } finally { tenantBSocket.disconnect(); }
      const nonMemberSocket = socketClient(`http://127.0.0.1:${address.port}`, { extraHeaders: { cookie: sameOrgCookie, origin: "http://localhost:5173" }, transports: ["websocket"], reconnection: false });
      try {
        await new Promise<void>((resolveConnect, reject) => { nonMemberSocket.once("connect", () => resolveConnect()); nonMemberSocket.once("connect_error", reject); setTimeout(() => reject(new Error("Same-org member socket connection timeout")), 5000).unref(); });
        const deniedPrivateJoin = await new Promise<{ ok: boolean }>((resolveAck) => nonMemberSocket.emit("channel:join", privateChannel.id, resolveAck));
        assert.equal(deniedPrivateJoin.ok, false, "membro da organização sem membership não deve entrar no canal privado");
      } finally { nonMemberSocket.disconnect(); }
      const socket = socketClient(`http://127.0.0.1:${address.port}`, { extraHeaders: { cookie: authCookie.split(";")[0]!, origin: "http://localhost:5173" }, transports: ["websocket"], reconnection: false });
      try {
        await new Promise<void>((resolveConnect, reject) => { socket.once("connect", () => resolveConnect()); socket.once("connect_error", reject); setTimeout(() => reject(new Error("Socket.IO connection timeout")), 5000).unref(); });
        const join = () => new Promise<{ ok: boolean; error?: string }>((resolveAck) => socket.emit("channel:join", channel.id, resolveAck));
        assert.equal((await join()).ok, true);
        assert.equal((await new Promise<{ ok: boolean }>((resolveAck) => socket.emit("channel:join", privateChannel.id, resolveAck))).ok, true);
        const send = (content: string) => new Promise<{ ok: boolean; error?: string }>((resolveAck) => socket.emit("message:send", { channelId: channel.id, content }, resolveAck));
        const newMessage = new Promise<Record<string, unknown>>((resolveMessage) => socket.once("message:new", resolveMessage));
        assert.equal((await send("synthetic message before reconnect")).ok, true); assert.equal((await newMessage).content, "synthetic message before reconnect");
        socket.disconnect(); socket.connect(); await new Promise<void>((resolveConnect, reject) => { socket.once("connect", () => resolveConnect()); socket.once("connect_error", reject); setTimeout(() => reject(new Error("Socket.IO reconnect timeout")), 5000).unref(); });
        assert.equal((await join()).ok, true);
        const secondMessage = new Promise<Record<string, unknown>>((resolveMessage) => socket.once("message:new", resolveMessage));
        assert.equal((await send("synthetic message after reconnect")).ok, true); assert.equal((await secondMessage).content, "synthetic message after reconnect");
        const history = await jsonRequest("GET", `/channels/${channel.id}/messages?limit=10`); assert.equal(history.statusCode, 200); assert.equal((body(history) as unknown as unknown[]).length, 2);

        const switchedToken = createOpaqueToken();
        const [switchedSession] = await db.insert(schema.sessions).values({ userId, organizationId, tokenHash: hashOpaqueToken(switchedToken), expiresAt: new Date(Date.now() + 60 * 60 * 1000) }).returning();
        ids.sessions.push(switchedSession!.id);
        const switchedCookie = sessionCookie(switchedToken, false).split(";")[0]!;
        const switchedSocket = socketClient(`http://127.0.0.1:${address.port}`, { extraHeaders: { cookie: switchedCookie, origin: "http://localhost:5173" }, transports: ["websocket"], reconnection: false });
        try {
          await new Promise<void>((resolveConnect, reject) => { switchedSocket.once("connect", () => resolveConnect()); switchedSocket.once("connect_error", reject); setTimeout(() => reject(new Error("Socket de troca de organização não conectou")), 5000).unref(); });
          assert.equal((await new Promise<{ ok: boolean }>((resolveAck) => switchedSocket.emit("channel:join", channel.id, resolveAck))).ok, true);
          assert.equal(await revalidateSocketAuthorization(ioServer.sockets.sockets.get(switchedSocket.id!)!), true);
          await db.update(schema.sessions).set({ organizationId: organizationBId }).where(eq(schema.sessions.id, switchedSession!.id));
          const disconnected = new Promise<string>((resolveDisconnect) => switchedSocket.once("disconnect", resolveDisconnect));
          assert.equal(await revalidateSocketAuthorization(ioServer.sockets.sockets.get(switchedSocket.id!)!), false, "sessão alterada remotamente deve invalidar o contexto anterior");
          assert.equal(await disconnected, "io server disconnect");
        } finally { switchedSocket.disconnect(); }

        const logoutToken = createOpaqueToken();
        const [logoutSession] = await db.insert(schema.sessions).values({ userId, organizationId, tokenHash: hashOpaqueToken(logoutToken), expiresAt: new Date(Date.now() + 60 * 60 * 1000) }).returning();
        ids.sessions.push(logoutSession!.id);
        const logoutCookie = sessionCookie(logoutToken, false).split(";")[0]!;
        const logoutSocket = socketClient(`http://127.0.0.1:${address.port}`, { extraHeaders: { cookie: logoutCookie, origin: "http://localhost:5173" }, transports: ["websocket"], reconnection: false });
        try {
          await new Promise<void>((resolveConnect, reject) => { logoutSocket.once("connect", () => resolveConnect()); logoutSocket.once("connect_error", reject); setTimeout(() => reject(new Error("Logout socket connection timeout")), 5000).unref(); });
          const disconnected = new Promise<string>((resolveDisconnect) => logoutSocket.once("disconnect", resolveDisconnect));
          assert.equal((await sessionRequest("POST", "/auth/logout", logoutCookie)).statusCode, 204);
          assert.equal(await disconnected, "io server disconnect", "logout deve encerrar sockets associados à sessão imediatamente");
        } finally { logoutSocket.disconnect(); }

        const remoteHost = Fastify(); const remoteServer = createServer();
        await new Promise<void>((resolveListen, reject) => { remoteServer.once("error", reject); remoteServer.listen(0, "127.0.0.1", resolveListen); });
        const remoteIo = await setupSocket(remoteServer, remoteHost.log);
        const crossProcessToken = createOpaqueToken();
        const [crossProcessSession] = await db.insert(schema.sessions).values({ userId, organizationId, tokenHash: hashOpaqueToken(crossProcessToken), expiresAt: new Date(Date.now() + 60 * 60 * 1000) }).returning();
        ids.sessions.push(crossProcessSession!.id);
        const crossProcessCookie = sessionCookie(crossProcessToken, false).split(";")[0]!;
        const remoteSocket = socketClient(`http://127.0.0.1:${address.port}`, { extraHeaders: { cookie: crossProcessCookie, origin: "http://localhost:5173" }, transports: ["websocket"], reconnection: false });
        try {
          await new Promise<void>((resolveConnect, reject) => { remoteSocket.once("connect", () => resolveConnect()); remoteSocket.once("connect_error", reject); setTimeout(() => reject(new Error("Cross-process socket connection timeout")), 5000).unref(); });
          assert.equal((await new Promise<{ ok: boolean }>((resolveAck) => remoteSocket.emit("channel:join", channel.id, resolveAck))).ok, true);
          const remoteDisconnected = new Promise<string>((resolveDisconnect) => remoteSocket.once("disconnect", resolveDisconnect));
          assert.equal((await sessionRequest("POST", "/auth/logout", crossProcessCookie)).statusCode, 204);
          assert.equal(await remoteDisconnected, "io server disconnect", "NOTIFY deve revogar socket conectado a outra instância Socket.IO");
        } finally {
          remoteSocket.disconnect();
          await new Promise<void>((resolveClose) => remoteIo.close(() => resolveClose()));
          if (remoteServer.listening) await new Promise<void>((resolveClose) => remoteServer.close(() => resolveClose()));
          await remoteHost.close();
        }
      } finally {
        socket.disconnect(); await new Promise<void>((resolveClose) => ioServer.close(() => resolveClose()));
        if (server.listening) await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
        await host.close();
      }
    });
  } finally {
    await app.close();
    await db.transaction(async (tx) => {
      if (ids.sessions.length) await tx.delete(schema.sessions).where(inArray(schema.sessions.id, ids.sessions));
      await tx.delete(schema.authLoginLimits).where(inArray(schema.authLoginLimits.key, authRateLimitKeys));
      if (ids.organizations.length) {
        await tx.execute(sql`ALTER TABLE organization_audit_events DISABLE TRIGGER organization_audit_events_no_update_delete`);
        await tx.execute(sql`ALTER TABLE organization_audit_events DISABLE TRIGGER organization_audit_events_no_truncate`);
        await tx.delete(schema.organizationAuditEvents).where(inArray(schema.organizationAuditEvents.organizationId, ids.organizations));
        await tx.execute(sql`ALTER TABLE organization_audit_events ENABLE TRIGGER organization_audit_events_no_update_delete`);
        await tx.execute(sql`ALTER TABLE organization_audit_events ENABLE TRIGGER organization_audit_events_no_truncate`);
      }
      if (ids.memberships.length) await tx.delete(schema.organizationMemberships).where(inArray(schema.organizationMemberships.id, ids.memberships));
      if (ids.documents.length) {
        for (const table of [schema.documentClients, schema.documentEnterprises, schema.documentProcesses, schema.documentTasks, schema.documentOccurrences]) await tx.delete(table).where(inArray(table.documentId, ids.documents));
        await tx.delete(schema.documents).where(inArray(schema.documents.id, ids.documents));
      }
      if (ids.obligations.length) {
        const occurrences = await tx.select({ id: schema.obligationOccurrences.id }).from(schema.obligationOccurrences).where(inArray(schema.obligationOccurrences.obligationId, ids.obligations));
        const occurrenceIds = occurrences.map((item) => item.id);
        if (occurrenceIds.length) { await tx.delete(schema.obligationEvidence).where(inArray(schema.obligationEvidence.occurrenceId, occurrenceIds)); await tx.delete(schema.obligationOccurrences).where(inArray(schema.obligationOccurrences.id, occurrenceIds)); }
        await tx.delete(schema.obligations).where(inArray(schema.obligations.id, ids.obligations));
      }
      if (ids.tasks.length) await tx.delete(schema.tasks).where(inArray(schema.tasks.id, ids.tasks));
      if (ids.processes.length) await tx.delete(schema.processes).where(inArray(schema.processes.id, ids.processes));
      if (ids.enterprises.length) await tx.delete(schema.enterprises).where(inArray(schema.enterprises.id, ids.enterprises));
      if (ids.clients.length) await tx.delete(schema.clients).where(inArray(schema.clients.id, ids.clients));
      if (ids.channels.length) { await tx.delete(schema.messages).where(inArray(schema.messages.channelId, ids.channels)); await tx.delete(schema.channelMemberships).where(inArray(schema.channelMemberships.channelId, ids.channels)); await tx.delete(schema.channels).where(inArray(schema.channels.id, ids.channels)); }
      if (ids.users.length) await tx.delete(schema.users).where(inArray(schema.users.id, ids.users));
      if (ids.organizations.length) await tx.delete(schema.organizations).where(inArray(schema.organizations.id, ids.organizations));
    });
    const resolved = resolve(runStorage); const base = resolve(baseStorage);
    if (resolved.startsWith(base + sep) && resolved !== productionStorage) await rm(resolved, { recursive: true, force: true });
  }
});

await db.$client.end();
