import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { resolve, sep } from "node:path";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("Seed demonstrativo interrompido: DATABASE_URL ausente.");
const parsed = new URL(databaseUrl);
if (parsed.pathname.replace(/^\//, "") !== "juris_connect_test" || !["localhost", "127.0.0.1"].includes(parsed.hostname)) {
  throw new Error("Seed demonstrativo interrompido: use somente localhost/juris_connect_test.");
}
const storage = process.env.DOCUMENT_STORAGE_PATH;
if (!storage) throw new Error("Seed demonstrativo interrompido: DOCUMENT_STORAGE_PATH isolado ausente.");
const storageRoot = resolve(storage);
const productionStorage = resolve(".data", "documents");
if (storageRoot === productionStorage || storageRoot.startsWith(productionStorage + sep)) throw new Error("Seed demonstrativo interrompido: armazenamento coincide com o diretório principal.");
process.env.APP_ENV = "test";
process.env.DOCUMENT_STORAGE_PATH = storageRoot;
await mkdir(storageRoot, { recursive: true });

const [{ db }, schema, { eq, and, like }, { buildApp }] = await Promise.all([
  import("./index.js"), import("./schema.js"), import("drizzle-orm"), import("../app.js"),
]);
const { createOpaqueToken, hashOpaqueToken, hashPassword } = await import("../auth/crypto.js");
const { sessionCookie } = await import("../auth/sessions.js");
const { clients, enterprises, processes, tasks, obligations, obligationOccurrences, obligationEvidence, users, channels, messages, organizations, organizationMemberships, sessions } = schema;
const marker = "MVP Demonstração ·";
const demoEmail = "mvp-demo-user@juris-connect.test";
const [demoUser] = await db.insert(users).values({ name: "Usuário Sintético de Demonstração", email: demoEmail, passwordHash: await hashPassword("TestPasswordOnlyForJurisConnect2026!"), emailVerifiedAt: new Date() }).onConflictDoUpdate({ target: users.email, set: { name: "Usuário Sintético de Demonstração", passwordHash: await hashPassword("TestPasswordOnlyForJurisConnect2026!"), emailVerifiedAt: new Date() } }).returning();
const [demoOrganization] = await db.insert(organizations).values({ name: "Escritório demonstrativo Juris Connect", slug: "juris-connect-mvp-demo" }).onConflictDoUpdate({ target: organizations.slug, set: { name: "Escritório demonstrativo Juris Connect", updatedAt: new Date() } }).returning();
await db.insert(organizationMemberships).values({ organizationId: demoOrganization!.id, userId: demoUser!.id, role: "owner" }).onConflictDoUpdate({ target: [organizationMemberships.organizationId, organizationMemberships.userId], set: { role: "owner" } });
const demoTeammateEmail = "mvp-demo-teammate@juris-connect.test";
const [demoTeammate] = await db.insert(users).values({ name: "Pessoa Sintética da Equipe", email: demoTeammateEmail, passwordHash: await hashPassword("TestPasswordOnlyForJurisConnect2026!"), emailVerifiedAt: new Date() }).onConflictDoUpdate({ target: users.email, set: { name: "Pessoa Sintética da Equipe", passwordHash: await hashPassword("TestPasswordOnlyForJurisConnect2026!"), emailVerifiedAt: new Date() } }).returning();
await db.delete(organizationMemberships).where(and(eq(organizationMemberships.organizationId, demoOrganization!.id), eq(organizationMemberships.userId, demoTeammate!.id)));
await db.delete(sessions).where(eq(sessions.userId, demoUser!.id));
const demoSessionToken = createOpaqueToken();
await db.insert(sessions).values({ userId: demoUser!.id, organizationId: demoOrganization!.id, tokenHash: hashOpaqueToken(demoSessionToken), expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000) });
const demoCookie = sessionCookie(demoSessionToken, false);
const today = new Date();
const date = (offset: number) => { const value = new Date(today); value.setDate(value.getDate() + offset); return value.toISOString().slice(0, 10); };
const actor = demoUser!.id;
const freshHistory = (message: string) => [{ id: randomUUID(), date: new Date().toISOString(), message, actorId: actor }];
const freshTaskHistory = (message: string) => [{ id: randomUUID(), date: new Date().toISOString(), type: "created" as const, message, actorId: actor }];
const clientSeed = [
  { email: "mvp-demo-aurora@juris-connect.test", name: `${marker} Residencial Aurora`, contactName: "Mariana Costa", kind: "Condomínio" },
  { email: "mvp-demo-horizonte@juris-connect.test", name: `${marker} Grupo Horizonte`, contactName: "Rafael Lima", kind: "Empresa" },
];
const clientRows = [];
for (const item of clientSeed) {
  const [existing] = await db.select().from(clients).where(eq(clients.email, item.email)).limit(1);
  const input = { ...item, organizationId: demoOrganization!.id, document: "", phone: "(11) 3000-4000", address: "São Paulo, SP", notes: "Registro sintético do cenário reproduzível de demonstração.", status: "active" };
  const [row] = existing
    ? await db.update(clients).set({ ...input, updatedAt: new Date() }).where(eq(clients.id, existing.id)).returning()
    : await db.insert(clients).values(input).returning();
  clientRows.push(row!);
}

