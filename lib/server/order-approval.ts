import "server-only";

import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { ensureOrderEntitlements } from "@/lib/server/entitlements";
import { claimCouponForApprovedOrder } from "@/lib/server/coupon-usage";

/**
 * ÚNICA puerta de aprobación de órdenes. La usan tanto el webhook
 * (`/api/webhooks/wompi`) como la reconciliación (`/api/cron/reconcile`), de
 * modo que un pago confirmado por consulta a la API recibe exactamente las
 * mismas validaciones que uno confirmado por evento. Si alguna vez se añade una
 * vía de confirmación, debe pasar por aquí.
 *
 * Tanto el webhook como la reconciliación pueden entregar órdenes `expired`
 * (un APPROVED verificado que llegó tarde): pasan `allowExpiredRecovery`. NO se
 * permite revivir otros estados terminales: una orden `declined`/`voided`/
 * `error` es un cierre, no un pago perdido.
 */

export type WompiTransactionLike = {
  id: string;
  reference?: string | null;
  status?: string | null;
  amount_in_cents?: number | null;
  currency?: string | null;
  created_at?: string | null;
  [key: string]: unknown;
};

export type ApprovalOutcome =
  | { outcome: "granted"; granted: number; existing: number; deliveryOk: boolean; reason?: string }
  | { outcome: "amount_mismatch" }
  | { outcome: "already_approved"; granted: number; existing: number; deliveryOk: boolean }
  | { outcome: "ignored"; status: string | null };

/** Estados terminales de una transacción de Wompi que cierran un intento sin aprobar. */
export const FAILED_TX_STATUSES: readonly string[] = ["DECLINED", "VOIDED", "ERROR"];

/**
 * Estados de la orden desde los que todavía se consulta a Wompi (o se reclama
 * un pago ya verificado).
 *
 * Un rechazo NO es un punto muerto: quien falla con la tarjeta A y luego paga
 * con la B genera DOS transacciones sobre la misma orden. Si el primer rechazo
 * sellara la orden para siempre, la aprobación de la segunda quedaría bloqueada
 * con el dinero ya cobrado. Por eso `declined`/`voided`/`error` siguen siendo
 * «reclamables» — pero SOLO si la pasarela devuelve un APPROVED verificado con
 * monto y moneda que cuadran; de ahí sale un solo valor.
 */
export const RETRYABLE_ORDER_STATUSES: readonly string[] = [
  "pending",
  "declined",
  "voided",
  "error",
];

/** Estados desde los que un APPROVED verificado puede reclamar la orden. */
const CLAIMABLE: readonly string[] = [...RETRYABLE_ORDER_STATUSES];
/** Añadiendo las órdenes caducadas: las rescatan el webhook (APPROVED tardío) y
 *  la reconciliación (nivel 2), pasando `allowExpiredRecovery`. */
const RECOVERY_CLAIMABLE: readonly string[] = [...CLAIMABLE, "expired"];

/**
 * Clave que se escribe en `orders.gatewayPayload.ignoredReason` cuando el
 * pago se rechaza por no cuadrar con la orden. La usan el escritor (aquí) y
 * `order-anomalies` para marcarlo en el panel, así que no se cambia sin tocar
 * ambos.
 */
export const IGNORED_REASON_AMOUNT_MISMATCH = "monto o moneda no coinciden";

