import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, rmdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { and, eq } from "drizzle-orm";
import * as schema from "../src/db/schema.js";
import { installTenantContext, runWithOrganizationContext } from "../src/db/tenant-context.js";
import { hashPassword } from "../src/auth/crypto.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL ausente; teste de RLS interrompido.");
const parsedDatabaseUrl = new URL(databaseUrl);
if (parsedDatabaseUrl.pathname.replace(/^\//, "") !== "juris_connect_test" || !["localhost", "127.0.0.1"].includes(parsedDatabaseUrl.hostname)) {
  throw new Error("Teste de RLS recusado: somente localhost/juris_connect_test é permitido.");
}

const protectedTables = ["channel_memberships", "channels", "clients", "document_clients", "document_enterprises", "document_occurrences", "document_processes", "document_tasks", "documents", "enterprises", "messages", "obligation_evidence", "obligation_occurrences", "obligations", "organization_audit_events", "organization_memberships", "processes", "sessions", "tasks"];

test("RLS isola consultas, escritas, concorrência, rollback, documentos e canais com role restrita", async () => {
  const admin = new pg.Client({ connectionString: databaseUrl });
  await admin.connect();
  const suffix = randomBytes(8).toString("hex");
  const roleName = `jc_rls_${suffix}`;
  const password = randomBytes(32).toString("base64url");
  const loginPassword = "RlsTestOnlyPassword2026!";
  const userEmail = `rls-${suffix}@example.test`;
  const sessionToken = randomBytes(32).toString("base64url");
  const sessionHash = createHash("sha256").update(sessionToken).digest("hex");
  const roleIdentifier = `"${roleName}"`;
  const ids = { orgA: randomUUID(), orgB: randomUUID(), user: randomUUID(), clientA: randomUUID(), clientB: randomUUID(), enterpriseA: randomUUID(), channelA: randomUUID(), channelB: randomUUID(), messageA: randomUUID(), messageB: randomUUID(), documentA: randomUUID(), documentB: randomUUID(), membership: randomUUID(), session: randomUUID() };
  let tenantPool: pg.Pool | undefined;
  try {
    const currentRole = await admin.query<{ rolsuper: boolean; rolcreaterole: boolean }>("SELECT rolsuper, rolcreaterole FROM pg_roles WHERE rolname = current_user");
    assert.equal(currentRole.rows[0]?.rolcreaterole || currentRole.rows[0]?.rolsuper, true, "test database role must be allowed to provision a temporary restricted test role");

    await admin.query(`CREATE ROLE ${roleIdentifier} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`);
    await admin.query(`GRANT CONNECT ON DATABASE juris_connect_test TO ${roleIdentifier}`);
    await admin.query(`GRANT USAGE ON SCHEMA public TO ${roleIdentifier}`);
    await admin.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${roleIdentifier}`);
    await admin.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${roleIdentifier}`);
    await admin.query(`GRANT EXECUTE ON FUNCTION resolve_juris_session(text) TO ${roleIdentifier}`);

    await admin.query("INSERT INTO organizations (id,name,slug) VALUES ($1,$2,$3),($4,$5,$6)", [ids.orgA, `RLS A ${suffix}`, `rls-a-${suffix}`, ids.orgB, `RLS B ${suffix}`, `rls-b-${suffix}`]);
    await admin.query("INSERT INTO users (id,name,email,password_hash,email_verified_at) VALUES ($1,$2,$3,$4,now())", [ids.user, "RLS Synthetic User", userEmail, await hashPassword(loginPassword)]);
    await admin.query("INSERT INTO organization_memberships (id,organization_id,user_id,role) VALUES ($1,$2,$3,'owner')", [ids.membership, ids.orgA, ids.user]);
    await admin.query("INSERT INTO sessions (id,user_id,organization_id,token_hash,expires_at) VALUES ($1,$2,$3,$4,now()+interval '1 hour')", [ids.session, ids.user, ids.orgA, sessionHash]);
    await admin.query("INSERT INTO clients (id,name,kind,contact_name,email,phone,organization_id) VALUES ($1,'RLS client A','Empresa','Test','a@example.test','000',$3),($2,'RLS client B','Empresa','Test','b@example.test','000',$4)", [ids.clientA, ids.clientB, ids.orgA, ids.orgB]);
    await admin.query("INSERT INTO enterprises (id,client_id,name,type,activity,address,municipality,state,manager,organization_id) VALUES ($1,$2,'RLS enterprise A','Unit','Test','Road','City','SP','Test',$3)", [ids.enterpriseA, ids.clientA, ids.orgA]);
    await admin.query("INSERT INTO channels (id,name,organization_id,is_private) VALUES ($1,'RLS channel A',$3,false),($2,'RLS channel B',$4,false)", [ids.channelA, ids.channelB, ids.orgA, ids.orgB]);
    await admin.query("INSERT INTO messages (id,channel_id,author_id,content,organization_id) VALUES ($1,$3,$5,'A message',$6),($2,$4,$5,'B message',$7)", [ids.messageA, ids.messageB, ids.channelA, ids.channelB, ids.user, ids.orgA, ids.orgB]);
    await admin.query("INSERT INTO documents (id,name,original_name,extension,mime_type,size,category,responsible,status,organization_id) VALUES ($1,'A document','a.pdf','pdf','application/pdf',1,'Teste','Equipe','Pendente',$3),($2,'B document','b.pdf','pdf','application/pdf',1,'Teste','Equipe','Pendente',$4)", [ids.documentA, ids.documentB, ids.orgA, ids.orgB]);

    const restrictedUrl = new URL(databaseUrl);
    restrictedUrl.username = roleName;
    restrictedUrl.password = password;
    tenantPool = new pg.Pool({ connectionString: restrictedUrl.toString(), max: 8 });
    installTenantContext(tenantPool);
    const tenantDb = drizzle(tenantPool, { schema });
    const roleCheck = await tenantPool.query<{ rolsuper: boolean; rolbypassrls: boolean; rolcreaterole: boolean; owns_tables: boolean; rls_tables: number; tenant_policies: number; auth_policies: number }>(
      `SELECT r.rolsuper, r.rolbypassrls, r.rolcreaterole,
       EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY($1) AND pg_has_role(current_user,c.relowner,'USAGE')) AS owns_tables,
       (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY($1) AND c.relrowsecurity) AS rls_tables,
       (SELECT count(*)::int FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY($1) AND p.polname LIKE '%_tenant_isolation') AS tenant_policies,
       (SELECT count(*)::int FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('sessions','organization_memberships')) AS auth_policies
       FROM pg_roles r WHERE r.rolname=current_user`, [protectedTables]);
    const businessTenantPolicies = protectedTables.length - 2;
    assert.deepEqual(roleCheck.rows[0], { rolsuper: false, rolbypassrls: false, rolcreaterole: false, owns_tables: false, rls_tables: protectedTables.length, tenant_policies: businessTenantPolicies, auth_policies: 4 });

    const noTenant = await tenantPool.query("SELECT id FROM clients");
    assert.deepEqual(noTenant.rows, [], "absence of tenant must deny SELECT");
    await assert.rejects(() => tenantPool!.query("INSERT INTO clients (name,kind,contact_name,email,phone,organization_id) VALUES ('No tenant','Empresa','Test','none@example.test','000',$1)", [ids.orgA]), "absence of tenant must deny INSERT");
    assert.deepEqual((await tenantPool.query("SELECT id FROM sessions")).rows, [], "session table must deny SELECT without user or tenant context");
    assert.deepEqual((await tenantPool.query("SELECT id FROM organization_memberships")).rows, [], "membership table must deny SELECT without user or tenant context");
    const resolved = await tenantPool.query("SELECT * FROM resolve_juris_session($1)", [sessionHash]);
    assert.equal(resolved.rows[0]?.session_id, ids.session, "SECURITY DEFINER resolver must return only the supplied valid session");
    const contextValues = await runWithOrganizationContext(ids.orgB, () => tenantPool!.query("SELECT current_setting('app.organization_id', true) AS organization_id, current_setting('app.user_id', true) AS user_id"), ids.user);
    assert.deepEqual(contextValues.rows[0], { organization_id: ids.orgB, user_id: ids.user }, "both tenant and user GUCs must be local to the query transaction");
    const ownMemberships = await runWithOrganizationContext(ids.orgB, () => tenantPool!.query("SELECT id FROM organization_memberships WHERE user_id=$1", [ids.user]), ids.user);
    assert.deepEqual(ownMemberships.rows.map((row) => row.id), [ids.membership], "authenticated user may list their own organization associations");

    const rowsA = await runWithOrganizationContext(ids.orgA, async () => await tenantDb.select().from(schema.clients));
    const rowsB = await runWithOrganizationContext(ids.orgB, async () => await tenantDb.select().from(schema.clients));
    assert.deepEqual(rowsA.map((row) => row.id), [ids.clientA]);
    assert.deepEqual(rowsB.map((row) => row.id), [ids.clientB]);
    const insertedClient = await runWithOrganizationContext(ids.orgA, async () => await tenantDb.insert(schema.clients).values({ name: "RLS allowed insert", kind: "Empresa", contactName: "Test", email: `insert-${suffix}@example.test`, phone: "000", organizationId: ids.orgA }).returning());
    assert.equal(insertedClient[0]?.organizationId, ids.orgA, "INSERT in the active tenant must succeed");
    const updatedClient = await runWithOrganizationContext(ids.orgA, async () => await tenantDb.update(schema.clients).set({ name: "RLS allowed update" }).where(eq(schema.clients.id, ids.clientA)).returning());
    assert.equal(updatedClient[0]?.name, "RLS allowed update", "UPDATE in the active tenant must succeed");
    assert.equal((await runWithOrganizationContext(ids.orgA, async () => await tenantDb.delete(schema.clients).where(eq(schema.clients.id, insertedClient[0]!.id)).returning())).length, 1, "DELETE in the active tenant must succeed");
    assert.deepEqual(await runWithOrganizationContext(ids.orgA, async () => await tenantDb.update(schema.clients).set({ name: "tamper" }).where(eq(schema.clients.id, ids.clientB)).returning()), []);
    assert.deepEqual(await runWithOrganizationContext(ids.orgA, async () => await tenantDb.delete(schema.clients).where(eq(schema.clients.id, ids.clientB)).returning()), []);
    await assert.rejects(() => runWithOrganizationContext(ids.orgA, async () => await tenantDb.insert(schema.enterprises).values({ id: randomUUID(), clientId: ids.clientB, name: "Cross tenant", type: "Unit", activity: "Test", address: "Test", municipality: "Test", state: "SP", manager: "Test", organizationId: ids.orgA }).returning()));

    const docsA = await runWithOrganizationContext(ids.orgA, async () => await tenantDb.select().from(schema.documents));
    assert.deepEqual(docsA.map((row) => row.id), [ids.documentA], "documents must be tenant isolated");
    const channelsA = await runWithOrganizationContext(ids.orgA, async () => await tenantDb.select().from(schema.channels));
    assert.deepEqual(channelsA.map((row) => row.id), [ids.channelA], "communication channels must be tenant isolated");
    const messagesA = await runWithOrganizationContext(ids.orgA, async () => await tenantDb.select().from(schema.messages));
    assert.deepEqual(messagesA.map((row) => row.id), [ids.messageA], "communication messages must be tenant isolated");

    process.env.DATABASE_URL = restrictedUrl.toString();
    process.env.CORS_ORIGINS = "http://localhost:5173";
    process.env.AUTH_RATE_LIMIT_SECRET = randomBytes(32).toString("hex");
    process.env.DOCUMENT_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    const isolatedStorage = join(process.cwd(), ".data", `tenant-rls-test-${suffix}`);
    const documentFile = join(isolatedStorage, ids.documentA);
    await mkdir(isolatedStorage, { recursive: false });
    await writeFile(documentFile, Buffer.from("RLS synthetic document marker"), { flag: "wx" });
    process.env.DOCUMENT_STORAGE_PATH = isolatedStorage;
    process.env.NODE_ENV = "production";
    const [{ buildApp }, { db: runtimeDb }] = await Promise.all([import("../src/app.js"), import("../src/db/index.js")]);
    const app = await buildApp({ socket: false });
    try {
      const response = await app.inject({ method: "GET", url: "/clients", headers: { cookie: `juris_connect_session=${sessionToken}`, origin: "http://localhost:5173" } });
      assert.equal(response.statusCode, 200, `runtime role request failed: ${response.body}`);
      assert.deepEqual((response.json() as Array<{ id: string }>).map((row) => row.id), [ids.clientA], "Fastify authentication context must reach the PostgreSQL RLS query");
      const apiCookie = { cookie: `juris_connect_session=${sessionToken}`, origin: "http://localhost:5173" };
      const apiChannels = await app.inject({ method: "GET", url: "/channels", headers: apiCookie });
      assert.deepEqual((apiChannels.json() as Array<{ id: string }>).map((row) => row.id), [ids.channelA], "Communication API must expose only current-tenant channels");
      const apiMessages = await app.inject({ method: "GET", url: `/channels/${ids.channelA}/messages`, headers: apiCookie });
      assert.deepEqual((apiMessages.json() as Array<{ id: string }>).map((row) => row.id), [ids.messageA], "Communication history must expose only current-tenant messages");
      const apiDocuments = await app.inject({ method: "GET", url: "/documents", headers: apiCookie });
      assert.deepEqual((apiDocuments.json() as Array<{ id: string }>).map((row) => row.id), [ids.documentA], "Document API must expose only current-tenant records");
      assert.equal((await readFile(documentFile)).toString(), "RLS synthetic document marker", "startup reconciliation must not classify other tenants' document files as orphans");
      const login = await app.inject({ method: "POST", url: "/auth/login", headers: { origin: "http://localhost:5173" }, payload: { email: userEmail, password: loginPassword } });
      assert.equal(login.statusCode, 200, `restricted-role login failed: ${login.body}`);
      const loginCookie = String(login.headers["set-cookie"]).split(";")[0]!;
      assert.equal((await app.inject({ method: "GET", url: "/auth/me", headers: { cookie: loginCookie, origin: "http://localhost:5173" } })).statusCode, 200, "login must read own membership and create a session under RLS");
      const unauthenticated = await app.inject({ method: "GET", url: "/clients", headers: { origin: "http://localhost:5173" } });
      assert.equal(unauthenticated.statusCode, 401, "request without tenant session must not reach protected data");
    } finally {
      await app.close();
      await (runtimeDb.$client as pg.Pool).end();
      await unlink(documentFile);
      await rmdir(isolatedStorage);
    }

    const concurrent = await Promise.all([
      runWithOrganizationContext(ids.orgA, async () => { await new Promise((resolve) => setTimeout(resolve, 10)); return (await tenantDb.select({ id: schema.clients.id }).from(schema.clients)).map((row) => row.id); }),
      runWithOrganizationContext(ids.orgB, async () => { await new Promise((resolve) => setTimeout(resolve, 2)); return (await tenantDb.select({ id: schema.clients.id }).from(schema.clients)).map((row) => row.id); }),
    ]);
    assert.deepEqual(concurrent, [[ids.clientA], [ids.clientB]], "concurrent tenant contexts must not cross on pooled connections");

    await assert.rejects(() => runWithOrganizationContext(ids.orgA, () => tenantDb.transaction(async (tx) => {
      assert.deepEqual((await tx.select({ id: schema.clients.id }).from(schema.clients)).map((row) => row.id), [ids.clientA]);
      throw new Error("intentional RLS rollback");
    })), /intentional RLS rollback/);
    assert.deepEqual((await tenantPool.query("SELECT id FROM clients")).rows, [], "rollback and context exit must not leave tenant state on a reused connection");
    assert.deepEqual((await runWithOrganizationContext(ids.orgB, async () => await tenantDb.select({ id: schema.clients.id }).from(schema.clients))).map((row) => row.id), [ids.clientB]);
    await runWithOrganizationContext(ids.orgA, async () => await tenantDb.transaction(async (tx) => {
      await tx.select({ id: schema.clients.id }).from(schema.clients);
      await assert.rejects(() => tx.transaction(async (nested) => {
        assert.deepEqual((await nested.select({ id: schema.clients.id }).from(schema.clients)).map((row) => row.id), [ids.clientA]);
        throw new Error("intentional nested rollback");
      }), /intentional nested rollback/);
      assert.deepEqual((await tx.select({ id: schema.clients.id }).from(schema.clients)).map((row) => row.id), [ids.clientA], "nested rollback must retain parent tenant context");
    }));
  } finally {
    await tenantPool?.end();
    await admin.query("DELETE FROM messages WHERE id = ANY($1::uuid[])", [[ids.messageA, ids.messageB]]);
    await admin.query("DELETE FROM channels WHERE id = ANY($1::uuid[])", [[ids.channelA, ids.channelB]]);
    await admin.query("DELETE FROM documents WHERE id = ANY($1::uuid[])", [[ids.documentA, ids.documentB]]);
    await admin.query("DELETE FROM enterprises WHERE id = $1", [ids.enterpriseA]);
    await admin.query("DELETE FROM clients WHERE id = ANY($1::uuid[])", [[ids.clientA, ids.clientB]]);
    await admin.query("DELETE FROM sessions WHERE user_id = $1", [ids.user]);
    await admin.query("DELETE FROM organization_memberships WHERE id = $1", [ids.membership]);
    await admin.query("DELETE FROM users WHERE id = $1", [ids.user]);
    await admin.query("DELETE FROM organizations WHERE id = ANY($1::uuid[])", [[ids.orgA, ids.orgB]]);
    await admin.query(`DROP OWNED BY ${roleIdentifier}`);
    await admin.query(`DROP ROLE IF EXISTS ${roleIdentifier}`);
    await admin.end();
  }
});