const enterpriseSeed = [
  { clientId: clientRows[0]!.id, name: `${marker} Residencial Aurora - Unidade Centro`, municipality: "São Paulo", state: "SP", activity: "Gestão de licenças condominiais" },
  { clientId: clientRows[1]!.id, name: `${marker} Parque Horizonte`, municipality: "Campinas", state: "SP", activity: "Operação industrial e ambiental" },
];
const enterpriseRows = [];
for (const item of enterpriseSeed) {
    const [existing] = await db.select().from(enterprises).where(and(eq(enterprises.organizationId, demoOrganization!.id), eq(enterprises.clientId, item.clientId), eq(enterprises.name, item.name))).limit(1);
  if (existing) {
    const [row] = await db.update(enterprises).set({ ...item, organizationId: demoOrganization!.id, type: "Empreendimento demonstrativo", document: "", address: "Endereço sintético", manager: "Equipe Juris Connect", description: "Cenário de demonstração isolado em juris_connect_test.", status: "active", updatedAt: new Date() }).where(eq(enterprises.id, existing.id)).returning();
    enterpriseRows.push(row!);
  } else {
    const [row] = await db.insert(enterprises).values({ ...item, organizationId: demoOrganization!.id, type: "Empreendimento demonstrativo", document: "", address: "Endereço sintético", manager: "Equipe Juris Connect", description: "Cenário de demonstração isolado em juris_connect_test.", status: "active", relatedCases: 0 }).returning();
    enterpriseRows.push(row!);
  }
}

const processSeed = [
  { enterpriseId: enterpriseRows[0]!.id, name: `${marker} Renovação da licença de operação`, protocol: "MVP-DEMO-AURORA-001", processType: "Renovação de licença", entity: "Secretaria Municipal do Verde", manager: "Mariana Costa", status: "Em andamento", stage: "Em análise", dueDate: date(12), priority: "Alta" },
  { enterpriseId: enterpriseRows[1]!.id, name: `${marker} Relatório de monitoramento ambiental`, protocol: "MVP-DEMO-HORIZONTE-001", processType: "Licenciamento ambiental", entity: "CETESB", manager: "Rafael Lima", status: "Aguardando cliente", stage: "Documentação", dueDate: date(18), priority: "Média" },
];
const processRows = [];
for (const item of processSeed) {
  const [existing] = await db.select().from(processes).where(and(eq(processes.organizationId, demoOrganization!.id), eq(processes.protocol, item.protocol))).limit(1);
  if (existing) {
    const [row] = await db.update(processes).set({ ...item, organizationId: demoOrganization!.id, description: "Ciclo sintético para demonstrar vínculo entre cliente, empreendimento, processo e prazo.", startDate: date(-30), history: existing.history.length ? existing.history : [{ id: randomUUID(), date: new Date().toISOString(), type: "created", message: "Processo sintético preparado para demonstração." }], updatedAt: new Date() }).where(eq(processes.id, existing.id)).returning();
    processRows.push(row!);
  } else {
    const [row] = await db.insert(processes).values({ ...item, organizationId: demoOrganization!.id, description: "Ciclo sintético para demonstrar vínculo entre cliente, empreendimento, processo e prazo.", startDate: date(-30), history: [{ id: randomUUID(), date: new Date().toISOString(), type: "created", message: "Processo sintético preparado para demonstração." }] }).returning();
    processRows.push(row!);
  }
}

