import { z } from "zod";

export const APP_NAME = "juris-connect";

export const idParamSchema = z.object({
  id: z.string().uuid(),
});

export const registerAccountSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(160).transform((value) => value.toLowerCase()),
  password: z.string().min(12).max(128),
  organizationName: z.string().trim().min(2).max(160),
});
export const loginSchema = z.object({
  email: z.string().trim().email().max(160).transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(128),
});
export const authTokenSchema = z.object({ token: z.string().min(32).max(128) });
export const passwordResetSchema = authTokenSchema.extend({ password: z.string().min(12).max(128) });
export const emailAddressSchema = z.object({ email: z.string().trim().email().max(160).transform((value) => value.toLowerCase()) });
export const organizationSelectionSchema = z.object({ organizationId: z.string().uuid() });
export const organizationMemberCreateSchema = z.object({
  email: z.string().trim().email().max(160).transform((value) => value.toLowerCase()),
  role: z.enum(["admin", "member"]).default("member"),
});
export const organizationMemberRoleSchema = z.object({ role: z.enum(["owner", "admin", "member"]) });

export const createChannelSchema = z.object({
  name: z.string().trim().min(1).max(80),
  isPrivate: z.boolean().default(false),
});

export const historyQuerySchema = z.object({
  before: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const sendMessageSchema = z.object({
  channelId: z.string().uuid(),
  content: z.string().trim().min(1).max(4000),
});

export const clientKinds = ["Empresa", "Pessoa física", "Condomínio", "Órgão público"] as const;
export const clientStatuses = ["active", "inactive"] as const;
export const brazilianStates = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"] as const;
export const processTypes = ["Licenciamento ambiental", "Outorga de uso da água", "Renovação de licença", "Autorização ambiental", "Regularização", "Outros"] as const;
export const processStages = ["Preparação", "Documentação", "Protocolização", "Em análise", "Exigência ou complementação", "Aguardando retorno", "Concluído"] as const;
export const processStatuses = ["Rascunho", "Em andamento", "Aguardando cliente", "Aguardando órgão responsável", "Concluído", "Suspenso", "Cancelado"] as const;
export const processPriorities = ["Baixa", "Média", "Alta", "Urgente"] as const;
export const taskStatuses = ["A fazer", "Em andamento", "Em revisão", "Aguardando cliente", "Aguardando órgão ou terceiro", "Concluída", "Cancelada"] as const;
export const taskPriorities = ["Baixa", "Média", "Alta", "Urgente"] as const;
export const obligationPeriodicities = ["Pontual", "Mensal", "Trimestral", "Semestral", "Anual"] as const;
export const obligationStatuses = ["active", "inactive"] as const;
export const obligationOccurrenceStatuses = ["Programada", "Em preparação", "Aguardando validação", "Cumprida", "Atrasada", "Dispensada"] as const;
export const documentCategories = ["Licenças e autorizações", "Relatórios técnicos", "Protocolos", "Pareceres", "Comprovantes", "Contratos", "Documentos cadastrais", "Evidências de cumprimento", "Outros"] as const;
export const documentStatuses = ["Pendente", "Em análise", "Aprovado", "Rejeitado"] as const;

export const obligationHistoryEntrySchema = z.object({ id: z.string().min(1).max(80), date: z.iso.datetime(), message: z.string().min(1).max(500), actorId: z.string().min(1).max(100) });
export const obligationOccurrenceHistoryEntrySchema = obligationHistoryEntrySchema.extend({ fromStatus: z.enum(obligationOccurrenceStatuses).optional(), toStatus: z.enum(obligationOccurrenceStatuses).optional() });
export const obligationEvidenceSchema = z.object({ id: z.string().uuid().optional(), name: z.string().trim().min(1).max(200), description: z.string().trim().max(1000), deliveredAt: z.iso.date(), notes: z.string().trim().max(1000) });
export const obligationOccurrenceSchema = z.object({
  id: z.string().uuid().optional(), referencePeriod: z.string().trim().min(1).max(40), dueDate: z.iso.date(),
  status: z.enum(obligationOccurrenceStatuses), responsibleId: z.string().trim().min(1).max(100),
  completedAt: z.iso.datetime().nullable(), observations: z.string().max(2000),
  history: z.array(obligationOccurrenceHistoryEntrySchema).max(500).default([]), evidence: z.array(obligationEvidenceSchema).max(500).default([]),
});
export const obligationInputSchema = z.object({
  title: z.string().trim().min(1).max(140), description: z.string().trim().max(1000), processId: z.string().uuid(),
  reference: z.string().trim().max(140), authority: z.string().trim().max(140), responsibleId: z.string().trim().min(1).max(100),
  periodicity: z.enum(obligationPeriodicities), firstDueDate: z.iso.date(), requirements: z.string().max(1200),
  expectedEvidence: z.string().max(800), status: z.enum(obligationStatuses),
});
export const createObligationSchema = obligationInputSchema.extend({
  id: z.string().uuid().optional(), createdAt: z.iso.datetime().optional(),
  history: z.array(obligationHistoryEntrySchema).max(500).optional(), occurrences: z.array(obligationOccurrenceSchema).max(1000).optional(),
});
export const occurrenceInputSchema = z.object({ status: z.enum(obligationOccurrenceStatuses), responsibleId: z.string().trim().min(1).max(100), observations: z.string().max(2000) });
export const createObligationEvidenceSchema = obligationEvidenceSchema.omit({ id: true });

export type ObligationInput = z.infer<typeof obligationInputSchema>;
export type ObligationHistoryEntry = z.infer<typeof obligationHistoryEntrySchema>;
export type ObligationOccurrenceHistoryEntry = z.infer<typeof obligationOccurrenceHistoryEntrySchema>;
export type ObligationOccurrenceInput = z.infer<typeof obligationOccurrenceSchema>;
export type ObligationEvidence = z.infer<typeof obligationEvidenceSchema>;
export type ObligationPeriodicity = (typeof obligationPeriodicities)[number];
export type ObligationOccurrenceStatus = (typeof obligationOccurrenceStatuses)[number];
export type ObligationStatus = (typeof obligationStatuses)[number];
export type ObligationRecord = ObligationInput & { id: string; createdAt: string; updatedAt: string; history: ObligationHistoryEntry[]; occurrences: (ObligationOccurrenceInput & { id: string; obligationId: string; evidence: (ObligationEvidence & { id: string })[] })[] };

export const documentLinkSchema = z.object({ obligationId: z.string().uuid(), occurrenceId: z.string().uuid() });
export const documentLinksSchema = z.object({
  clientIds: z.array(z.string().uuid()).max(100).refine((items) => new Set(items).size === items.length), enterpriseIds: z.array(z.string().uuid()).max(100).refine((items) => new Set(items).size === items.length),
  processIds: z.array(z.string().uuid()).max(100).refine((items) => new Set(items).size === items.length), taskIds: z.array(z.string().uuid()).max(100).refine((items) => new Set(items).size === items.length),
  occurrences: z.array(documentLinkSchema).max(500).refine((items) => new Set(items.map((item) => `${item.obligationId}:${item.occurrenceId}`)).size === items.length),
});
export const documentInputSchema = z.object({
  name: z.string().trim().min(1).max(180), description: z.string().trim().max(2000),
  category: z.enum(documentCategories), responsible: z.string().trim().min(1).max(120), status: z.enum(documentStatuses),
  links: documentLinksSchema,
});
export const createDocumentSchema = documentInputSchema.extend({
  history: z.array(z.object({ id: z.string().min(1).max(80), date: z.iso.datetime(), message: z.string().min(1).max(500), actor: z.string().min(1).max(120) })).max(500).optional(),
  addedAt: z.iso.datetime().optional(),
  legacyImportId: z.string().trim().min(1).max(255).optional(),
});
export type DocumentInput = z.infer<typeof documentInputSchema>;
export type DocumentLinks = z.infer<typeof documentLinksSchema>;
export type DocumentCategory = (typeof documentCategories)[number];
export type DocumentStatus = (typeof documentStatuses)[number];
export type DocumentHistoryEntry = NonNullable<z.infer<typeof createDocumentSchema>["history"]>[number];
export type DocumentRecord = DocumentInput & { id: string; originalName: string; extension: string; mimeType: string; size: number; addedAt: string; updatedAt: string; history: DocumentHistoryEntry[] };

export const processHistoryEntrySchema = z.object({
  id: z.string().min(1).max(80),
  date: z.iso.datetime(),
  type: z.enum(["created", "stage", "status", "updated"]),
  message: z.string().min(1).max(500),
});

export const processInputSchema = z.object({
  enterpriseId: z.string().uuid(),
  name: z.string().trim().min(1).max(140),
  protocol: z.string().trim().max(80),
  processType: z.enum(processTypes),
  entity: z.string().trim().max(140),
  description: z.string().trim().max(1000),
  manager: z.string().trim().min(1).max(100),
  startDate: z.iso.date(),
  dueDate: z.iso.date(),
  priority: z.enum(processPriorities),
  stage: z.enum(processStages),
  status: z.enum(processStatuses),
}).refine((value) => value.dueDate >= value.startDate, {
  path: ["dueDate"],
  message: "O prazo previsto deve ser igual ou posterior à data de início",
});

export const createProcessSchema = processInputSchema.extend({
  createdAt: z.union([z.iso.datetime(), z.iso.date()]).optional(),
  history: z.array(processHistoryEntrySchema).max(200).optional(),
});

export const taskSubtaskSchema = z.object({ id: z.string().min(1).max(80), title: z.string().trim().min(1).max(300), completed: z.boolean() });
export const taskHistoryEntrySchema = z.object({
  id: z.string().min(1).max(80),
  date: z.iso.datetime(),
  type: z.enum(["created", "status", "transfer", "subtask", "updated"]),
  message: z.string().min(1).max(500),
  previousStatus: z.enum(taskStatuses).optional(),
  newStatus: z.enum(taskStatuses).optional(),
  actorId: z.string().min(1).max(100),
});
export const taskTransferSchema = z.object({
  id: z.string().min(1).max(80),
  fromAssigneeId: z.string().min(1).max(100),
  toAssigneeId: z.string().min(1).max(100),
  date: z.iso.datetime(),
  justification: z.string().trim().min(1).max(500),
});
export const taskWaitPeriodSchema = z.object({
  id: z.string().min(1).max(80),
  status: z.enum(["Aguardando cliente", "Aguardando órgão ou terceiro"]),
  startedAt: z.iso.datetime(),
  endedAt: z.iso.datetime().nullable(),
});
export const taskInputSchema = z.object({
  title: z.string().trim().min(1).max(140),
  description: z.string().trim().max(1000),
  processId: z.string().uuid(),
  assigneeId: z.string().trim().min(1).max(100),
  status: z.enum(taskStatuses),
  priority: z.enum(taskPriorities),
  startDate: z.union([z.literal(""), z.iso.date()]),
  dueDate: z.union([z.literal(""), z.iso.date()]),
  subtasks: z.array(taskSubtaskSchema).max(200),
}).refine((value) => !value.startDate || !value.dueDate || value.dueDate >= value.startDate, {
  path: ["dueDate"],
  message: "O prazo previsto deve ser igual ou posterior à data de início",
});
export const createTaskSchema = taskInputSchema.extend({
  createdAt: z.iso.datetime().optional(),
  completedAt: z.iso.datetime().nullable().optional(),
  history: z.array(taskHistoryEntrySchema).max(500).optional(),
  transfers: z.array(taskTransferSchema).max(200).optional(),
  waitPeriods: z.array(taskWaitPeriodSchema).max(200).optional(),
});
export const transferTaskSchema = z.object({
  toAssigneeId: z.string().trim().min(1).max(100),
  justification: z.string().trim().min(1).max(500),
});

export const clientInputSchema = z.object({
  name: z.string().trim().min(1, "Nome obrigatório").max(120),
  kind: z.enum(clientKinds),
  document: z.string().trim().max(24).refine((value) => {
    if (!value) return true;
    const digits = value.replace(/\D/g, "");
    return digits.length === 11 || digits.length === 14;
  }, "CPF/CNPJ deve conter 11 ou 14 dígitos"),
  contactName: z.string().trim().min(1, "Contato obrigatório").max(100),
  email: z.string().trim().email("E-mail inválido").max(160),
  phone: z.string().trim().max(24).refine((value) => value.replace(/\D/g, "").length >= 10, "Telefone deve conter DDD"),
  address: z.string().trim().max(200),
  notes: z.string().trim().max(800),
  status: z.enum(clientStatuses),
});

export const enterpriseInputSchema = z.object({
  clientId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  type: z.string().trim().min(1).max(100),
  activity: z.string().trim().min(1).max(140),
  document: z.string().trim().max(24).refine((value) => !value || value.replace(/\D/g, "").length === 14, "CNPJ deve conter 14 dígitos ou ficar em branco"),
  address: z.string().trim().min(1).max(200),
  municipality: z.string().trim().min(1).max(100),
  state: z.enum(brazilianStates),
  manager: z.string().trim().min(1).max(100),
  description: z.string().trim().max(800),
  status: z.enum(clientStatuses),
  relatedCases: z.number().int().min(0).max(9999),
});
export const createEnterpriseSchema = enterpriseInputSchema.extend({
  createdAt: z.union([z.iso.datetime(), z.iso.date()]).optional(),
});

export type CreateChannelInput = z.infer<typeof createChannelSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type ClientInput = z.infer<typeof clientInputSchema>;
export type ClientKind = (typeof clientKinds)[number];
export type ClientStatus = (typeof clientStatuses)[number];
export type EnterpriseInput = z.infer<typeof enterpriseInputSchema>;
export type ProcessInput = z.infer<typeof processInputSchema>;
export type ProcessHistoryEntry = z.infer<typeof processHistoryEntrySchema>;
export type TaskInput = z.infer<typeof taskInputSchema>;
export type TaskStatus = (typeof taskStatuses)[number];
export type TaskPriority = (typeof taskPriorities)[number];
export type TaskSubtask = z.infer<typeof taskSubtaskSchema>;
export type TaskHistoryEntry = z.infer<typeof taskHistoryEntrySchema>;
export type TaskTransfer = z.infer<typeof taskTransferSchema>;
export type TaskWaitPeriod = z.infer<typeof taskWaitPeriodSchema>;

export type ChatMessage = {
  id: string;
  channelId: string;
  authorId: string;
  authorName: string;
  content: string;
  createdAt: string;
};

export const SOCKET_EVENTS = {
  joinChannel: "channel:join",
  sendMessage: "message:send",
  newMessage: "message:new",
} as const;
