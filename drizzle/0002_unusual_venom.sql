ALTER TABLE "attachments" ADD COLUMN "upload_key" text;--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN "upload_hash" text;--> statement-breakpoint
CREATE UNIQUE INDEX "attachment_upload_unique" ON "attachments" USING btree ("user_id","upload_key");