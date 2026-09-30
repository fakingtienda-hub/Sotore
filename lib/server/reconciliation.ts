import "server-only";

import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { ensureOrderEntitlements } from "@/lib/server/entitlements";
import { expireStalePendingOrders } from "@/lib/server/order-expiry";
import { approveOrderFromTransaction, type WompiTransactionLike } from "@/lib/server/order-approval";
import { UNDELIVERED_SCAN_DAYS } from "@/lib/server/order-anomalies";
import {
  fetchWompiTransaction,
  fetchWompiTransactionsSince,
  getWompiConfig,
  type WompiTransactionResponse,
} from "@/lib/server/wompi";

/**
 * Reconciliación de pagos. Existe porque el webhook es el ÚNICO camino normal
 * de confirmación, y el webhook se pierde: si la app estaba caída, en deploy, o
 * Wompi agotó los reintentos, la orden queda `pending` para siempre. El cliente
 * pagó y no tiene nada, y nadie se entera.
 *
 * Dos niveles, ambos idempotentes (se pueden correr las veces que sea):
 *
 *   1. `repairUndeliveredOrders` — órdenes ya `approved` sin acceso entregado.
 *      No consulta la pasarela: el pago es un hecho, lo que faltó fue la
 *      entrega. Cierra el caso "pagó y la biblioteca le aparece vacía".
 *
 *   2. `recoverMissedPayments` — órdenes `pending` (y `expired` con pago
 *      verificado) que SÍ se pagaron. Consulta la API de transacciones de
 *      Wompi y reaplica el mismo camino de aprobación que el webhook.
 *
 * NO se tocan las órdenes `declined`/`voided`/`error`: son cierres, no pagos
 * perdidos. Tampoco se reviving por antigüedad sin.transaction: sin un APPROVED
 * verificado por la pasarela no hay prueba de pago.
 */

/** Ventana hacia atrás para emparejar pagos sin webhook (nivel 2). */
const PAYMENT_LOOKBACK_HOURS = 72;
/** Tope de órdenes por corrida, para no martillar la base ni la API. */
const MAX_ORDERS_PER_RUN = 200;

export type ReconcileReport = {
  ranAt: string;
  wompiConfigured: boolean;
  expiredBySweep: number;
  delivery: {
    scanned: number;
    repaired: string[];
    grantsRecovered: number;
  };
  payments: {
    scanned: number;
    approved: string[];
    expiredRecovered: string[];
    amountMismatch: string[];
    deliveryFailures: string[];
    lookbackFrom: string;
    transactionsFetched: number;
    note: string;
  };
};

function isoDaysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

/**
 * Nivel 1: órdenes aprobadas cuyo producto el usuario no tiene activo.
 *
 * OJO: "sin fila en `purchases`" NO es un síntoma. Un purchaser que ya tenía
 * el producto legítimamente no genera fila nueva (`ensure` la omite). El
 * síntoma real es no tener una compra ACTIVA para el producto, y eso es
 * exactamente lo que `ensureOrderEntitlements` sabe reparar.
 */
async function repairUndeliveredOrders(): Promise<{
  scanned: number;
  repaired: string[];
  grantsRecovered: number;
}> {
  const orders = await db
    .select({ id: schema.orders.id, code: schema.orders.code, userId: schema.orders.userId })
    .from(schema.orders)
    .where(
      and(
        eq(schema.orders.status, "approved"),
        gte(schema.orders.paidAt, isoDaysAgo(UNDELIVERED_SCAN_DAYS)),
      ),
    )
    .orderBy(desc(schema.orders.paidAt))
    .limit(MAX_ORDERS_PER_RUN);

  const repaired: string[] = [];
  let grantsRecovered = 0;

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
          eq(schema.purchases.userId, order.userId),
          eq(schema.purchases.status, "active"),
          inArray(schema.purchases.productId, productIds),
        ),
      );
    const activeIds = new Set(active.map((p) => p.productId));
    const missing = productIds.filter((id) => !activeIds.has(id));

    if (missing.length === 0) continue;

    const result = await ensureOrderEntitlements(order.id);
    if (result.ok && result.granted > 0) {
      repaired.push(order.code);
      grantsRecovered += result.granted;
    }
  }

  return { scanned: orders.length, repaired, grantsRecovered };
}

/** Convierte la respuesta de la API de Wompi al tipo que espera la aprobación. */
function toTransaction(t: WompiTransactionResponse): WompiTransactionLike {
  return {
    ...t,
    id: t.id,
    reference: t.reference ?? null,
    status: t.status ?? null,
    amount_in_cents: t.amount_in_cents ?? null,
    currency: t.currency ?? null,
    created_at: t.created_at ?? null,
  };
}