const taskSeed = [
  { processId: processRows[0]!.id, title: `${marker} Revisar documentos da renovação`, status: "Em andamento", dueDate: date(5), assigneeId: "demo-team-lucas" },
  { processId: processRows[1]!.id, title: `${marker} Solicitar laudos ao cliente`, status: "Aguardando cliente", dueDate: date(8), assigneeId: "demo-team-lucas" },
];
for (const item of taskSeed) {
  const [existing] = await db.select().from(tasks).where(and(eq(tasks.organizationId, demoOrganization!.id), eq(tasks.processId, item.processId), eq(tasks.title, item.title))).limit(1);
  if (existing) await db.update(tasks).set({ ...item, organizationId: demoOrganization!.id, description: "Tarefa sintética vinculada ao processo do cenário demonstrativo.", priority: "Alta", startDate: date(-2), subtasks: [{ id: "demo-docs", title: "Conferir documentação", completed: item.status !== "Em andamento" }], history: existing.history.length ? existing.history : freshTaskHistory("Tarefa sintética preparada para demonstração."), updatedAt: new Date() }).where(eq(tasks.id, existing.id));
  else await db.insert(tasks).values({ ...item, organizationId: demoOrganization!.id, description: "Tarefa sintética vinculada ao processo do cenário demonstrativo.", priority: "Alta", startDate: date(-2), subtasks: [{ id: "demo-docs", title: "Conferir documentação", completed: false }], history: freshTaskHistory("Tarefa sintética preparada para demonstração."), transfers: [], waitPeriods: [] });
}

const obligationSeed = [
  { processId: processRows[0]!.id, reference: "MVP-DEMO-OBR-AURORA", title: `${marker} Comprovar destinação de resíduos`, firstDueDate: date(9), periodicity: "Mensal", authority: "Secretaria Municipal do Verde" },
  { processId: processRows[1]!.id, reference: "MVP-DEMO-OBR-HORIZONTE", title: `${marker} Entregar relatório de emissões`, firstDueDate: date(15), periodicity: "Trimestral", authority: "CETESB" },
];
const obligationRows = [];
for (const item of obligationSeed) {
  const [existing] = await db.select().from(obligations).where(and(eq(obligations.organizationId, demoOrganization!.id), eq(obligations.reference, item.reference))).limit(1);
  const input = { ...item, description: "Obrigação sintética para demonstrar vencimento, evidência e relacionamento com processo.", responsibleId: actor, requirements: "Apresentar relatório e comprovante do período.", expectedEvidence: "Relatório técnico em PDF", status: "active" };
  const [row] = existing
    ? await db.update(obligations).set({ ...input, organizationId: demoOrganization!.id, updatedAt: new Date() }).where(eq(obligations.id, existing.id)).returning()
    : await db.insert(obligations).values({ ...input, organizationId: demoOrganization!.id, history: freshHistory("Condicionante sintética preparada para demonstração.") }).returning();
  obligationRows.push(row!);
  const period = item.firstDueDate.slice(0, 7);
  const [occurrence] = await db.select().from(obligationOccurrences).where(and(eq(obligationOccurrences.organizationId, demoOrganization!.id), eq(obligationOccurrences.obligationId, row!.id), eq(obligationOccurrences.referencePeriod, period))).limit(1);
  let occurrenceId = occurrence?.id;
  if (occurrence) await db.update(obligationOccurrences).set({ organizationId: demoOrganization!.id, dueDate: item.firstDueDate, status: "Em preparação", responsibleId: actor, observations: "Ocorrência sintética para apresentação.", updatedAt: new Date() }).where(eq(obligationOccurrences.id, occurrence.id));
  else {
    const [created] = await db.insert(obligationOccurrences).values({ organizationId: demoOrganization!.id, obligationId: row!.id, referencePeriod: period, dueDate: item.firstDueDate, status: "Em preparação", responsibleId: actor, observations: "Ocorrência sintética para apresentação.", history: freshHistory("Ocorrência preparada para demonstração.") }).returning();
    occurrenceId = created!.id;
  }
  const [evidence] = await db.select().from(obligationEvidence).where(and(eq(obligationEvidence.organizationId, demoOrganization!.id), eq(obligationEvidence.occurrenceId, occurrenceId!), eq(obligationEvidence.name, `${marker} Comprovante de destinação`))).limit(1);
  if (!evidence) await db.insert(obligationEvidence).values({ organizationId: demoOrganization!.id, occurrenceId: occurrenceId!, name: `${marker} Comprovante de destinação`, description: "Arquivo sintético relacionado ao ciclo demonstrativo.", deliveredAt: date(-1), notes: "Evidência de teste; sem valor comprobatório real." });
}

