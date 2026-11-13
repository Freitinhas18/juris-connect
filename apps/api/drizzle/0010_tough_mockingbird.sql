CREATE UNIQUE INDEX "channels_organization_id_unique" ON "channels" USING btree ("organization_id","id");--> statement-breakpoint
CREATE TABLE "channel_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"channel_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "channel_memberships" ADD CONSTRAINT "channel_memberships_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_memberships" ADD CONSTRAINT "channel_memberships_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_memberships" ADD CONSTRAINT "channel_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_memberships" ADD CONSTRAINT "channel_memberships_channel_tenant_fk" FOREIGN KEY ("organization_id","channel_id") REFERENCES "public"."channels"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_memberships" ADD CONSTRAINT "channel_memberships_org_member_fk" FOREIGN KEY ("organization_id","user_id") REFERENCES "public"."organization_memberships"("organization_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "channel_memberships_channel_user_unique" ON "channel_memberships" USING btree ("channel_id","user_id");--> statement-breakpoint
CREATE INDEX "channel_memberships_org_user_idx" ON "channel_memberships" USING btree ("organization_id","user_id");
