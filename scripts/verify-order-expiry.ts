import "dotenv/config";

import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";

import { db } from "../lib/db";
import {
  expireStalePendingOrders,
  orderExpiresAt,
} from "../lib/server/order-expiry";
import * as schema from "../lib/db/schema";

let failures = 0;

function assert(name: string, ok: boolean) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) failures += 1;
}

async function main() {
  const [user] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .limit(1);
  if (!user) {
    throw new Error("No hay usuarios en la BD; corre `npm run db:seed` antes.");
  }

  const staleId = randomUUID();
  const freshId = randomUUID();
  const stamp = Date.now().toString(36).toUpperCase().slice(-5);

  try {
    const staleCode = `VS-${stamp}-STALE`;
    const freshCode = `VS-${stamp}-FRESH`;
    await db.insert(schema.orders).values([
      {
        id: staleId,
        code: staleCode,
        userId: user.id,
        status: "pending",
        subtotal: 100,
        discount: 0,
        total: 100,
        currency: "COP",
        expiresAt: new Date(Date.now() - 1000),
      },
      {
        id: freshId,
        code: freshCode,
        userId: user.id,
        status: "pending",
        subtotal: 100,
        discount: 0,
        total: 100,
        currency: "COP",
        expiresAt: orderExpiresAt(),
      },
    ]);

    const expiredCount = await expireStalePendingOrders();

    const [stale] = await db
      .select({ status: schema.orders.status })
      .from(schema.orders)
      .where(eq(schema.orders.id, staleId));
    const [fresh] = await db
      .select({ status: schema.orders.status })
      .from(schema.orders)
      .where(eq(schema.orders.id, freshId));

    assert("la orden vencida pasa a `expired`", stale?.status === "expired");
    assert("la orden vigente sigue `pending`", fresh?.status === "pending");
    assert(
      "expireStalePendingOrders reporta exactamente 1 vencida",
      expiredCount === 1,
    );
  } finally {
    await db.delete(schema.orders).where(eq(schema.orders.id, staleId));
    await db.delete(schema.orders).where(eq(schema.orders.id, freshId));
  }

  if (failures > 0) {
    console.error(`\n${failures} verificación(es) FALLARON`);
    process.exit(1);
  }
  console.log("\nCaducidad de órdenes pendientes verificado (Fase 3).");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });