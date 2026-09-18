import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "../lib/db/schema";

const databaseUrl = process.env.DATABASE_URL!;
const queryClient = postgres(databaseUrl, { prepare: false });
const db = drizzle(queryClient, { schema, casing: "snake_case" });

const EMAIL = process.env.FASE9_EMAIL ?? "fase9-e2e@fakingstore.com";
const SLUG = "pack-costura-pro";

let failed = 0;
function check(label: string, cond: boolean, extra = "") {
  console.log(`${cond ? "PASS" : "FAIL"} - ${label}${extra ? ` (${extra})` : ""}`);
  if (!cond) failed += 1;
}

async function main() {
  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, EMAIL)).limit(1);
  check("cliente guest creado", !!user, user?.id ?? "n/a");

  const [product] = await db.select().from(schema.products).where(eq(schema.products.slug, SLUG)).limit(1);
  check("producto existe", !!product, product?.id ?? "n/a");

  if (user) {
    const orders = await db.select().from(schema.orders).where(eq(schema.orders.userId, user.id));
    check("exactamente 1 orden", orders.length === 1, `count=${orders.length}`);
    const order = orders[0];
    if (order) {
      check("orden approved", order.status === "approved", order.status);
      check("gateway=demo", order.gateway === "demo", String(order.gateway));
      check("paidAt definido", order.paidAt != null);

      const purchases = await db.select().from(schema.purchases).where(eq(schema.purchases.userId, user.id));
      check("1 purchase activa", purchases.length === 1 && purchases[0].status === "active", `count=${purchases.length}`);
      if (purchases[0]) {
        check("purchase->product", product?.id != null && purchases[0].productId === product.id, purchases[0].productId);
        check("purchase->order", order.id === purchases[0].orderId, "ok");
      }

      if (product) {
        const [file] = await db.select().from(schema.productFiles).where(eq(schema.productFiles.productId, product.id)).limit(1);
        check("product_file de fixture", !!file, file?.name ?? "n/a");
        if (file) {
          const downloads = await db.select().from(schema.downloads).where(eq(schema.downloads.fileId, file.id));
          check("descarga registrada", downloads.length >= 1, `count=${downloads.length}`);
          if (downloads[0]) {
            check("download->purchase", downloads[0].purchaseId === purchases[0]?.id, downloads[0].purchaseId ?? "");
            check("download->user", downloads[0].userId === user.id, "ok");
          }
        }
      }
    }

    // Cleanup E2E data (mantiene producto + archivo como demo data)
    const userPurchases = await db.select().from(schema.purchases).where(eq(schema.purchases.userId, user.id));
    await db.delete(schema.downloads).where(eq(schema.downloads.userId, user.id));
    for (const p of userPurchases) {
      await db.delete(schema.purchases).where(eq(schema.purchases.id, p.id));
    }
    for (const o of orders) {
      await db.delete(schema.orderItems).where(eq(schema.orderItems.orderId, o.id));
      await db.delete(schema.orders).where(eq(schema.orders.id, o.id));
    }
    await db.delete(schema.users).where(eq(schema.users.id, user.id));
  }

  const leftoverUsers = await db.select().from(schema.users).where(eq(schema.users.email, EMAIL));
  check("limpieza BD completa", leftoverUsers.length === 0);

  console.log(failed === 0 ? "ALL PASS" : `${failed} FAILURES`);
  await queryClient.end();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});