ALTER TABLE "coupons" ALTER COLUMN "value" SET DATA TYPE integer USING ROUND(value)::integer;--> statement-breakpoint
ALTER TABLE "order_items" ALTER COLUMN "unit_price" SET DATA TYPE integer USING ROUND(unit_price)::integer;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "subtotal" SET DATA TYPE integer USING ROUND(subtotal)::integer;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "discount" SET DATA TYPE integer USING ROUND(discount)::integer;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "total" SET DATA TYPE integer USING ROUND(total)::integer;--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "price" SET DATA TYPE integer USING ROUND(price)::integer;--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "compare_at_price" SET DATA TYPE integer USING ROUND(compare_at_price)::integer;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "owner_token" varchar(64);