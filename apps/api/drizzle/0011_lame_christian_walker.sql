CREATE UNIQUE INDEX "clients_organization_id_id_unique" ON "clients" USING btree ("organization_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "documents_organization_id_id_unique" ON "documents" USING btree ("organization_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "enterprises_organization_id_id_unique" ON "enterprises" USING btree ("organization_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "obligation_occurrences_organization_id_id_unique" ON "obligation_occurrences" USING btree ("organization_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "obligations_organization_id_id_unique" ON "obligations" USING btree ("organization_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "processes_organization_id_id_unique" ON "processes" USING btree ("organization_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "tasks_organization_id_id_unique" ON "tasks" USING btree ("organization_id","id");
--> statement-breakpoint
ALTER TABLE "document_clients" ADD CONSTRAINT "document_clients_document_tenant_fk" FOREIGN KEY ("organization_id","document_id") REFERENCES "public"."documents"("organization_id","id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "document_clients" ADD CONSTRAINT "document_clients_client_tenant_fk" FOREIGN KEY ("organization_id","client_id") REFERENCES "public"."clients"("organization_id","id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "document_enterprises" ADD CONSTRAINT "document_enterprises_document_tenant_fk" FOREIGN KEY ("organization_id","document_id") REFERENCES "public"."documents"("organization_id","id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "document_enterprises" ADD CONSTRAINT "document_enterprises_enterprise_tenant_fk" FOREIGN KEY ("organization_id","enterprise_id") REFERENCES "public"."enterprises"("organization_id","id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "document_occurrences" ADD CONSTRAINT "document_occurrences_document_tenant_fk" FOREIGN KEY ("organization_id","document_id") REFERENCES "public"."documents"("organization_id","id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "document_occurrences" ADD CONSTRAINT "document_occurrences_occurrence_tenant_fk" FOREIGN KEY ("organization_id","occurrence_id") REFERENCES "public"."obligation_occurrences"("organization_id","id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "document_processes" ADD CONSTRAINT "document_processes_document_tenant_fk" FOREIGN KEY ("organization_id","document_id") REFERENCES "public"."documents"("organization_id","id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "document_processes" ADD CONSTRAINT "document_processes_process_tenant_fk" FOREIGN KEY ("organization_id","process_id") REFERENCES "public"."processes"("organization_id","id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "document_tasks" ADD CONSTRAINT "document_tasks_document_tenant_fk" FOREIGN KEY ("organization_id","document_id") REFERENCES "public"."documents"("organization_id","id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "document_tasks" ADD CONSTRAINT "document_tasks_task_tenant_fk" FOREIGN KEY ("organization_id","task_id") REFERENCES "public"."tasks"("organization_id","id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "enterprises" ADD CONSTRAINT "enterprises_client_tenant_fk" FOREIGN KEY ("organization_id","client_id") REFERENCES "public"."clients"("organization_id","id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_channel_tenant_fk" FOREIGN KEY ("organization_id","channel_id") REFERENCES "public"."channels"("organization_id","id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_author_tenant_fk" FOREIGN KEY ("organization_id","author_id") REFERENCES "public"."organization_memberships"("organization_id","user_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "obligation_evidence" ADD CONSTRAINT "obligation_evidence_occurrence_tenant_fk" FOREIGN KEY ("organization_id","occurrence_id") REFERENCES "public"."obligation_occurrences"("organization_id","id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "obligation_occurrences" ADD CONSTRAINT "obligation_occurrences_obligation_tenant_fk" FOREIGN KEY ("organization_id","obligation_id") REFERENCES "public"."obligations"("organization_id","id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "obligations" ADD CONSTRAINT "obligations_process_tenant_fk" FOREIGN KEY ("organization_id","process_id") REFERENCES "public"."processes"("organization_id","id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "processes" ADD CONSTRAINT "processes_enterprise_tenant_fk" FOREIGN KEY ("organization_id","enterprise_id") REFERENCES "public"."enterprises"("organization_id","id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_process_tenant_fk" FOREIGN KEY ("organization_id","process_id") REFERENCES "public"."processes"("organization_id","id") ON DELETE restrict ON UPDATE no action;