/**
 * Nivel 2: páginas reales pendientes (o expiradas) que en Wompi sí están
 * APPROVED. Resuelve cada orden contra la API: por `gatewayReference` si lo
 * tenemos (consulta directa y barata) y, si no, emparejando la ventana de
 * transacciones por `reference` — que es el caso del webhook totalmente perdido,
 * donde no tenemos ningún id.
 */
async function recoverMissedPayments(): Promise<ReconcileReport["payments"]> {
  const empty: ReconcileReport["payments"] = {
    scanned: 0,
    approved: [],
    expiredRecovered: [],
    amountMismatch: [],
    deliveryFailures: [],
    lookbackFrom: isoDaysAgo(0).toISOString(),
    transactionsFetched: 0,
    note: "",
  };

  const config = await getWompiConfig();
  if (!config.configured) {
    return { ...empty, note: "Wompi no configurado: nivel 2 omitido." };
  }

  const lookbackFrom = new Date(Date.now() - PAYMENT_LOOKBACK_HOURS * 60 * 60 * 1000);
  const candidates = await db
    .select()
    .from(schema.orders)
    .where(
      and(
        inArray(schema.orders.status, ["pending", "expired"]),
        gte(schema.orders.createdAt, lookbackFrom),
      ),
    )
    .orderBy(desc(schema.orders.createdAt))
    .limit(MAX_ORDERS_PER_RUN);

  if (candidates.length === 0) {
    return { ...empty, lookbackFrom: lookbackFrom.toISOString(), note: "Sin órdenes por revisar." };
  }

  // Una sola llamada de listado cubre todas las órdenes sin gatewayReference;
  // las que sí lo tienen se resuelven por id para no depender del listado.
  const needsLookup = candidates.filter((o) => !o.gatewayReference);
  let listed: WompiTransactionResponse[] = [];
  let listingNote = "";
  if (needsLookup.length > 0) {
    listed = await fetchWompiTransactionsSince(config, lookbackFrom);
    if (listed.length === 0) {
      listingNote =
        "El listado de transacciones de Wompi no devolvió datos (¿endpoint o ventana no disponibles en tu cuenta?). Las órdenes con gatewayReference se resuelven igualmente por id.";
    }
  }
  const byReference = new Map<string, WompiTransactionResponse>();
  for (const t of listed) {
    const ref = t.reference?.trim();
    if (ref && !byReference.has(ref)) byReference.set(ref, t);
  }

  const approved: string[] = [];
  const expiredRecovered: string[] = [];
  const amountMismatch: string[] = [];
  const deliveryFailures: string[] = [];

  for (const order of candidates) {
    const tx = order.gatewayReference
      ? await fetchWompiTransaction(config, order.gatewayReference)
      : (byReference.get(order.code) ?? null);
    if (!tx) continue;
    if (tx.status?.toUpperCase() !== "APPROVED") continue;

    const wasExpired = order.status === "expired";
    const result = await approveOrderFromTransaction(order, toTransaction(tx), {
      allowExpiredRecovery: true,
    });

    if (result.outcome === "granted") {
      if (wasExpired) expiredRecovered.push(order.code);
      else approved.push(order.code);
      if (!result.deliveryOk) deliveryFailures.push(order.code);
    } else if (result.outcome === "amount_mismatch") {
      // Sospechoso: la orden dice una cosa y el cobro otra. Se registra pero NO
      // se entrega — requiere revisión manual.
      amountMismatch.push(order.code);
    } else if (result.outcome === "already_approved") {
      if (!deliveryFailures.includes(order.code) && wasExpired) expiredRecovered.push(order.code);
    }
  }

  const notes = [listingNote].filter(Boolean);
  return {
    scanned: candidates.length,
    approved,
    expiredRecovered,
    amountMismatch,
    deliveryFailures,
    lookbackFrom: lookbackFrom.toISOString(),
    transactionsFetched: listed.length,
    note: notes.join(" "),
  };
}

export async function runReconciliation(): Promise<ReconcileReport> {
  const config = await getWompiConfig();

  const expiredBySweep = await expireStalePendingOrders();
  const delivery = await repairUndeliveredOrders();
  const payments = await recoverMissedPayments();

  if (delivery.repaired.length > 0 || payments.approved.length > 0 || payments.expiredRecovered.length > 0) {
    revalidatePath("/library");
    revalidatePath("/admin/sales");
  }

  return {
    ranAt: new Date().toISOString(),
    wompiConfigured: config.configured,
    expiredBySweep,
    delivery,
    payments,
  };
}
