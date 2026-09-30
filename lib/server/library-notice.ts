import "server-only";

import { and, desc, eq, gte, inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";

/** Ventana hacia atrás para considerar "reciente" una orden en el banner. */
const RECENT_WINDOW_DAYS = 7;

export type LibraryOrderNotice =
  | {
      kind: "delivering";
      orderCode: string;
      titles: string[];
      since: Date;
    }
  | {
      kind: "confirming";
      orderCode: string;
      titles: string[];
      since: Date;
    };

/**
 * Qué le está pasando a las órdenes recientes de este usuario que todavía no
 * ve en su biblioteca.
 *
 * Sin esto, un cliente que pagó y cuya entrega se retrasó entra a `/library` y
 * lee "Aún no tienes productos en tu biblioteca. Ir a la tienda" — la app le
 * pide que pague dos veces. Aquí se distingue ese caso:
 *
 *   - `delivering`: orden `approved` pero sin compra activa de sus productos.
 *     El pago entró; estamos activando el acceso. Se está reparando.
 *   - `confirming`: orden `pending` reciente; aún no sabemos si el pago entró.
 *
 * Solo mira órdenes recientes: un pago perdido de hace meses no se arregla con
 * un banner, se arregla con soporte humano.
 */
export async function getLibraryOrderNotice(userId: string): Promise<LibraryOrderNotice | null> {
  const since = new Date(Date.now() - RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const orders = await db
    .select({
      id: schema.orders.id,
      code: schema.orders.code,
      status: schema.orders.status,
      paidAt: schema.orders.paidAt,
      createdAt: schema.orders.createdAt,
    })
    .from(schema.orders)
    .where(
      and(
        eq(schema.orders.userId, userId),
        inArray(schema.orders.status, ["approved", "pending"]),
        gte(schema.orders.createdAt, since),
      ),
    )
    .orderBy(desc(schema.orders.createdAt))
    .limit(10);

  for (const order of orders) {
    const items = await db
      .select({ productId: schema.orderItems.productId })
      .from(schema.orderItems)
      .where(eq(schema.orderItems.orderId, order.id));
    if (items.length === 0) continue;

    const productIds = items.map((i) => i.productId);
    const active = await db
      .select({ productId: schema.purchases.productId })
      .from(schema.purchases)
      .where(
        and(
          eq(schema.purchases.userId, userId),
          eq(schema.purchases.status, "active"),
          inArray(schema.purchases.productId, productIds),
        ),
      );
    const activeIds = new Set(active.map((p) => p.productId));
    // Si ya tiene todo activo, esta orden no es un problema: sigue el bucle por
    // si hay otra más reciente sin entregar.
    if (productIds.every((id) => activeIds.has(id))) continue;

    const titles = await resolveTitles(productIds);

    if (order.status === "approved") {
      return { kind: "delivering", orderCode: order.code, titles, since: order.paidAt ?? order.createdAt };
    }
    // `pending` cuya ventana de pago ya venció solo se confirma al tocar la
    // orden; aquí solo avisamos si es reciente de verdad.
    if (order.createdAt.getTime() + 24 * 60 * 60 * 1000 > Date.now()) {
      return { kind: "confirming", orderCode: order.code, titles, since: order.createdAt };
    }
  }

  return null;
}

async function resolveTitles(productIds: string[]): Promise<string[]> {
  if (productIds.length === 0) return [];
  const rows = await db
    .select({ title: schema.products.title })
    .from(schema.products)
    .where(inArray(schema.products.id, productIds));
  return rows.map((r) => r.title);
}
