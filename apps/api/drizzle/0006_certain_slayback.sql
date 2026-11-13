CREATE TABLE "document_clients" (
	"document_id" uuid NOT NULL,
	"client_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_enterprises" (
	"document_id" uuid NOT NULL,
	"enterprise_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_occurrences" (
	"document_id" uuid NOT NULL,
	"occurrence_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_processes" (
	"document_id" uuid NOT NULL,
	"process_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_tasks" (
	"document_id" uuid NOT NULL,
	"task_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"original_name" text NOT NULL,
	"extension" text NOT NULL,
	"mime_type" text NOT NULL,
	"size" integer NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"category" text NOT NULL,
	"responsible" text NOT NULL,
	"status" text NOT NULL,
	"history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "document_clients" ADD CONSTRAINT "document_clients_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_clients" ADD CONSTRAINT "document_clients_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_enterprises" ADD CONSTRAINT "document_enterprises_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_enterprises" ADD CONSTRAINT "document_enterprises_enterprise_id_enterprises_id_fk" FOREIGN KEY ("enterprise_id") REFERENCES "public"."enterprises"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_occurrences" ADD CONSTRAINT "document_occurrences_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_occurrences" ADD CONSTRAINT "document_occurrences_occurrence_id_obligation_occurrences_id_fk" FOREIGN KEY ("occurrence_id") REFERENCES "public"."obligation_occurrences"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_processes" ADD CONSTRAINT "document_processes_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_processes" ADD CONSTRAINT "document_processes_process_id_processes_id_fk" FOREIGN KEY ("process_id") REFERENCES "public"."processes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_tasks" ADD CONSTRAINT "document_tasks_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_tasks" ADD CONSTRAINT "document_tasks_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "document_clients_pk" ON "document_clients" USING btree ("document_id","client_id");--> statement-breakpoint
CREATE INDEX "document_clients_client_id_idx" ON "document_clients" USING btree ("client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "document_enterprises_pk" ON "document_enterprises" USING btree ("document_id","enterprise_id");--> statement-breakpoint
CREATE INDEX "document_enterprises_enterprise_id_idx" ON "document_enterprises" USING btree ("enterprise_id");--> statement-breakpoint
CREATE UNIQUE INDEX "document_occurrences_pk" ON "document_occurrences" USING btree ("document_id","occurrence_id");--> statement-breakpoint
CREATE INDEX "document_occurrences_occurrence_id_idx" ON "document_occurrences" USING btree ("occurrence_id");--> statement-breakpoint
CREATE UNIQUE INDEX "document_processes_pk" ON "document_processes" USING btree ("document_id","process_id");--> statement-breakpoint
CREATE INDEX "document_processes_process_id_idx" ON "document_processes" USING btree ("process_id");--> statement-breakpoint
CREATE UNIQUE INDEX "document_tasks_pk" ON "document_tasks" USING btree ("document_id","task_id");--> statement-breakpoint
CREATE INDEX "document_tasks_task_id_idx" ON "document_tasks" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "documents_added_at_idx" ON "documents" USING btree ("added_at");--> statement-breakpoint
CREATE INDEX "documents_category_idx" ON "documents" USING btree ("category");