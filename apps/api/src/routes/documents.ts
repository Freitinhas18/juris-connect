import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { createHash, randomUUID } from "node:crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import { createDocumentSchema, documentInputSchema, idParamSchema } from "@juris-connect/shared";
import { db } from "../db/index.js";
import { clients, documentClients, documentEnterprises, documentOccurrences, documentProcesses, documentTasks, documents, enterprises, obligationOccurrences, obligations, processes, tasks } from "../db/schema.js";
import { requireAuth } from "../auth/context.js";
import { openStoredFile, promoteStaged, quarantine, readStoredFile, reconcileStorage, removeFinal, removeQuarantine, removeStaged, restoreQuarantine, writeStaged } from "../documents/storage.js";

const MAX_SIZE = 20 * 1024 * 1024;
const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
  doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  txt: "text/plain", csv: "text/csv",
};
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type SelectExecutor = Pick<typeof db, "select">;
type InsertExecutor = Pick<typeof db, "insert">;
function dbCode(error: unknown): string | undefined { const item = error as { code?: string; cause?: { code?: string } }; return item?.code ?? item?.cause?.code; }
function legacyDocumentId(legacyImportId: string, organizationId: string): string {
  const bytes = createHash("sha256").update("juris-connect:legacy-document:").update(organizationId).update(":").update(legacyImportId).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
function validFileSignature(extension: string, buffer: Buffer) {
  if (extension === "pdf") return buffer.subarray(0, 5).toString("ascii") === "%PDF-";
  if (extension === "png") return buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (extension === "jpg" || extension === "jpeg") return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (extension === "doc" || extension === "xls") return buffer.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
  if (extension === "docx" || extension === "xlsx") return buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04;
  return !buffer.includes(0);
}
function history(message: string) { return { id: randomUUID(), date: new Date().toISOString(), message, actor: "Operador demonstrativo" }; }
function fileMetadata(id: string, organizationId: string, input: ReturnType<typeof createDocumentSchema.parse>, originalName: string, mimeType: string, size: number) {
  const extension = originalName.split(".").pop()?.toLowerCase() ?? "";
  return { id, organizationId, name: input.name.trim() || originalName, originalName: originalName.slice(0, 255), extension: extension.toUpperCase(), mimeType, size, description: input.description, category: input.category, responsible: input.responsible, status: input.status, history: input.history?.length ? input.history : [history("Documento incluído no armazenamento persistente do servidor.")], addedAt: input.addedAt ? new Date(input.addedAt) : new Date(), updatedAt: new Date() };
}
async function validateLinks(links: ReturnType<typeof documentInputSchema.parse>["links"], organizationId: string) {
  const [clientRows, enterpriseRows, processRows, taskRows] = await Promise.all([
    links.clientIds.length ? db.select({ id: clients.id }).from(clients).where(and(inArray(clients.id, links.clientIds), eq(clients.organizationId, organizationId))) : [],
    links.enterpriseIds.length ? db.select({ id: enterprises.id }).from(enterprises).where(and(inArray(enterprises.id, links.enterpriseIds), eq(enterprises.organizationId, organizationId))) : [],
    links.processIds.length ? db.select({ id: processes.id }).from(processes).where(and(inArray(processes.id, links.processIds), eq(processes.organizationId, organizationId))) : [],
    links.taskIds.length ? db.select({ id: tasks.id }).from(tasks).where(and(inArray(tasks.id, links.taskIds), eq(tasks.organizationId, organizationId))) : [],
  ]);
  if (clientRows.length !== links.clientIds.length) return "Um ou mais clientes vinculados não existem";
  if (enterpriseRows.length !== links.enterpriseIds.length) return "Um ou mais empreendimentos vinculados não existem";
  if (processRows.length !== links.processIds.length) return "Um ou mais processos vinculados não existem";
  if (taskRows.length !== links.taskIds.length) return "Uma ou mais tarefas vinculadas não existem";
  for (const link of links.occurrences) {
    if (!ID.test(link.obligationId)) return "Uma ou mais condicionantes vinculadas não existem";
    const [occurrence] = await db.select({ id: obligationOccurrences.id, obligationId: obligationOccurrences.obligationId }).from(obligationOccurrences).where(and(eq(obligationOccurrences.id, link.occurrenceId), eq(obligationOccurrences.organizationId, organizationId), eq(obligationOccurrences.obligationId, link.obligationId))).limit(1);
    if (!occurrence || occurrence.obligationId !== link.obligationId) return "A ocorrência não pertence à condicionante selecionada";
  }
  return null;
}
async function addLinks(tx: InsertExecutor, documentId: string, organizationId: string, links: ReturnType<typeof documentInputSchema.parse>["links"]) {
  if (links.clientIds.length) await tx.insert(documentClients).values(links.clientIds.map((clientId) => ({ documentId, clientId, organizationId })));
  if (links.enterpriseIds.length) await tx.insert(documentEnterprises).values(links.enterpriseIds.map((enterpriseId) => ({ documentId, enterpriseId, organizationId })));
  if (links.processIds.length) await tx.insert(documentProcesses).values(links.processIds.map((processId) => ({ documentId, processId, organizationId })));
  if (links.taskIds.length) await tx.insert(documentTasks).values(links.taskIds.map((taskId) => ({ documentId, taskId, organizationId })));
  if (links.occurrences.length) await tx.insert(documentOccurrences).values(links.occurrences.map((item) => ({ documentId, occurrenceId: item.occurrenceId, organizationId })));
}
async function getLinks(query: SelectExecutor, id: string, organizationId: string) {
  const [clientsLinked, enterprisesLinked, processesLinked, tasksLinked, occurrencesLinked] = await Promise.all([
    query.select({ id: documentClients.clientId }).from(documentClients).where(and(eq(documentClients.documentId, id), eq(documentClients.organizationId, organizationId))),
    query.select({ id: documentEnterprises.enterpriseId }).from(documentEnterprises).where(and(eq(documentEnterprises.documentId, id), eq(documentEnterprises.organizationId, organizationId))),
    query.select({ id: documentProcesses.processId }).from(documentProcesses).where(and(eq(documentProcesses.documentId, id), eq(documentProcesses.organizationId, organizationId))),
    query.select({ id: documentTasks.taskId }).from(documentTasks).where(and(eq(documentTasks.documentId, id), eq(documentTasks.organizationId, organizationId))),
    query.select({ occurrenceId: documentOccurrences.occurrenceId, obligationId: obligationOccurrences.obligationId }).from(documentOccurrences).innerJoin(obligationOccurrences, and(eq(documentOccurrences.occurrenceId, obligationOccurrences.id), eq(obligationOccurrences.organizationId, organizationId))).where(and(eq(documentOccurrences.documentId, id), eq(documentOccurrences.organizationId, organizationId))),
  ]);
  return { clientIds: clientsLinked.map((item) => item.id), enterpriseIds: enterprisesLinked.map((item) => item.id), processIds: processesLinked.map((item) => item.id), taskIds: tasksLinked.map((item) => item.id), occurrences: occurrencesLinked.map(({ obligationId, occurrenceId }) => ({ obligationId, occurrenceId })) };
}
async function hydrate(query: SelectExecutor, rows: typeof documents.$inferSelect[], organizationId: string) {
  return Promise.all(rows.map(async (row) => ({ ...row, addedAt: row.addedAt.toISOString(), updatedAt: row.updatedAt.toISOString(), links: await getLinks(query, row.id, organizationId) })));
}
async function getOne(id: string, organizationId: string) { const [row] = await db.select().from(documents).where(and(eq(documents.id, id), eq(documents.organizationId, organizationId))).limit(1); return row ? (await hydrate(db, [row], organizationId))[0] : undefined; }
function params(request: FastifyRequest, reply: FastifyReply) { const parsed = idParamSchema.safeParse(request.params); if (!parsed.success) { void reply.status(400).send({ error: "ID de documento inválido" }); return null; } return parsed.data.id; }
async function parseUpload(request: FastifyRequest, reply: FastifyReply, organizationId: string) {
  let metadataText = ""; let uploaded: { filename: string; mimetype: string; buffer: Buffer } | null = null;
  try {
    for await (const part of request.parts()) {
      if (part.type === "file") {
        if (uploaded) { await part.toBuffer(); return reply.status(400).send({ error: "Envie somente um arquivo" }); }
        uploaded = { filename: part.filename, mimetype: part.mimetype, buffer: await part.toBuffer() };
        if (part.file.truncated) return reply.status(413).send({ error: "Arquivo excede o limite de 20 MB" });
      } else if (part.fieldname === "metadata" && typeof part.value === "string") metadataText = part.value;
      else return reply.status(400).send({ error: "Campo multipart não reconhecido" });
    }
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "FST_REQ_FILE_TOO_LARGE") return reply.status(413).send({ error: "Arquivo excede o limite de 20 MB" });
    return reply.status(400).send({ error: "Upload inválido" });
  }
  if (!uploaded || !metadataText) return reply.status(400).send({ error: "Arquivo e metadados são obrigatórios" });
  if (!uploaded.filename || uploaded.filename.length > 255 || /[\u0000-\u001f\u007f]/.test(uploaded.filename)) return reply.status(400).send({ error: "Nome de arquivo inválido" });
  if (uploaded.buffer.length < 1 || uploaded.buffer.length > MAX_SIZE) return reply.status(413).send({ error: "Arquivo vazio ou acima do limite de 20 MB" });
  const extension = uploaded.filename.split(".").pop()?.toLowerCase() ?? "";
  const allowedMime = MIME_BY_EXTENSION[extension];
  const receivedMime = uploaded.mimetype.toLowerCase().split(";")[0].trim();
  const alternateMime = extension === "csv" ? ["application/vnd.ms-excel", "text/plain"] : [];
  if (!allowedMime || (receivedMime && receivedMime !== allowedMime && receivedMime !== "application/octet-stream" && !alternateMime.includes(receivedMime)) || !validFileSignature(extension, uploaded.buffer)) return reply.status(415).send({ error: "Tipo de arquivo não permitido ou incompatível com o conteúdo" });
  let rawMetadata: unknown;
  try { rawMetadata = JSON.parse(metadataText); } catch { return reply.status(400).send({ error: "Metadados inválidos" }); }
  const metadata = createDocumentSchema.safeParse(rawMetadata);
  if (!metadata.success) return reply.status(400).send({ error: "Metadados inválidos", details: metadata.error.issues });
  const linkError = await validateLinks(metadata.data.links, organizationId);
  if (linkError) return reply.status(400).send({ error: linkError });
  return { metadata: metadata.data, file: uploaded, mimeType: allowedMime };
}

