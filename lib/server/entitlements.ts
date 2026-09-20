import "server-only";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";

/**
 * Garantiza el acceso a los productos de una orden aprobada (una fila por
 * ítem en `purchases`). Es idempotente y NO reinicia el reloj de
 * `minMinutesAfterPayment` de compras ya activas: solo crea las filas
 * faltantes (o reactiva las revocadas). Lo usan la aprobación vía webhook,
 * sus reintentos y la simulación demo, de modo que la entrega siempre corre
 * por el mismo camino.
 */
export async function ensureOrderEntitlements(orderId: string): Promise<{
  ok: boolean;
  granted: number;
  existing: number;
  reason?: string;
}> {
  const [order] = await db
    .select()
    .from(schema.orders)
    .where(eq(schema.orders.id, orderId))
    .limit(1);

  if (!order) {
    return { ok: false, granted: 0, existing: 0, reason: "La orden no existe." };
  }
  if (order.status !== "approved") {
    return { ok: false, granted: 0, existing: 0, reason: "La orden no está aprobada." };
  }

  const items = await db
    .select()
    .from(schema.orderItems)
    .where(eq(schema.orderItems.orderId, order.id));

  let granted = 0;
  let existing = 0;
  for (const item of items) {
    const active = await db
      .select({ id: schema.purchases.id })
      .from(schema.purchases)
      .where(
        and(
          eq(schema.purchases.userId, order.userId),
          eq(schema.purchases.productId, item.productId),
          eq(schema.purchases.status, "active"),
        ),
      )
      .limit(1);
    if (active.length > 0) {
      existing += 1;
      continue;
    }
    await db
      .insert(schema.purchases)
      .values({
        userId: order.userId,
        productId: item.productId,
        orderId: order.id,
        status: "active",
        grantedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [schema.purchases.userId, schema.purchases.productId],
        set: { status: "active", revokedAt: null, grantedAt: new Date() },
      });
    granted += 1;
  }

  revalidatePath("/library");
  return { ok: true, granted, existing };
}

/**
 * Revoca el acceso a los productos de una orden (reembolso / pago revertido).
 * No borra filas: marca `revoked` para conservar el historial.
 */
export async function revokeOrderEntitlements(orderId: string): Promise<void> {
  await db
    .update(schema.purchases)
    .set({ status: "revoked", revokedAt: new Date() })
    .where(eq(schema.purchases.orderId, orderId));
  revalidatePath("/library");
}

/** Devuelve la purchase activa de un usuario para un producto, si existe. */
export async function getActivePurchase(
  userId: string,
  productId: string,
): Promise<schema.Purchase | null> {
  const rows = await db
    .select()
    .from(schema.purchases)
    .where(
      and(
        eq(schema.purchases.userId, userId),
        eq(schema.purchases.productId, productId),
        eq(schema.purchases.status, "active"),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}