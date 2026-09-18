import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "../lib/db/schema";

const databaseUrl = process.env.DATABASE_URL!;
const queryClient = postgres(databaseUrl, { prepare: false });
const db = drizzle(queryClient, { schema, casing: "snake_case" });

const EMAIL = process.env.FASE11_EMAIL ?? "fase11-crm@fakingstore.com";
const SLUG = "pack-costura-pro";

let failed = 0;
function check(label: string, cond: boolean, extra = "") {
  console.log(`${cond ? "PASS" : "FAIL"} - ${label}${extra ? ` (${extra})` : ""}`);
  if (!cond) failed += 1;
}

async function main() {
  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, EMAIL)).limit(1);
  check("cliente CRM creado", !!user, user?.id ?? "n/a");

  if (user) {
    const orders = await db.select().from(schema.orders).where(eq(schema.orders.userId, user.id));
    check("al menos 1 orden", orders.length >= 1, `count=${orders.length}`);
    const approved = orders.filter((o) => o.status === "approved").length;
    check("orden aprobada (ingreso para CRM)", approved >= 1, `approved=${approved}`);

    const [product] = await db.select().from(schema.products).where(eq(schema.products.slug, SLUG)).limit(1);
    if (product) {
      const purchases = await db.select().from(schema.purchases).where(eq(schema.purchases.userId, user.id));
      check("purchase activa", purchases.length >= 1 && purchases.some((p) => p.productId === product.id && p.status === "active"), `count=${purchases.length}`);
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