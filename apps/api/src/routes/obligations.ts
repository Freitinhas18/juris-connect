import type { FastifyInstance } from "fastify";
import { and, asc, eq } from "drizzle-orm";
import { createObligationEvidenceSchema, createObligationSchema, idParamSchema, obligationInputSchema, occurrenceInputSchema } from "@juris-connect/shared";
import { db } from "../db/index.js";
import { obligationEvidence, obligationOccurrences, obligations, processes } from "../db/schema.js";
import { requireAuth } from "../auth/context.js";

function code(error: unknown): string | undefined { const value = error as { code?: string; cause?: { code?: string } }; return value?.code ?? value?.cause?.code; }
function history(message: string, actorId: string) { return { id: crypto.randomUUID(), date: new Date().toISOString(), message, actorId }; }
function occurrenceHistory(message: string, actorId: string, extra: Record<string, unknown> = {}) { return { ...history(message, actorId), ...extra }; }
function periodReference(date: string, periodicity: string) {
  const [year, month, day] = date.split("-").map(Number);
  if (periodicity === "Mensal") return `${year}-${String(month).padStart(2, "0")}`;
  if (periodicity === "Trimestral") return `${year}-T${Math.ceil(month / 3)}`;
  if (periodicity === "Semestral") return `${year}-S${month <= 6 ? 1 : 2}`;
  if (periodicity === "Anual") return String(year);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
async function hydrate(query: typeof db, rows: typeof obligations.$inferSelect[]) {
  const result = [];
  for (const row of rows) {
    const occurrenceRows = await query.select().from(obligationOccurrences).where(and(eq(obligationOccurrences.obligationId, row.id), eq(obligationOccurrences.organizationId, row.organizationId!))).orderBy(asc(obligationOccurrences.dueDate));
    const occurrences = [];
    for (const occurrence of occurrenceRows) {
      const evidence = await query.select().from(obligationEvidence).where(and(eq(obligationEvidence.occurrenceId, occurrence.id), eq(obligationEvidence.organizationId, row.organizationId!))).orderBy(asc(obligationEvidence.deliveredAt));
      const { createdAt: _createdAt, updatedAt: _updatedAt, ...entry } = occurrence;
      occurrences.push({ ...entry, completedAt: occurrence.completedAt?.toISOString() ?? null, evidence });
    }
    result.push({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), occurrences });
  }
  return result;
}
async function findOne(id: string, organizationId: string) { const [row] = await db.select().from(obligations).where(and(eq(obligations.id, id), eq(obligations.organizationId, organizationId))).limit(1); return row ? (await hydrate(db, [row]))[0] : undefined; }

