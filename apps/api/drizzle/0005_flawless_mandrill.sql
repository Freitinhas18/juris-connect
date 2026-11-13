CREATE TABLE "obligation_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"occurrence_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"delivered_at" text NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "obligation_occurrences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"obligation_id" uuid NOT NULL,
	"reference_period" text NOT NULL,
	"due_date" text NOT NULL,
	"status" text NOT NULL,
	"responsible_id" text NOT NULL,
	"completed_at" timestamp with time zone,
	"observations" text DEFAULT '' NOT NULL,
	"history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "obligations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"process_id" uuid NOT NULL,
	"reference" text DEFAULT '' NOT NULL,
	"authority" text DEFAULT '' NOT NULL,
	"responsible_id" text NOT NULL,
	"periodicity" text NOT NULL,
	"first_due_date" text NOT NULL,
	"requirements" text DEFAULT '' NOT NULL,
	"expected_evidence" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "obligation_evidence" ADD CONSTRAINT "obligation_evidence_occurrence_id_obligation_occurrences_id_fk" FOREIGN KEY ("occurrence_id") REFERENCES "public"."obligation_occurrences"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obligation_occurrences" ADD CONSTRAINT "obligation_occurrences_obligation_id_obligations_id_fk" FOREIGN KEY ("obligation_id") REFERENCES "public"."obligations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obligations" ADD CONSTRAINT "obligations_process_id_processes_id_fk" FOREIGN KEY ("process_id") REFERENCES "public"."processes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "obligation_evidence_occurrence_id_idx" ON "obligation_evidence" USING btree ("occurrence_id");--> statement-breakpoint
CREATE INDEX "obligation_occurrences_obligation_id_idx" ON "obligation_occurrences" USING btree ("obligation_id");--> statement-breakpoint
CREATE INDEX "obligation_occurrences_due_date_idx" ON "obligation_occurrences" USING btree ("due_date");--> statement-breakpoint
CREATE UNIQUE INDEX "obligation_occurrences_period_unique" ON "obligation_occurrences" USING btree ("obligation_id","reference_period");--> statement-breakpoint
CREATE INDEX "obligations_process_id_idx" ON "obligations" USING btree ("process_id");