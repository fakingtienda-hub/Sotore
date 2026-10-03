import "server-only";

import { and, eq, exists, gte, inArray, not, or, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { type OrderFlag } from "@/lib/constants";
import { IGNORED_REASON_AMOUNT_MISMATCH } from "@/lib/server/order-approval";

/**
 * Definición única de qué es una orden "anómala", es decir, una que requiere
 * intervención humana. La consumen el listado de ventas, el dashboard y la
 * reconciliación, de modo que el panel y el script nunca discrepen sobre qué
 * está mal.
 *
 * Las etiquetas y el tipo viven en `lib/constants` (sin `server-only`) para que
 * las puedan importar también los componentes cliente del panel; aquí sólo está
 * la lógica de consulta.
 *
 * OJO con `undelivered`: "no hay fila en `purchases`" NO es anomalía. Un
 * cliente que ya tenía el producto no genera fila nueva (`ensureOrderEntitlements`
 * la omite a propósito). El síntoma real es no tener compra ACTIVA, y eso es
 * exactamente lo que se comprueba aquí.
 */

/** Órdenes `approved` revisadas al buscar entregas pendientes. */
export const UNDELIVERED_SCAN_DAYS = 30;

/* ---------------------------------------------------------------------------
 * Predicados SQL reutilizables
 * ------------------------------------------------------------------------- */

/** `gatewayPayload.ignoredReason` presente: el pago no cuadró con la orden. */
export function hasIgnoredReason() {
  return sql`${schema.orders.gatewayPayload}->>'ignoredReason' IS NOT NULL`;
}

/**
 * La orden tiene al menos un producto del que el comprador NO tiene compra
 * activa. `NOT EXISTS` sobre `purchases` (user + product + status) refleja
 * exactamente lo que decide `ensureOrderEntitlements`.
 */
export function hasUndeliveredProduct() {
  const undeliveredItem = db
    .select({ one: sql`1` })
    .from(schema.orderItems)
    .where(
      and(
        eq(schema.orderItems.orderId, schema.orders.id),
        not(
          exists(
            db
              .select({ one: sql`1` })
              .from(schema.purchases)
              .where(
                and(
                  eq(schema.purchases.userId, schema.orders.userId),
                  eq(schema.purchases.productId, schema.orderItems.productId),
                  eq(schema.purchases.status, "active"),
                ),
              ),
          ),
        ),
      ),
    );
  return exists(undeliveredItem);
}

/* ---------------------------------------------------------------------------
 * Cálculo de flags
 * ------------------------------------------------------------------------- */

/**
 * Flags de un conjunto concreto de órdenes (normalmente la página visible).
 * Todo en dos consultas: una por `orderItems` y otra por `purchases`, sin N+1.
 */
export async function getFlagsForOrders(
  orders: { id: string; userId: string; status: string; paidAt: Date | null; gatewayPayload: unknown }[],
): Promise<Map<string, OrderFlag[]>> {
  const flags = new Map<string, OrderFlag[]>();
  if (orders.length === 0) return flags;

  const orderIds = orders.map((o) => o.id);
  const items = await db
    .select({ orderId: schema.orderItems.orderId, productId: schema.orderItems.productId })
    .from(schema.orderItems)
    .where(inArray(schema.orderItems.orderId, orderIds));

  const productIds = [...new Set(items.map((i) => i.productId))];
  const active = productIds.length
    ? await db
        .select({ userId: schema.purchases.userId, productId: schema.purchases.productId })
        .from(schema.purchases)
        .where(
          and(
            inArray(schema.purchases.productId, productIds),
            eq(schema.purchases.status, "active"),
          ),
        )
    : [];
  const activeByUser = new Map<string, Set<string>>();
  for (const p of active) {
    const set = activeByUser.get(p.userId) ?? new Set<string>();
    set.add(p.productId);
    activeByUser.set(p.userId, set);
  }

  // Ventana de escaneo: una orden cobrada hace mucho queda fuera del radar, igual
  // que en `countOrderAnomalies`. Sin esto, el detalle y el contador discreparían.
  const scanFloor = daysAgo(UNDELIVERED_SCAN_DAYS);

  for (const order of orders) {
    const found: OrderFlag[] = [];

    if (hasIgnoredReasonValue(order.gatewayPayload)) found.push("amount_mismatch");

    // `undelivered` solo aplica a órdenes APPROVED dentro de la ventana: sin pago
    // confirmado todavía no hay nada que entregar, y marcar `pending`/`declined`
    // hacía que el panel mostrara siempre anomalías y ahogara las reales.
    const isScannable =
      order.status === "approved" && order.paidAt != null && order.paidAt >= scanFloor;

    const orderItems = items.filter((i) => i.orderId === order.id);
    if (isScannable && orderItems.length > 0) {
      const owned = activeByUser.get(order.userId) ?? new Set<string>();
      if (orderItems.some((i) => !owned.has(i.productId))) found.push("undelivered");
    }

    if (found.length > 0) flags.set(order.id, found);
  }

  return flags;
}

function hasIgnoredReasonValue(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const reason = (payload as Record<string, unknown>).ignoredReason;
  return typeof reason === "string" && reason.trim().length > 0;
}

export type AnomalyCounts = Record<OrderFlag, number>;

/**
 * Cuántas órdenes de cada tipo requieren atención ahora mismo. Se usa en el
 * dashboard para decidir si hay que mostrar la alerta.
 */
export async function countOrderAnomalies(): Promise<AnomalyCounts> {
  const [undelivered] = await db
    .select({ c: sql<number>`COUNT(*)::int` })
    .from(schema.orders)
    .where(
      and(
        eq(schema.orders.status, "approved"),
        gte(schema.orders.paidAt, daysAgo(UNDELIVERED_SCAN_DAYS)),
        hasUndeliveredProduct(),
      ),
    );

  const [mismatch] = await db
    .select({ c: sql<number>`COUNT(*)::int` })
    .from(schema.orders)
    .where(hasIgnoredReason());

  return {
    undelivered: undelivered?.c ?? 0,
    amount_mismatch: mismatch?.c ?? 0,
  };
}

/** Últimos 10 códigos con anomalía, para el enlace "ver estos casos". */
export async function listAnomalousOrderCodes(
  flags: readonly OrderFlag[],
  limit = 10,
): Promise<{ code: string; flags: OrderFlag[] }[]> {
  if (flags.length === 0) return [];
  const conditions = flags.map((flag) =>
    flag === "amount_mismatch" ? hasIgnoredReason() : hasUndeliveredProduct(),
  );

  const rows = await db
    .select({
      id: schema.orders.id,
      code: schema.orders.code,
      status: schema.orders.status,
      paidAt: schema.orders.paidAt,
      userId: schema.orders.userId,
      gatewayPayload: schema.orders.gatewayPayload,
    })
    .from(schema.orders)
    .where(
      and(
        or(...conditions),
        ...(flags.includes("undelivered")
          ? [eq(schema.orders.status, "approved"), gte(schema.orders.paidAt, daysAgo(UNDELIVERED_SCAN_DAYS))]
          : []),
      ),
    )
    .limit(limit);

  const computed = await getFlagsForOrders(rows);
  return rows
    .map((r) => ({ code: r.code, flags: computed.get(r.id) ?? [] }))
    .filter((r) => r.flags.length > 0);
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

export { IGNORED_REASON_AMOUNT_MISMATCH };
