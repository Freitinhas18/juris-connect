CREATE TABLE "enterprises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"activity" text NOT NULL,
	"document" text DEFAULT '' NOT NULL,
	"address" text NOT NULL,
	"municipality" text NOT NULL,
	"state" text NOT NULL,
	"manager" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"related_cases" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "enterprises" ADD CONSTRAINT "enterprises_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "enterprises_client_id_idx" ON "enterprises" USING btree ("client_id");