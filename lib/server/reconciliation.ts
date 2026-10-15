import "server-only";

import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { ensureOrderEntitlements } from "@/lib/server/entitlements";
import { expireStalePendingOrders } from "@/lib/server/order-expiry";
import {
  approveOrderFromTransaction,
  markOrderTerminalFromTransaction,
  FAILED_TX_STATUSES,
  RETRYABLE_ORDER_STATUSES,
  type WompiTransactionLike,
} from "@/lib/server/order-approval";
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
/** Antigüedad máxima de una orden para consultarla a demanda (nivel 3). */
const ON_DEMAND_LOOKUP_MAX_MS = 60 * 60 * 1000;

/**
 * Techo de UNA consulta en el camino caliente del comprador.
 *
 * Medido contra Wompi: `GET /transactions/{id}` tarda 0,4–0,9 s, pero una
 * resolución DNS fallida ha llegado a llevarse 11 s. El sondeo no programa el
 * siguiente hasta que responde la petición, así que un techo de 15 s convertía
 * UN lago de red en 15+ s de «Confirmando…» para el comprador. Se aborta pronto
 * y el siguiente sondeo reintenta: perder un intento es barato, bloquearlo no.
 */
const ON_DEMAND_FETCH_TIMEOUT_MS = 5_000;

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
 * Nivel 3: confirmación a demanda de UNA orden, en el momento.
 *
 * La página de resultado (`/checkout/payment-result`) solo consultaba la base,
 * así que el comprador se quedaba en "Confirmando…" hasta que llegara el
 * webhook o corriera la reconciliación — y esta última necesita un cron
 * externo que puede no estar configurado. Es la versión de un solo comprador
 * de `recoverMissedPayments`: le pregunta la verdad a Wompi ya y reutiliza la
 * MISMA puerta de aprobación (`approveOrderFromTransaction`), con su validación
 * de monto y moneda y su claim atómico, así que no se puede aprobar de más.
 *
 * Solo actúa sobre órdenes `pending` recientes: pasada la ventana, recuperar el
 * pago es trabajo del cron, no de cada sondeo del navegador.
 *
 * `transactionId` es el id que Wompi añade al `redirect-url` (`?id=…`) y con el
 * que el comprador vuelve a la app. Es la vía RÁPIDA: consultar por id funciona
 * con la llave pública (`GET /transactions/{id}` → 200), mientras que el
 * listado necesita permisos que esta llave no tiene (401). Sin este parámetro,
 * una orden sin `gatewayReference` (el caso del pago recién hecho, antes de que
 * llegue el webhook) solo podía intentar el listado, fallaba siempre y el
 * comprador se quedaba en «Confirmando…» hasta agotar los sondeos.
 *
 * Devuelve el estado de la orden tras el intento, o `null` si no se pudo
 * resolver (Wompi sin configurar o fallo de la API).
 *
 * No solo aprueba: un `DECLINED`/`VOIDED`/`ERROR` también se refleja aquí. Antes
 * solo se miraba `APPROVED`, así que con el pago rechazado la orden seguía
 * `pending` y el comprador agotaba los 40 sondeos viendo «Confirmando…».
 */
export async function confirmOrderWithWompi(
  orderCode: string,
  transactionId?: string,
): Promise<string | null> {
  const config = await getWompiConfig();
  if (!config.configured) return null;

  const [order] = await db
    .select()
    .from(schema.orders)
    .where(eq(schema.orders.code, orderCode))
    .limit(1);
  if (!order) return null;
  // Un rechazo también se re-consulta: si la pasarela acaba aprobando otra
  // transacción de la misma orden, ese pago tiene que poder entrar.
  if (!RETRYABLE_ORDER_STATUSES.includes(order.status)) return order.status;

  if (Date.now() - order.createdAt.getTime() > ON_DEMAND_LOOKUP_MAX_MS) {
    return order.status;
  }

  // El id que trae el navegador (URL de retorno) es el intento más reciente, así
  // que manda sobre el guardado: un rechazo con la tarjeta A deja
  // `gatewayReference` y el reintento con la B llega por la URL. Con id la
  // consulta es directa y barata; sin él se usa el que guardó el webhook.
  const directId = transactionId?.trim() || order.gatewayReference || null;
  let tx: WompiTransactionResponse | null = null;

  if (directId) {
    tx = await fetchWompiTransaction(config, directId, ON_DEMAND_FETCH_TIMEOUT_MS);
    // El id de la URL viene del cliente: NUNCA se confirma con la transacción de
    // otra. La `reference` de Wompi es el código de la orden, así que si no
    // coincide se descarta.
    if (tx && tx.reference !== order.code) tx = null;
  }

  // UN solo viaje de red por sondeo. El listado solo se intenta cuando no hubo
  // id en absoluto: si el id existió y la consulta falló, volver a listar aquí
  // añadiría un segundo viaje de red a cada sondeo sin poder confirmar nada
  // (el listado, además, exige permisos que la llave pública no tiene: 401).
  if (!tx && !directId) {
    const listed = await fetchWompiTransactionsSince(config, order.createdAt);
    // Solo se empareja por `reference`: el estado se decide abajo, porque un
    // rechazo también tiene que reflejarse.
    tx = listed.find((t) => t.reference === order.code) ?? null;
  }
  if (!tx) return order.status;

  const txStatus = tx.status?.toUpperCase() ?? "";

  if (txStatus === "APPROVED") {
    // La revalidación de rutas NO va aquí: `revalidatePath` exige un contexto de
    // petición, y esta función también se llama desde scripts de verificación. La
    // hace el caller (`getCheckoutOrderStatus`), que siempre corre en una request.
    await approveOrderFromTransaction(order, toTransaction(tx));

    const [after] = await db
      .select({ status: schema.orders.status })
      .from(schema.orders)
      .where(eq(schema.orders.id, order.id))
      .limit(1);
    return after?.status ?? order.status;
  }

  // Rechazo o error: la tienda lo refleja en el primer sondeo, en vez de dejar
  // la orden pendiente y al comprador esperando.
  if (FAILED_TX_STATUSES.includes(txStatus)) {
    const marked = await markOrderTerminalFromTransaction(order, toTransaction(tx));
    if (marked) return txStatus.toLowerCase();
  }

  return order.status;
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

  // Forzado: el cron barre siempre (su conteo alimenta el reporte), sin el
  // throttle por-instancia que aplica al camino de pago.
  const expiredBySweep = await expireStalePendingOrders({ force: true });
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
