ALTER TABLE "products" ADD COLUMN "zip_key" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "zip_size_bytes" bigint;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "zip_generated_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "product_file_groups_product_name_uq" ON "product_file_groups" USING btree ("product_id","name");--> statement-breakpoint
CREATE INDEX "product_files_group_idx" ON "product_files" USING btree ("group_id");