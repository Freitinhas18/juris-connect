ALTER TABLE "channels" DROP CONSTRAINT "channels_name_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "channels_organization_name_unique" ON "channels" USING btree ("organization_id","name");