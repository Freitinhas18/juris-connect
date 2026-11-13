ALTER TABLE "sessions" ADD CONSTRAINT "sessions_membership_fk" FOREIGN KEY ("organization_id","user_id") REFERENCES "public"."organization_memberships"("organization_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "channels_organization_id_idx" ON "channels" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "clients_organization_id_idx" ON "clients" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "document_clients_organization_id_idx" ON "document_clients" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "document_enterprises_organization_id_idx" ON "document_enterprises" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "document_occurrences_organization_id_idx" ON "document_occurrences" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "document_processes_organization_id_idx" ON "document_processes" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "document_tasks_organization_id_idx" ON "document_tasks" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "documents_organization_id_idx" ON "documents" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "enterprises_organization_id_idx" ON "enterprises" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "messages_organization_id_idx" ON "messages" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "obligation_evidence_organization_id_idx" ON "obligation_evidence" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "obligation_occurrences_organization_id_idx" ON "obligation_occurrences" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "obligations_organization_id_idx" ON "obligations" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "processes_organization_id_idx" ON "processes" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "tasks_organization_id_idx" ON "tasks" USING btree ("organization_id");