const channelName = "mvp-demo-geral";
const [channel] = await db.insert(channels).values({ name: channelName, organizationId: demoOrganization!.id, isPrivate: false }).onConflictDoNothing({ target: [channels.organizationId, channels.name] }).returning();
const [demoChannel] = channel ? [channel] : await db.select().from(channels).where(and(eq(channels.organizationId, demoOrganization!.id), eq(channels.name, channelName))).limit(1);
await db.update(messages).set({ organizationId: demoOrganization!.id }).where(eq(messages.channelId, demoChannel!.id));
await db.delete(messages).where(and(eq(messages.channelId, demoChannel!.id), like(messages.content, "Mensagem de teste %")));
await db.delete(messages).where(and(eq(messages.channelId, demoChannel!.id), like(messages.content, "Teste de transmissão em tempo real %")));
for (const content of ["Cenário de demonstração isolado: revisão da licença Aurora em andamento.", "O relatório do Parque Horizonte aguarda os laudos do cliente.", "Os prazos e documentos deste ambiente são sintéticos."]) {
  const [found] = await db.select().from(messages).where(and(eq(messages.channelId, demoChannel!.id), eq(messages.content, content))).limit(1);
  if (!found) await db.insert(messages).values({ channelId: demoChannel!.id, authorId: demoUser!.id, organizationId: demoOrganization!.id, content });
}

const app = await buildApp({ socket: false });
await app.ready();
try {
  const boundary = `----juris-demo-${randomUUID()}`;
  const pdf = Buffer.from("%PDF-1.4\nSynthetic Juris Connect MVP demonstration file.\n%%EOF\n");
  const [demoTask] = await db.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.organizationId, demoOrganization!.id), eq(tasks.title, taskSeed[0]!.title))).limit(1);
  const [demoOccurrence] = await db.select({ id: obligationOccurrences.id }).from(obligationOccurrences).where(and(eq(obligationOccurrences.organizationId, demoOrganization!.id), eq(obligationOccurrences.obligationId, obligationRows[0]!.id))).limit(1);
  const metadata = { legacyImportId: "juris-connect-mvp-demo-license-v1", name: `${marker} Licença e protocolo`, description: "PDF de exemplo sem validade jurídica, criado apenas no ambiente juris_connect_test.", category: "Licenças e autorizações", responsible: "Equipe Juris Connect", status: "Aprovado", links: { clientIds: [clientRows[0]!.id], enterpriseIds: [enterpriseRows[0]!.id], processIds: [processRows[0]!.id], taskIds: demoTask ? [demoTask.id] : [], occurrences: demoOccurrence ? [{ obligationId: obligationRows[0]!.id, occurrenceId: demoOccurrence.id }] : [] } };
  const payload = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="metadata"\r\n\r\n${JSON.stringify(metadata)}\r\n`), Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="licenca-demonstrativa.pdf"\r\nContent-Type: application/pdf\r\n\r\n`), pdf, Buffer.from(`\r\n--${boundary}--\r\n`)]);
  const response = await app.inject({ method: "POST", url: "/documents", headers: { "content-type": `multipart/form-data; boundary=${boundary}`, cookie: demoCookie, origin: "http://127.0.0.1:5174" }, payload });
  if (response.statusCode !== 201 && response.statusCode !== 200) throw new Error(`Falha ao preparar arquivo demonstrativo (HTTP ${response.statusCode}): ${response.body}`);
} finally {
  await app.close();
  await db.$client.end();
}
console.log("Cenário MVP criado somente em localhost/juris_connect_test.");
console.log(`Usuário e organização sintéticos preparados: ${demoUser!.email} · ${demoOrganization!.name}`);
console.log(`DEMO_SESSION_TOKEN=${demoSessionToken}`);
console.log(`Canais: ${channelName}; arquivo salvo em armazenamento isolado: ${storageRoot}`);
