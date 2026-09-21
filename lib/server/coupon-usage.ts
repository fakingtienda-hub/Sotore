import "server-only";

import { eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";

/**
 * Consume el cupón de una orden SOLO cuando la orden pasa a aprobada (no al
 * crearla). Idempotente y serializado: bloquea la fila del cupón (FOR UPDATE)
 * dentro de una transacción para que dos aprobaciones concurrentes del webhook
 * no incrementen `usedCount` dos veces. La BD además lo respalda con el
 * constraint único `UNIQUE(coupon_id, order_id)`.
 */
export async function claimCouponForApprovedOrder(orderId: string): Promise<void> {
  const [order] = await db
    .select({ couponId: schema.orders.couponId, userId: schema.orders.userId })
    .from(schema.orders)
    .where(eq(schema.orders.id, orderId))
    .limit(1);
  if (!order?.couponId) return;

  // Tipo estrecho: fuera del closure la BD sabe que couponId es nullable;
  // aquí ya garantizamos que existe.
  const couponId: string = order.couponId;
  const userId: string = order.userId;

  await db.transaction(async (tx) => {
    // Lock en la fila del cupón: los reclamos concurrentes se serializan aquí.
    const [coupon] = await tx
      .select({
        id: schema.coupons.id,
        usedCount: schema.coupons.usedCount,
        maxUses: schema.coupons.maxUses,
      })
      .from(schema.coupons)
      .where(eq(schema.coupons.id, couponId))
      .for("update");

    if (!coupon) return;

    // Idempotencia: si la orden ya consumió el cupón, no se vuelve a contar.
    const existing = await tx
      .select({ id: schema.couponUsages.id })
      .from(schema.couponUsages)
      .where(eq(schema.couponUsages.orderId, orderId))
      .limit(1);
    if (existing.length > 0) return;

    // Condicionado al cupo real leído bajo lock (no se sobrepasa maxUses).
    if (coupon.maxUses != null && coupon.usedCount >= coupon.maxUses) return;

    await tx
      .update(schema.coupons)
      .set({ usedCount: coupon.usedCount + 1 })
      .where(eq(schema.coupons.id, coupon.id));

    await tx
      .insert(schema.couponUsages)
      .values({ couponId, orderId, userId })
      .onConflictDoNothing();
  });
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
    await db.transaction(async (tx) => {
      const [coupon] = await tx
        .select({ id: schema.coupons.id })
        .from(schema.coupons)
        .where(eq(schema.coupons.id, row.couponId))
        .for("update");
      if (!coupon) return;
      await tx
        .update(schema.coupons)
        .set({ usedCount: sql`GREATEST(${schema.coupons.usedCount} - 1, 0)` })
        .where(eq(schema.coupons.id, coupon.id));
      await tx.delete(schema.couponUsages).where(eq(schema.couponUsages.id, row.id));
    });
  }
}