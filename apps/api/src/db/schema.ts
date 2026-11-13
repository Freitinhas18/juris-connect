import { boolean, foreignKey, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import type { DocumentHistoryEntry, ProcessHistoryEntry, TaskHistoryEntry, TaskSubtask, TaskTransfer, TaskWaitPeriod } from "@juris-connect/shared";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"),
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const organizationRole = pgEnum("organization_role", ["owner", "admin", "member"]);
export const authTokenPurpose = pgEnum("auth_token_purpose", ["verify_email", "reset_password"]);

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const organizationMemberships = pgTable("organization_memberships", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "restrict" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  role: organizationRole("role").notNull().default("member"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("organization_memberships_org_user_unique").on(table.organizationId, table.userId),
  index("organization_memberships_user_id_idx").on(table.userId),
]).enableRLS();

export const organizationAuditEvents = pgTable("organization_audit_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "restrict" }),
  actorUserId: uuid("actor_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  targetUserId: uuid("target_user_id").references(() => users.id, { onDelete: "restrict" }),
  action: text("action").notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("organization_audit_events_org_created_idx").on(table.organizationId, table.createdAt), index("organization_audit_events_actor_idx").on(table.actorUserId)]).enableRLS();

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("sessions_user_id_idx").on(table.userId),
  index("sessions_expiry_idx").on(table.expiresAt),
  foreignKey({ columns: [table.organizationId, table.userId], foreignColumns: [organizationMemberships.organizationId, organizationMemberships.userId], name: "sessions_membership_fk" }).onDelete("cascade"),
]).enableRLS();

export const authTokens = pgTable("auth_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  purpose: authTokenPurpose("purpose").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("auth_tokens_user_purpose_idx").on(table.userId, table.purpose), index("auth_tokens_expiry_idx").on(table.expiresAt)]);

export const authLoginLimits = pgTable("auth_login_limits", {
  key: text("key").primaryKey(),
  windowStartedAt: timestamp("window_started_at", { withTimezone: true }).notNull(),
  attempts: integer("attempts").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("auth_login_limits_updated_at_idx").on(table.updatedAt)]);

export const channels = pgTable("channels", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "restrict" }),
  isPrivate: boolean("is_private").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => [
  uniqueIndex("channels_organization_name_unique").on(table.organizationId, table.name),
  uniqueIndex("channels_organization_id_unique").on(table.organizationId, table.id),
  index("channels_organization_id_idx").on(table.organizationId),
]).enableRLS();

export const channelMemberships = pgTable("channel_memberships", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "restrict" }),
  channelId: uuid("channel_id").notNull().references(() => channels.id, { onDelete: "restrict" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("channel_memberships_channel_user_unique").on(table.channelId, table.userId),
  index("channel_memberships_org_user_idx").on(table.organizationId, table.userId),
  foreignKey({ columns: [table.organizationId, table.channelId], foreignColumns: [channels.organizationId, channels.id], name: "channel_memberships_channel_tenant_fk" }).onDelete("cascade"),
  foreignKey({ columns: [table.organizationId, table.userId], foreignColumns: [organizationMemberships.organizationId, organizationMemberships.userId], name: "channel_memberships_org_member_fk" }).onDelete("cascade"),
]).enableRLS();

export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  channelId: uuid("channel_id")
    .notNull()
    .references(() => channels.id, { onDelete: "cascade" }),
  authorId: uuid("author_id")
    .notNull()
    .references(() => users.id),
  content: text("content").notNull(),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => [index("messages_organization_id_idx").on(table.organizationId), foreignKey({ columns: [table.organizationId, table.channelId], foreignColumns: [channels.organizationId, channels.id], name: "messages_channel_tenant_fk" }).onDelete("restrict")]).enableRLS();

