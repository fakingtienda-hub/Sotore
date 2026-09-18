CREATE TABLE "product_file_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "product_files" ADD COLUMN "group_id" uuid;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "theme" varchar(20) DEFAULT 'costura' NOT NULL;--> statement-breakpoint
ALTER TABLE "product_file_groups" ADD CONSTRAINT "product_file_groups_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_file_groups_product_idx" ON "product_file_groups" USING btree ("product_id");--> statement-breakpoint
ALTER TABLE "product_files" ADD CONSTRAINT "product_files_group_id_product_file_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."product_file_groups"("id") ON DELETE set null ON UPDATE no action;