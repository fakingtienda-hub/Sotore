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

export function orderExpiresAt(now: Date = new Date()): Date {
  return new Date(now.getTime() + ORDER_EXPIRY_MS);
}

/** Pasa a `expired` todas las órdenes pendientes con `expiresAt` vencido. */
export async function expireStalePendingOrders(): Promise<number> {
  const expired = await db
    .update(schema.orders)
    .set({ status: "expired", updatedAt: new Date() })
    .where(and(eq(schema.orders.status, "pending"), lt(schema.orders.expiresAt, new Date())))
    .returning({ id: schema.orders.id });
  return expired.length;
}