export const clients = pgTable("clients", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  kind: text("kind").notNull(),
  document: text("document").notNull().default(""),
  contactName: text("contact_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  address: text("address").notNull().default(""),
  notes: text("notes").notNull().default(""),
  status: text("status").notNull().default("active"),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [uniqueIndex("clients_organization_id_id_unique").on(table.organizationId, table.id), index("clients_organization_id_idx").on(table.organizationId)]).enableRLS();

export const enterprises = pgTable("enterprises", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  type: text("type").notNull(),
  activity: text("activity").notNull(),
  document: text("document").notNull().default(""),
  address: text("address").notNull(),
  municipality: text("municipality").notNull(),
  state: text("state").notNull(),
  manager: text("manager").notNull(),
  description: text("description").notNull().default(""),
  status: text("status").notNull().default("active"),
  relatedCases: integer("related_cases").notNull().default(0),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [uniqueIndex("enterprises_organization_id_id_unique").on(table.organizationId, table.id), index("enterprises_client_id_idx").on(table.clientId), index("enterprises_organization_id_idx").on(table.organizationId), foreignKey({ columns: [table.organizationId, table.clientId], foreignColumns: [clients.organizationId, clients.id], name: "enterprises_client_tenant_fk" }).onDelete("restrict")]).enableRLS();

export const processes = pgTable("processes", {
  id: uuid("id").primaryKey().defaultRandom(),
  enterpriseId: uuid("enterprise_id").notNull().references(() => enterprises.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  protocol: text("protocol").notNull().default(""),
  processType: text("process_type").notNull(),
  entity: text("entity").notNull().default(""),
  description: text("description").notNull().default(""),
  manager: text("manager").notNull(),
  startDate: text("start_date").notNull(),
  dueDate: text("due_date").notNull(),
  priority: text("priority").notNull(),
  stage: text("stage").notNull(),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "restrict" }),
  status: text("status").notNull(),
  history: jsonb("history").$type<ProcessHistoryEntry[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [uniqueIndex("processes_organization_id_id_unique").on(table.organizationId, table.id), index("processes_enterprise_id_idx").on(table.enterpriseId), index("processes_organization_id_idx").on(table.organizationId), foreignKey({ columns: [table.organizationId, table.enterpriseId], foreignColumns: [enterprises.organizationId, enterprises.id], name: "processes_enterprise_tenant_fk" }).onDelete("restrict")]).enableRLS();

export const tasks = pgTable("tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  processId: uuid("process_id").notNull().references(() => processes.id, { onDelete: "restrict" }),
  assigneeId: text("assignee_id").notNull(),
  status: text("status").notNull(),
  priority: text("priority").notNull(),
  startDate: text("start_date").notNull().default(""),
  dueDate: text("due_date").notNull().default(""),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  subtasks: jsonb("subtasks").$type<TaskSubtask[]>().notNull().default([]),
  history: jsonb("history").$type<TaskHistoryEntry[]>().notNull().default([]),
  transfers: jsonb("transfers").$type<TaskTransfer[]>().notNull().default([]),
  waitPeriods: jsonb("wait_periods").$type<TaskWaitPeriod[]>().notNull().default([]),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [uniqueIndex("tasks_organization_id_id_unique").on(table.organizationId, table.id), index("tasks_process_id_idx").on(table.processId), index("tasks_organization_id_idx").on(table.organizationId), foreignKey({ columns: [table.organizationId, table.processId], foreignColumns: [processes.organizationId, processes.id], name: "tasks_process_tenant_fk" }).onDelete("restrict")]).enableRLS();

export const obligations = pgTable("obligations", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(), description: text("description").notNull().default(""),
  processId: uuid("process_id").notNull().references(() => processes.id, { onDelete: "restrict" }),
  reference: text("reference").notNull().default(""), authority: text("authority").notNull().default(""),
  responsibleId: text("responsible_id").notNull(), periodicity: text("periodicity").notNull(),
  firstDueDate: text("first_due_date").notNull(), requirements: text("requirements").notNull().default(""),
  expectedEvidence: text("expected_evidence").notNull().default(""), status: text("status").notNull().default("active"),
  history: jsonb("history").$type<import("@juris-connect/shared").ObligationHistoryEntry[]>().notNull().default([]),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [uniqueIndex("obligations_organization_id_id_unique").on(table.organizationId, table.id), index("obligations_process_id_idx").on(table.processId), index("obligations_organization_id_idx").on(table.organizationId), foreignKey({ columns: [table.organizationId, table.processId], foreignColumns: [processes.organizationId, processes.id], name: "obligations_process_tenant_fk" }).onDelete("restrict")]).enableRLS();

export const obligationOccurrences = pgTable("obligation_occurrences", {
  id: uuid("id").primaryKey().defaultRandom(),
  obligationId: uuid("obligation_id").notNull().references(() => obligations.id, { onDelete: "restrict" }),
  referencePeriod: text("reference_period").notNull(), dueDate: text("due_date").notNull(),
  status: text("status").notNull(), responsibleId: text("responsible_id").notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }), observations: text("observations").notNull().default(""),
  history: jsonb("history").$type<import("@juris-connect/shared").ObligationOccurrenceHistoryEntry[]>().notNull().default([]),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [uniqueIndex("obligation_occurrences_organization_id_id_unique").on(table.organizationId, table.id), index("obligation_occurrences_obligation_id_idx").on(table.obligationId), index("obligation_occurrences_due_date_idx").on(table.dueDate), index("obligation_occurrences_organization_id_idx").on(table.organizationId), uniqueIndex("obligation_occurrences_period_unique").on(table.obligationId, table.referencePeriod), foreignKey({ columns: [table.organizationId, table.obligationId], foreignColumns: [obligations.organizationId, obligations.id], name: "obligation_occurrences_obligation_tenant_fk" }).onDelete("restrict")]).enableRLS();

export const obligationEvidence = pgTable("obligation_evidence", {
  id: uuid("id").primaryKey().defaultRandom(),
  occurrenceId: uuid("occurrence_id").notNull().references(() => obligationOccurrences.id, { onDelete: "restrict" }),
  name: text("name").notNull(), description: text("description").notNull().default(""),
  deliveredAt: text("delivered_at").notNull(), notes: text("notes").notNull().default(""),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("obligation_evidence_occurrence_id_idx").on(table.occurrenceId), index("obligation_evidence_organization_id_idx").on(table.organizationId), foreignKey({ columns: [table.organizationId, table.occurrenceId], foreignColumns: [obligationOccurrences.organizationId, obligationOccurrences.id], name: "obligation_evidence_occurrence_tenant_fk" }).onDelete("restrict")]).enableRLS();

export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().defaultRandom(), name: text("name").notNull(), originalName: text("original_name").notNull(),
  extension: text("extension").notNull(), mimeType: text("mime_type").notNull(), size: integer("size").notNull(),
  description: text("description").notNull().default(""), category: text("category").notNull(), responsible: text("responsible").notNull(),
  status: text("status").notNull(), history: jsonb("history").$type<DocumentHistoryEntry[]>().notNull().default([]),
  addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "restrict" }),
}, (table) => [uniqueIndex("documents_organization_id_id_unique").on(table.organizationId, table.id), index("documents_added_at_idx").on(table.addedAt), index("documents_category_idx").on(table.category), index("documents_organization_id_idx").on(table.organizationId)]).enableRLS();

