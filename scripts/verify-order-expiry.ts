import "dotenv/config";

import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";

import { db } from "../lib/db";
import {
  expireOrderIfStale,
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

  const stamp = Date.now().toString(36).toUpperCase().slice(-5);
  const created: string[] = [];

  async function insertPending(code: string, expiresAt: Date): Promise<string> {
    const id = randomUUID();
    created.push(id);
    await db.insert(schema.orders).values({
      id,
      code,
      userId: user.id,
      status: "pending",
      subtotal: 100,
      discount: 0,
      total: 100,
      currency: "COP",
      expiresAt,
    });
    return id;
  }

  async function statusOf(id: string): Promise<string | undefined> {
    const [row] = await db
      .select({ status: schema.orders.status })
      .from(schema.orders)
      .where(eq(schema.orders.id, id));
    return row?.status;
  }

  try {
    // --- Barrido: expira las vencidas y respeta las vigentes ---------------
    const staleId = await insertPending(`VS-${stamp}-STALE`, new Date(Date.now() - 1000));
    const freshId = await insertPending(`VS-${stamp}-FRESH`, orderExpiresAt());

    const expiredCount = await expireStalePendingOrders();

    assert("la orden vencida pasa a `expired`", (await statusOf(staleId)) === "expired");
    assert("la orden vigente sigue `pending`", (await statusOf(freshId)) === "pending");
    assert("expireStalePendingOrders reporta exactamente 1 vencida", expiredCount === 1);

    // --- Throttle: una llamada inmediata posterior NO vuelve a barrer ------
    const throttledId = await insertPending(`VS-${stamp}-THROTTLE`, new Date(Date.now() - 1000));
    const throttledCount = await expireStalePendingOrders();

    assert("el barrido repetido se salta por el throttle", throttledCount === 0);
    assert(
      "la orden vencida sigue `pending` mientras dure el throttle",
      (await statusOf(throttledId)) === "pending",
    );

    // --- `force` ignora el throttle (lo usa la reconciliación) -------------
    const forcedCount = await expireStalePendingOrders({ force: true });

    assert("`force` barre aunque el throttle esté vigente", forcedCount === 1);
    assert("la orden vencida pasa a `expired` con `force`", (await statusOf(throttledId)) === "expired");

    // --- Expiración puntual del camino de pago -----------------------------
    const singleStaleId = await insertPending(`VS-${stamp}-ONE`, new Date(Date.now() - 1000));
    const singleFreshId = await insertPending(`VS-${stamp}-ONEF`, orderExpiresAt());

    await expireOrderIfStale(singleStaleId);
    await expireOrderIfStale(singleFreshId);

    assert("expireOrderIfStale expira la orden vencida", (await statusOf(singleStaleId)) === "expired");
    assert("expireOrderIfStale no toca la orden vigente", (await statusOf(singleFreshId)) === "pending");
  } finally {
    for (const id of created) {
      await db.delete(schema.orders).where(eq(schema.orders.id, id));
    }
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
