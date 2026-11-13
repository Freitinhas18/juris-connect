CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"process_id" uuid NOT NULL,
	"assignee_id" text NOT NULL,
	"status" text NOT NULL,
	"priority" text NOT NULL,
	"start_date" text DEFAULT '' NOT NULL,
	"due_date" text DEFAULT '' NOT NULL,
	"completed_at" timestamp with time zone,
	"subtasks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"transfers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"wait_periods" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_process_id_processes_id_fk" FOREIGN KEY ("process_id") REFERENCES "public"."processes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tasks_process_id_idx" ON "tasks" USING btree ("process_id");