export async function documentRoutes(app: FastifyInstance) {
  app.get("/documents", async (request) => {
    const { organizationId } = requireAuth(request);
    return hydrate(db, await db.select().from(documents).where(eq(documents.organizationId, organizationId)).orderBy(asc(documents.name)), organizationId);
  });
  app.get("/documents/:id", async (request, reply) => {
    const id = params(request, reply); if (!id) return;
    const { organizationId } = requireAuth(request);
    const document = await getOne(id, organizationId); if (!document) return reply.status(404).send({ error: "Documento não encontrado" });
    return document;
  });
  app.post("/documents", { bodyLimit: 22 * 1024 * 1024 }, async (request, reply) => {
    const { organizationId } = requireAuth(request);
    const parsed = await parseUpload(request, reply, organizationId); if (!parsed || "statusCode" in parsed) return parsed;
    const { metadata, file, mimeType } = parsed;
    const id = metadata.legacyImportId ? legacyDocumentId(metadata.legacyImportId, organizationId) : randomUUID();
    if (metadata.legacyImportId) {
      const existing = await getOne(id, organizationId);
      if (existing) {
        try { await openStoredFile(id); return reply.status(200).send(existing); }
        catch {
          try { await writeStaged(id, file.buffer); await promoteStaged(id); return reply.status(200).send(existing); }
          catch { await removeStaged(id).catch(() => undefined); return reply.status(500).send({ error: "Não foi possível restaurar o arquivo legado já importado" }); }
        }
      }
    }
    try { await writeStaged(id, file.buffer); }
    catch { return reply.status(500).send({ error: "Não foi possível gravar o arquivo no armazenamento do servidor" }); }
    let promoted = false;
    try {
      await db.transaction(async (tx) => {
        await tx.insert(documents).values(fileMetadata(id, organizationId, metadata, file.filename, mimeType, file.buffer.length));
        await addLinks(tx, id, organizationId, metadata.links);
        await promoteStaged(id); promoted = true;
      });
      return reply.status(201).send(await getOne(id, organizationId));
    } catch (error) {
      await removeStaged(id).catch(() => undefined);
      if (promoted) await removeFinal(id).catch(() => undefined);
      if (metadata.legacyImportId && dbCode(error) === "23505") {
        const existing = await getOne(id, organizationId);
        if (existing) {
          try { await openStoredFile(id); return reply.status(200).send(existing); }
          catch { /* A retry will repair the missing file after the racing request finishes. */ }
        }
      }
      if (dbCode(error) === "23503") return reply.status(400).send({ error: "Um dos registros relacionados não existe" });
      return reply.status(500).send({ error: "Não foi possível salvar os metadados e o arquivo" });
    }
  });
  app.put("/documents/:id", async (request, reply) => {
    const id = params(request, reply); if (!id) return;
    const { organizationId } = requireAuth(request);
    const body = documentInputSchema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: "Dados inválidos", details: body.error.issues });
    const current = await getOne(id, organizationId); if (!current) return reply.status(404).send({ error: "Documento não encontrado" });
    const linkError = await validateLinks(body.data.links, organizationId); if (linkError) return reply.status(400).send({ error: linkError });
    const entries = [...current.history];
    if (body.data.category !== current.category) entries.push(history(`Categoria alterada para ${body.data.category}.`));
    if (body.data.status !== current.status) entries.push(history(`Status alterado para ${body.data.status}.`));
    const beforeLinks = JSON.stringify(current.links); const afterLinks = JSON.stringify(body.data.links);
    if (beforeLinks !== afterLinks) entries.push(history("Relacionamentos do documento atualizados."));
    if (body.data.name !== current.name || body.data.description !== current.description || body.data.responsible !== current.responsible) entries.push(history("Informações do documento atualizadas."));
    try {
      await db.transaction(async (tx) => {
        await tx.update(documents).set({ name: body.data.name, description: body.data.description, category: body.data.category, responsible: body.data.responsible, status: body.data.status, history: entries, updatedAt: new Date() }).where(and(eq(documents.id, id), eq(documents.organizationId, organizationId)));
        for (const table of [documentClients, documentEnterprises, documentProcesses, documentTasks, documentOccurrences]) await tx.delete(table).where(and(eq(table.documentId, id), eq(table.organizationId, organizationId)));
        await addLinks(tx, id, organizationId, body.data.links);
      });
      return getOne(id, organizationId);
    } catch (error) { if (dbCode(error) === "23503") return reply.status(400).send({ error: "Um dos registros relacionados não existe" }); throw error; }
  });
  app.delete("/documents/:id", async (request, reply) => {
    const id = params(request, reply); if (!id) return;
    const { organizationId } = requireAuth(request);
    const [current] = await db.select({ id: documents.id }).from(documents).where(and(eq(documents.id, id), eq(documents.organizationId, organizationId))).limit(1);
    if (!current) return reply.status(404).send({ error: "Documento não encontrado" });
    try { await quarantine(id); } catch { return reply.status(409).send({ error: "Arquivo físico indisponível; documento não removido" }); }
    try {
      await db.transaction(async (tx) => {
        for (const table of [documentClients, documentEnterprises, documentProcesses, documentTasks, documentOccurrences]) await tx.delete(table).where(and(eq(table.documentId, id), eq(table.organizationId, organizationId)));
        await tx.delete(documents).where(and(eq(documents.id, id), eq(documents.organizationId, organizationId)));
      });
      await removeQuarantine(id).catch(() => undefined);
      return reply.status(204).send();
    } catch {
      await restoreQuarantine(id).catch(() => undefined);
      return reply.status(500).send({ error: "Não foi possível excluir o documento" });
    }
  });
  app.get("/documents/:id/file", async (request, reply) => {
    const id = params(request, reply); if (!id) return;
    const { organizationId } = requireAuth(request);
    const [document] = await db.select().from(documents).where(and(eq(documents.id, id), eq(documents.organizationId, organizationId))).limit(1);
    if (!document) return reply.status(404).send({ error: "Documento não encontrado" });
    try { await openStoredFile(id); } catch { return reply.status(410).send({ error: "O arquivo físico não está disponível" }); }
    let content: Buffer;
    try { content = await readStoredFile(id); } catch { return reply.status(500).send({ error: "Não foi possível verificar a integridade do arquivo" }); }
    const inline = (request.query as { inline?: string }).inline === "true" && ["application/pdf", "image/png", "image/jpeg"].includes(document.mimeType);
    const safeName = encodeURIComponent(document.originalName).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
    reply.header("Content-Type", document.mimeType).header("Content-Length", String(document.size)).header("X-Content-Type-Options", "nosniff").header("Cache-Control", "private, no-store").header("Content-Disposition", `${inline ? "inline" : "attachment"}; filename*=UTF-8''${safeName}`);
    return reply.send(content);
  });
  try {
    const reconciled = await reconcileStorage();
    if (!reconciled) app.log.info("Reconciliação automática de arquivos ignorada: a role atual não pode enumerar documentos entre tenants.");
  } catch { app.log.warn("O armazenamento de documentos requer reconciliação após a migration 0006."); }
}