export async function obligationRoutes(app: FastifyInstance) {
  app.get("/obligations", async (request) => {
    const { organizationId } = requireAuth(request);
    return hydrate(db, await db.select().from(obligations).where(eq(obligations.organizationId, organizationId)).orderBy(asc(obligations.firstDueDate), asc(obligations.title)));
  });
  app.get("/obligations/:id", async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: "ID de condicionante inválido" });
    const { organizationId } = requireAuth(request);
    const record = await findOne(params.data.id, organizationId);
    if (!record) return reply.status(404).send({ error: "Condicionante não encontrada" });
    return record;
  });
  app.post("/obligations", async (request, reply) => {
    const body = createObligationSchema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: "Dados inválidos", details: body.error.issues });
    const { organizationId, userId } = requireAuth(request);
    const [process] = await db.select({ id: processes.id }).from(processes).where(and(eq(processes.id, body.data.processId), eq(processes.organizationId, organizationId))).limit(1);
    if (!process) return reply.status(400).send({ error: "Processo vinculado não encontrado" });
    const { id, createdAt, history: historyEntries, occurrences, ...input } = body.data;
    const now = new Date();
    const initialOccurrences = occurrences ?? [{ id: undefined, referencePeriod: periodReference(input.firstDueDate, input.periodicity), dueDate: input.firstDueDate, status: "Programada" as const, responsibleId: input.responsibleId, completedAt: null, observations: "", history: [occurrenceHistory(`Primeira ocorrência programada para ${input.firstDueDate}.`, userId)], evidence: [] }];
    try {
      const createdId = await db.transaction(async (tx) => {
        const [parent] = await tx.insert(obligations).values({ ...input, organizationId, ...(id ? { id } : {}), ...(createdAt ? { createdAt: new Date(createdAt) } : {}), history: historyEntries?.length ? historyEntries : [history("Condicionante cadastrada no PostgreSQL.", userId)] }).returning({ id: obligations.id });
        for (const item of initialOccurrences) {
          const { id: occurrenceId, evidence, ...occurrence } = item;
          const [inserted] = await tx.insert(obligationOccurrences).values({ ...occurrence, organizationId, ...(occurrenceId ? { id: occurrenceId } : {}), obligationId: parent.id, completedAt: occurrence.completedAt ? new Date(occurrence.completedAt) : null }).returning({ id: obligationOccurrences.id });
          if (evidence.length) await tx.insert(obligationEvidence).values(evidence.map(({ id: evidenceId, ...entry }) => ({ ...entry, organizationId, ...(evidenceId ? { id: evidenceId } : {}), occurrenceId: inserted.id })));
        }
        return parent.id;
      });
      return reply.status(201).send(await findOne(createdId, organizationId));
    } catch (error) {
      if (code(error) === "23503") return reply.status(400).send({ error: "Processo ou ocorrência relacionada não encontrada" });
      if (code(error) === "23505") return reply.status(409).send({ error: "Já existe uma ocorrência para esse período" });
      throw error;
    }
  });
  app.put("/obligations/:id", async (request, reply) => {
    const params = idParamSchema.safeParse(request.params); const body = obligationInputSchema.safeParse(request.body);
    if (!params.success) return reply.status(400).send({ error: "ID de condicionante inválido" });
    if (!body.success) return reply.status(400).send({ error: "Dados inválidos", details: body.error.issues });
    const { organizationId, userId } = requireAuth(request);
    const [current] = await db.select().from(obligations).where(and(eq(obligations.id, params.data.id), eq(obligations.organizationId, organizationId))).limit(1);
    if (!current) return reply.status(404).send({ error: "Condicionante não encontrada" });
    const [process] = await db.select({ id: processes.id }).from(processes).where(and(eq(processes.id, body.data.processId), eq(processes.organizationId, organizationId))).limit(1);
    if (!process) return reply.status(400).send({ error: "Processo vinculado não encontrado" });
    const entries = [...current.history];
    if (body.data.responsibleId !== current.responsibleId) entries.push(history("Responsável alterado.", userId));
    if (body.data.status !== current.status) entries.push(history(`Situação alterada para ${body.data.status === "active" ? "Ativa" : "Inativa"}.`, userId));
    if (Object.entries(body.data).some(([key, value]) => value !== current[key as keyof typeof current] && key !== "responsibleId" && key !== "status")) entries.push(history("Dados da obrigação atualizados.", userId));
    await db.update(obligations).set({ ...body.data, history: entries, updatedAt: new Date() }).where(and(eq(obligations.id, params.data.id), eq(obligations.organizationId, organizationId)));
    return findOne(params.data.id, organizationId);
  });
  app.post("/obligations/:id/occurrences", async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: "ID de condicionante inválido" });
    const { organizationId, userId } = requireAuth(request);
    const current = await findOne(params.data.id, organizationId);
    if (!current) return reply.status(404).send({ error: "Condicionante não encontrada" });
    if (current.status !== "active" || current.periodicity === "Pontual") return reply.status(400).send({ error: "Condicionante sem recorrência ativa" });
    const interval: Record<string, number> = { Mensal: 1, Trimestral: 3, Semestral: 6, Anual: 12 };
    const latest = [...current.occurrences].sort((a, b) => b.dueDate.localeCompare(a.dueDate))[0];
    const [year, month, day] = (latest?.dueDate ?? current.firstDueDate).split("-").map(Number);
    const index = year * 12 + month - 1 + interval[current.periodicity]; const nextYear = Math.floor(index / 12); const nextMonth = index % 12 + 1;
    const nextDate = `${nextYear}-${String(nextMonth).padStart(2, "0")}-${String(Math.min(day, new Date(nextYear, nextMonth, 0).getDate())).padStart(2, "0")}`;
    const referencePeriod = periodReference(nextDate, current.periodicity);
    if (current.occurrences.some((item) => item.referencePeriod === referencePeriod)) return reply.status(409).send({ error: "O ciclo seguinte já possui ocorrência" });
    const now = new Date().toISOString();
    try {
      await db.transaction(async (tx) => {
        await tx.insert(obligationOccurrences).values({ obligationId: current.id, organizationId, referencePeriod, dueDate: nextDate, status: "Programada", responsibleId: current.responsibleId, completedAt: null, observations: "", history: [occurrenceHistory(`Ocorrência ${referencePeriod} gerada a partir da periodicidade configurada.`, userId, {})] });
        await tx.update(obligations).set({ history: [...current.history, history(`Próxima ocorrência gerada para ${referencePeriod}.`, userId)], updatedAt: new Date(now) }).where(and(eq(obligations.id, current.id), eq(obligations.organizationId, organizationId)));
      });
    } catch (error) { if (code(error) === "23505") return reply.status(409).send({ error: "O ciclo seguinte já possui ocorrência" }); throw error; }
    return findOne(current.id, organizationId);
  });
  app.put("/obligations/:id/occurrences/:occurrenceId", async (request, reply) => {
    const params = request.params as { id?: unknown; occurrenceId?: unknown };
    const parent = idParamSchema.safeParse({ id: params.id }); const child = idParamSchema.safeParse({ id: params.occurrenceId }); const body = occurrenceInputSchema.safeParse(request.body);
    if (!parent.success || !child.success) return reply.status(400).send({ error: "ID inválido" });
    if (!body.success) return reply.status(400).send({ error: "Dados inválidos", details: body.error.issues });
    const { organizationId, userId } = requireAuth(request);
    const [current] = await db.select().from(obligationOccurrences).where(and(eq(obligationOccurrences.id, child.data.id), eq(obligationOccurrences.organizationId, organizationId), eq(obligationOccurrences.obligationId, parent.data.id))).limit(1);
    if (!current || current.obligationId !== parent.data.id) return reply.status(404).send({ error: "Ocorrência não encontrada" });
    const entries = [...current.history];
    if (body.data.status !== current.status) entries.push(occurrenceHistory(`Situação alterada de ${current.status} para ${body.data.status}.`, userId, { fromStatus: current.status, toStatus: body.data.status }));
    if (body.data.responsibleId !== current.responsibleId) entries.push(occurrenceHistory("Responsável pela ocorrência atualizado.", userId));
    if (body.data.observations !== current.observations) entries.push(occurrenceHistory("Observações da ocorrência atualizadas.", userId));
    await db.update(obligationOccurrences).set({ ...body.data, completedAt: body.data.status === "Cumprida" ? current.completedAt ?? new Date() : null, history: entries, updatedAt: new Date() }).where(and(eq(obligationOccurrences.id, child.data.id), eq(obligationOccurrences.organizationId, organizationId)));
    await db.update(obligations).set({ updatedAt: new Date() }).where(and(eq(obligations.id, parent.data.id), eq(obligations.organizationId, organizationId)));
    return findOne(parent.data.id, organizationId);
  });
  app.post("/obligations/:id/occurrences/:occurrenceId/evidence", async (request, reply) => {
    const params = request.params as { id?: unknown; occurrenceId?: unknown };
    const parent = idParamSchema.safeParse({ id: params.id }); const child = idParamSchema.safeParse({ id: params.occurrenceId }); const body = createObligationEvidenceSchema.safeParse(request.body);
    if (!parent.success || !child.success) return reply.status(400).send({ error: "ID inválido" });
    if (!body.success) return reply.status(400).send({ error: "Dados inválidos", details: body.error.issues });
    const { organizationId, userId } = requireAuth(request);
    const [occurrence] = await db.select().from(obligationOccurrences).where(and(eq(obligationOccurrences.id, child.data.id), eq(obligationOccurrences.organizationId, organizationId), eq(obligationOccurrences.obligationId, parent.data.id))).limit(1);
    if (!occurrence || occurrence.obligationId !== parent.data.id) return reply.status(404).send({ error: "Ocorrência não encontrada" });
    await db.transaction(async (tx) => {
      await tx.insert(obligationEvidence).values({ ...body.data, organizationId, occurrenceId: occurrence.id });
      await tx.update(obligationOccurrences).set({ history: [...occurrence.history, occurrenceHistory(`Evidência registrada: ${body.data.name}.`, userId)], updatedAt: new Date() }).where(and(eq(obligationOccurrences.id, occurrence.id), eq(obligationOccurrences.organizationId, organizationId)));
      await tx.update(obligations).set({ updatedAt: new Date() }).where(and(eq(obligations.id, parent.data.id), eq(obligations.organizationId, organizationId)));
    });
    return reply.status(201).send(await findOne(parent.data.id, organizationId));
  });
  // Exclusão lógica preserva ciclos, evidências e trilha de auditoria.
  app.delete("/obligations/:id", async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: "ID de condicionante inválido" });
    const { organizationId, userId } = requireAuth(request);
    const [current] = await db.select().from(obligations).where(and(eq(obligations.id, params.data.id), eq(obligations.organizationId, organizationId))).limit(1);
    if (!current) return reply.status(404).send({ error: "Condicionante não encontrada" });
    if (current.status !== "inactive") await db.update(obligations).set({ status: "inactive", history: [...current.history, history("Condicionante arquivada; ocorrências e evidências preservadas.", userId)], updatedAt: new Date() }).where(and(eq(obligations.id, params.data.id), eq(obligations.organizationId, organizationId)));
    return findOne(params.data.id, organizationId);
  });
}