export const documentClients = pgTable("document_clients", {
  documentId: uuid("document_id").notNull().references(() => documents.id, { onDelete: "restrict" }),
  clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "restrict" }),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "restrict" }),
}, (table) => [uniqueIndex("document_clients_pk").on(table.documentId, table.clientId), index("document_clients_client_id_idx").on(table.clientId), index("document_clients_organization_id_idx").on(table.organizationId), foreignKey({ columns: [table.organizationId, table.documentId], foreignColumns: [documents.organizationId, documents.id], name: "document_clients_document_tenant_fk", }).onDelete("restrict"), foreignKey({ columns: [table.organizationId, table.clientId], foreignColumns: [clients.organizationId, clients.id], name: "document_clients_client_tenant_fk" }).onDelete("restrict")]).enableRLS();
export const documentEnterprises = pgTable("document_enterprises", {
  documentId: uuid("document_id").notNull().references(() => documents.id, { onDelete: "restrict" }),
  enterpriseId: uuid("enterprise_id").notNull().references(() => enterprises.id, { onDelete: "restrict" }),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "restrict" }),
}, (table) => [uniqueIndex("document_enterprises_pk").on(table.documentId, table.enterpriseId), index("document_enterprises_enterprise_id_idx").on(table.enterpriseId), index("document_enterprises_organization_id_idx").on(table.organizationId), foreignKey({ columns: [table.organizationId, table.documentId], foreignColumns: [documents.organizationId, documents.id], name: "document_enterprises_document_tenant_fk" }).onDelete("restrict"), foreignKey({ columns: [table.organizationId, table.enterpriseId], foreignColumns: [enterprises.organizationId, enterprises.id], name: "document_enterprises_enterprise_tenant_fk" }).onDelete("restrict")]).enableRLS();
export const documentProcesses = pgTable("document_processes", {
  documentId: uuid("document_id").notNull().references(() => documents.id, { onDelete: "restrict" }),
  processId: uuid("process_id").notNull().references(() => processes.id, { onDelete: "restrict" }),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "restrict" }),
}, (table) => [uniqueIndex("document_processes_pk").on(table.documentId, table.processId), index("document_processes_process_id_idx").on(table.processId), index("document_processes_organization_id_idx").on(table.organizationId), foreignKey({ columns: [table.organizationId, table.documentId], foreignColumns: [documents.organizationId, documents.id], name: "document_processes_document_tenant_fk" }).onDelete("restrict"), foreignKey({ columns: [table.organizationId, table.processId], foreignColumns: [processes.organizationId, processes.id], name: "document_processes_process_tenant_fk" }).onDelete("restrict")]).enableRLS();
export const documentTasks = pgTable("document_tasks", {
  documentId: uuid("document_id").notNull().references(() => documents.id, { onDelete: "restrict" }),
  taskId: uuid("task_id").notNull().references(() => tasks.id, { onDelete: "restrict" }),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "restrict" }),
}, (table) => [uniqueIndex("document_tasks_pk").on(table.documentId, table.taskId), index("document_tasks_task_id_idx").on(table.taskId), index("document_tasks_organization_id_idx").on(table.organizationId), foreignKey({ columns: [table.organizationId, table.documentId], foreignColumns: [documents.organizationId, documents.id], name: "document_tasks_document_tenant_fk" }).onDelete("restrict"), foreignKey({ columns: [table.organizationId, table.taskId], foreignColumns: [tasks.organizationId, tasks.id], name: "document_tasks_task_tenant_fk" }).onDelete("restrict")]).enableRLS();
export const documentOccurrences = pgTable("document_occurrences", {
  documentId: uuid("document_id").notNull().references(() => documents.id, { onDelete: "restrict" }),
  occurrenceId: uuid("occurrence_id").notNull().references(() => obligationOccurrences.id, { onDelete: "restrict" }),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "restrict" }),
}, (table) => [uniqueIndex("document_occurrences_pk").on(table.documentId, table.occurrenceId), index("document_occurrences_occurrence_id_idx").on(table.occurrenceId), index("document_occurrences_organization_id_idx").on(table.organizationId), foreignKey({ columns: [table.organizationId, table.documentId], foreignColumns: [documents.organizationId, documents.id], name: "document_occurrences_document_tenant_fk" }).onDelete("restrict"), foreignKey({ columns: [table.organizationId, table.occurrenceId], foreignColumns: [obligationOccurrences.organizationId, obligationOccurrences.id], name: "document_occurrences_occurrence_tenant_fk" }).onDelete("restrict")]).enableRLS();