export async function approveOrderFromTransaction(
  order: schema.Order,
  transaction: WompiTransactionLike,
  options: { allowExpiredRecovery?: boolean } = {},
): Promise<ApprovalOutcome> {
  const status = transaction.status?.toUpperCase() ?? null;
  const txId = transaction.id;
  const updateBase = {
    gateway: "wompi",
    gatewayReference: txId,
    gatewayStatus: status,
    gatewayPayload: { ...transaction },
    updatedAt: new Date(),
  } as const;

  // Validar que el pago realmente corresponde a la orden (monto y moneda). El
  // reference del checkout no protege el monto (solo la firma de integridad lo
  // hace al crear el checkout), así que un APPROVED con otro monto NO debe
  // aprobar la orden. Fail-closed: si la pasarela no reporta monto o moneda, no
  // hay nada que verificar y NO se aprueba (antes un monto ausente pasaba como
  // válido y podía aprobar una orden sin comprobar el cobro).
  const amountOk = transaction.amount_in_cents != null && transaction.amount_in_cents === order.total;
  const currencyOk =
    !!transaction.currency && transaction.currency.toUpperCase() === order.currency.toUpperCase();
  if (!amountOk || !currencyOk) {
    await db
      .update(schema.orders)
      .set({
        ...updateBase,
        gatewayPayload: { ...transaction, ignoredReason: IGNORED_REASON_AMOUNT_MISMATCH },
      })
      .where(eq(schema.orders.id, order.id));
    return { outcome: "amount_mismatch" };
  }

  // Aprobación atómica: solo una de las aprobaciones concurrentes (o reintentos)
  // consigue reclamar el giro a `approved`.
  const claimed = await db
    .update(schema.orders)
    .set({
      ...updateBase,
      status: "approved",
      paidAt: transaction.created_at ? new Date(transaction.created_at) : new Date(),
    })
    .where(
      and(
        eq(schema.orders.id, order.id),
        inArray(schema.orders.status, [
          ...(options.allowExpiredRecovery ? RECOVERY_CLAIMABLE : CLAIMABLE),
        ]),
      ),
    )
    .returning({ id: schema.orders.id });

  if (claimed.length > 0) {
    const delivered = await ensureOrderEntitlements(order.id);
    await claimCouponForApprovedOrder(order.id);
    return {
      outcome: "granted",
      granted: delivered.granted,
      existing: delivered.existing,
      // La orden queda `approved` aunque la entrega falle: `ensure` es
      // idempotente y la reconciliación la reintenta. El caller decide si eso
      // debe ser un 500 (webhook → la pasarela reintenta) o solo un aviso.
      deliveryOk: delivered.ok,
      ...(delivered.ok ? {} : { reason: delivered.reason ?? "No se pudo entregar el producto." }),
    };
  }

  // La orden ya estaba procesada: auto-reparamos entregas que pudieron fallar
  // en un intento anterior (ensure es idempotente y no reinicia el reloj de
  // minMinutesAfterPayment de compras ya activas). IMPORTANTE: NO se sobrescribe
  // `gatewayReference` con la transacción entrante — la canónica es la primera
  // aprobada (la que generó las entregas); cambiarla rompería el guard de
  // revocación del estado terminal (una anulación de OTRA transacción dejaría de
  // reconocerse, o revocaría la equivocada).
  const [recheck] = await db
    .select({ status: schema.orders.status })
    .from(schema.orders)
    .where(eq(schema.orders.id, order.id))
    .limit(1);
  if (recheck?.status === "approved") {
    const delivered = await ensureOrderEntitlements(order.id);
    await claimCouponForApprovedOrder(order.id);
    // `deliveryOk` lo usa el webhook para decidir si (re)envía el correo de
    // aprobación: si esta pasada acaba de reparar una entrega que había fallado,
    // el comprador debe recibir el aviso; si la entrega ya estaba bien, la
    // `dedupeKey` del correo evita repetirlo.
    return {
      outcome: "already_approved",
      granted: delivered.granted,
      existing: delivered.existing,
      deliveryOk: delivered.ok,
    };
  }
  return { outcome: "ignored", status: recheck?.status ?? null };
}

/**
 * Marca una orden `pending` con el estado terminal de su transacción
 * (DECLINED/VOIDED/ERROR). Rechazos y errores eran invisibles en la tienda: el
 * webhook los ignoraba en órdenes pendientes y la confirmación a demanda solo
 * miraba `APPROVED`, así que con el pago ya caído el comprador veía
 * «Confirmando…» hasta agotar los sondeos y la orden seguía `pending` para el
 * administrador.
 *
 * El claim es atómico sobre `pending` (una sola escritura gana, idempotente con
 * reintentos del webhook), y solo se acepta una transacción cuya `reference` sea
 * el código de la orden: cuando el id llega por la URL del redirect es dato del
 * cliente y no prueba de nada.
 *
 * Devuelve `true` si esta llamada fue la que cambió el estado.
 */
export async function markOrderTerminalFromTransaction(
  order: schema.Order,
  transaction: WompiTransactionLike,
): Promise<boolean> {
  const status = (transaction.status ?? "").toUpperCase();
  if (!FAILED_TX_STATUSES.includes(status)) return false;
  if (transaction.reference && transaction.reference !== order.code) return false;

  const claimed = await db
    .update(schema.orders)
    .set({
      gateway: "wompi",
      gatewayReference: transaction.id,
      gatewayStatus: status,
      gatewayPayload: { ...transaction },
      status: status.toLowerCase(),
      updatedAt: new Date(),
    })
    .where(and(eq(schema.orders.id, order.id), eq(schema.orders.status, "pending")))
    .returning({ id: schema.orders.id });
  return claimed.length > 0;
}

/**
 * Aprueba una orden de total CERO (un cupón del 100% deja el total en 0). No hay
 * cobro que validar contra la pasarela —Wompi rechaza un `amount-in-cents` de 0—
 * así que la orden se cierra aquí y se entrega por el MISMO camino que una
 * aprobación pagada (`ensureOrderEntitlements` + `claimCouponForApprovedOrder`).
 *
 * El claim es atómico sobre `pending`, de modo que el reintento o la
 * reconciliación no vuelven a entregar. Idempotente: si ya estaba aprobada,
 * repara la entrega sin reescribir nada.
 */
export async function approveZeroTotalOrder(
  orderId: string,
): Promise<{ ok: boolean; granted: number; existing: number }> {
  const claimed = await db
    .update(schema.orders)
    .set({
      gateway: "free",
      gatewayStatus: "approved",
      status: "approved",
      paidAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(schema.orders.id, orderId), eq(schema.orders.status, "pending")))
    .returning({ id: schema.orders.id });

  if (claimed.length === 0) {
    const [recheck] = await db
      .select({ status: schema.orders.status })
      .from(schema.orders)
      .where(eq(schema.orders.id, orderId))
      .limit(1);
    if (recheck?.status === "approved") {
      const delivered = await ensureOrderEntitlements(orderId);
      await claimCouponForApprovedOrder(orderId);
      return { ok: delivered.ok, granted: delivered.granted, existing: delivered.existing };
    }
    return { ok: false, granted: 0, existing: 0 };
  }

  const delivered = await ensureOrderEntitlements(orderId);
  await claimCouponForApprovedOrder(orderId);
  return { ok: delivered.ok, granted: delivered.granted, existing: delivered.existing };
}
