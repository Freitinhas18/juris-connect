ALTER TABLE "channel_memberships" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "channel_memberships_tenant_isolation" ON "channel_memberships" USING ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "channels" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "channels_tenant_isolation" ON "channels" USING ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "clients" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "clients_tenant_isolation" ON "clients" USING ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "document_clients" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "document_clients_tenant_isolation" ON "document_clients" USING ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "document_enterprises" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "document_enterprises_tenant_isolation" ON "document_enterprises" USING ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "document_occurrences" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "document_occurrences_tenant_isolation" ON "document_occurrences" USING ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "document_processes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "document_processes_tenant_isolation" ON "document_processes" USING ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "document_tasks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "document_tasks_tenant_isolation" ON "document_tasks" USING ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "documents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "documents_tenant_isolation" ON "documents" USING ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "enterprises" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "enterprises_tenant_isolation" ON "enterprises" USING ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "messages_tenant_isolation" ON "messages" USING ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "obligation_evidence" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "obligation_evidence_tenant_isolation" ON "obligation_evidence" USING ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "obligation_occurrences" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "obligation_occurrences_tenant_isolation" ON "obligation_occurrences" USING ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "obligations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "obligations_tenant_isolation" ON "obligations" USING ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "organization_audit_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "organization_audit_events_tenant_isolation" ON "organization_audit_events" USING ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "processes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "processes_tenant_isolation" ON "processes" USING ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "tasks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tasks_tenant_isolation" ON "tasks" USING ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid);
