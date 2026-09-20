import "server-only";

import { and, eq, isNull, lt, or, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";

/**
 * Consume el cupón de una orden SOLO cuando la orden pasa a aprobada (no al
 * crearla). Idempotente: si el `coupon_usages` de la orden ya existe, no hace
 * nada (evita dobles incrementos ante reintentos del webhook).
 */
export async function claimCouponForApprovedOrder(orderId: string): Promise<void> {
  const [order] = await db
    .select({ couponId: schema.orders.couponId, userId: schema.orders.userId })
    .from(schema.orders)
    .where(eq(schema.orders.id, orderId))
    .limit(1);
  if (!order?.couponId) return;

  const existing = await db
    .select({ id: schema.couponUsages.id })
    .from(schema.couponUsages)
    .where(eq(schema.couponUsages.orderId, orderId))
    .limit(1);
  if (existing.length > 0) return;

  // Incremento atómico condicionado al cupo (no se puede sobrepasar maxUses
  // aunque lleguen dos aprobaciones concurrentes).
  await db
    .update(schema.coupons)
    .set({ usedCount: sql`${schema.coupons.usedCount} + 1` })
    .where(
      and(
        eq(schema.coupons.id, order.couponId),
        or(
          isNull(schema.coupons.maxUses),
          lt(schema.coupons.usedCount, schema.coupons.maxUses),
        ),
      ),
    );

  await db
    .insert(schema.couponUsages)
    .values({ couponId: order.couponId, orderId, userId: order.userId })
    .onConflictDoNothing();
}

/**
 * Libera el uso de cupón de una orden cuando esta llega a un estado terminal
 * posterior a una aprobación (VOIDED/DECLINED/ERROR tras approved). Idempotente.
 */
export async function releaseCouponForOrder(orderId: string): Promise<void> {
  const rows = await db
    .select({ id: schema.couponUsages.id, couponId: schema.couponUsages.couponId })
    .from(schema.couponUsages)
    .where(eq(schema.couponUsages.orderId, orderId));

  if (rows.length === 0) return;

  for (const row of rows) {
    await db
      .update(schema.coupons)
      .set({ usedCount: sql`GREATEST(${schema.coupons.usedCount} - 1, 0)` })
      .where(eq(schema.coupons.id, row.couponId));
    await db.delete(schema.couponUsages).where(eq(schema.couponUsages.id, row.id));
  }
}