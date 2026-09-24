import "dotenv/config";

import { eq, isNull } from "drizzle-orm";
import { randomBytes } from "node:crypto";

import { db } from "../lib/db";
import * as schema from "../lib/db/schema";

/**
 * backfill-order-tokens.ts
 * ========================
 * Emite `owner_token` a todas las órdenes legadas (creadas antes del control
 * de titularidad) que aún no tienen uno. IDEMPOTENTE: solo toca filas con
 * `ownerToken IS NULL`.
 *
 * Motivo: como el auto-heal se eliminó (reclamaba órdenes ajenas con solo
 * adivinar el código), las órdenes sin token quedan inaccesibles. Este script
 * rellena el token de forma predecible a nivel de fila; el acceso real sigue
 * exigiéndose después con la cookie de titularidad emitida al crear la orden.
 * Para una orden pendiente ya creada antes de este fix, su comprador podrá
 * recuperarla recreando el checkout (nueva orden con su propio token).
 *
 * NO imprime tokens (solo el recuento). Corre: npx tsx scripts/backfill-order-tokens.ts
 */
async function main() {
  const orders = await db
    .select({ id: schema.orders.id })
    .from(schema.orders)
    .where(isNull(schema.orders.ownerToken));

  const total = orders.length;
  if (total === 0) {
    console.log("No hay órdenes sin owner_token. Nada que hacer.");
    return;
  }

  for (const { id } of orders) {
    await db
      .update(schema.orders)
      .set({ ownerToken: randomBytes(24).toString("base64url") })
      .where(eq(schema.orders.id, id));
  }

  console.log(`backfill completo: ${total} órdenes recibieron owner_token.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });