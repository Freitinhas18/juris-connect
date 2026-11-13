CREATE TABLE "processes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enterprise_id" uuid NOT NULL,
	"name" text NOT NULL,
	"protocol" text DEFAULT '' NOT NULL,
	"process_type" text NOT NULL,
	"entity" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"manager" text NOT NULL,
	"start_date" text NOT NULL,
	"due_date" text NOT NULL,
	"priority" text NOT NULL,
	"stage" text NOT NULL,
	"status" text NOT NULL,
	"history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "processes" ADD CONSTRAINT "processes_enterprise_id_enterprises_id_fk" FOREIGN KEY ("enterprise_id") REFERENCES "public"."enterprises"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "processes_enterprise_id_idx" ON "processes" USING btree ("enterprise_id");