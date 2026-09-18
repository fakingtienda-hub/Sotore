import "server-only";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";

/**
 * Fase 9 — Entrega automática.
 *
 * Concede acesso a los productos de una orden aprobada creando las filas de
 * `purchases` (una por ítem). Es idempotente: si el usuario ya tiene una compra
 * activa del mismo producto, la reactiva sin duplicar (índice único
 * `purchases_user_product_idx`).
 *
 * Lo usan tanto la aprobación vía webhook de Wompi (Fase 8) como la simulación
 * demo (Fase 7), de modo que la entrega siempre corra por el mismo camino.
 */
export async function grantOrderEntitlements(orderId: string): Promise<{
  ok: boolean;
  granted: number;
  reason?: string;
}> {
  const [order] = await db
    .select()
    .from(schema.orders)
    .where(eq(schema.orders.id, orderId))
    .limit(1);

  if (!order) {
    return { ok: false, granted: 0, reason: "La orden no existe." };
  }
  if (order.status !== "approved") {
    return { ok: false, granted: 0, reason: "La orden no está aprobada." };
  }

  const items = await db
    .select()
    .from(schema.orderItems)
    .where(eq(schema.orderItems.orderId, order.id));

  let granted = 0;
  for (const item of items) {
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
  return { ok: true, granted };
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