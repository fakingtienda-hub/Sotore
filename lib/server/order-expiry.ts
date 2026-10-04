import { and, eq, lt } from "drizzle-orm";

import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";

/**
 * Ciclo de vida de órdenes pendientes de pago.
 *
 * Las órdenes `pending` sin pagar caducan (C3/ALTO: antes no expiraban nunca y
 * los estados terminales eran inalcanzables). No hay cron: se expiran de forma
 * reactiva ("lazy") en cada entrada del flujo (webhook, init de pago, consulta
 * de estado), que es cuando el comprador o la pasarela tocan la orden.
 */
export const ORDER_EXPIRY_MS = 24 * 60 * 60 * 1000;

/** Ventana mínima entre barridos dentro de una misma instancia.
 *
 *  La caducidad es perezosa y depende solo del reloj, así que saltarse un
 *  barrido dentro de esta ventana no altera el resultado final: la orden se
 *  expira en el siguiente. Evita repetir el UPDATE en cada sondeo del estado
 *  de pago (`getCheckoutOrderStatus`), en cada reintento de `payment/init` y en
 *  cada webhook. */
const SWEEP_MIN_INTERVAL_MS = 30_000;

let lastSweepAt = 0;

export function orderExpiresAt(now: Date = new Date()): Date {
  return new Date(now.getTime() + ORDER_EXPIRY_MS);
}

/** Pasa a `expired` todas las órdenes pendientes con `expiresAt` vencido.
 *
 *  Con `{ force: true }` ignora el throttle; lo usa la reconciliación, donde
 *  el conteo alimenta el reporte y no debe saltarse. */
export async function expireStalePendingOrders(opts?: { force?: boolean }): Promise<number> {
  const now = Date.now();
  if (!opts?.force && now - lastSweepAt < SWEEP_MIN_INTERVAL_MS) return 0;
  lastSweepAt = now;

  const expired = await db
    .update(schema.orders)
    .set({ status: "expired", updatedAt: new Date() })
    .where(and(eq(schema.orders.status, "pending"), lt(schema.orders.expiresAt, new Date())))
    .returning({ id: schema.orders.id });
  return expired.length;
}

/** Expira UNA orden concreta si ya venció.
 *
 *  El throttle del barrido no debe permitir cobrar una orden vencida, así que
 *  el camino de pago comprueba la orden puntual antes de continuar. Es un
 *  UPDATE idempotente: si la orden ya no está `pending` o aún no vence, no
 *  cambia nada. */
export async function expireOrderIfStale(orderId: string): Promise<void> {
  await db
    .update(schema.orders)
    .set({ status: "expired", updatedAt: new Date() })
    .where(
      and(
        eq(schema.orders.id, orderId),
        eq(schema.orders.status, "pending"),
        lt(schema.orders.expiresAt, new Date()),
      ),
    );
}