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
 * La reconciliación puede entregar órdenes `expired` (un APPROVED verificado
 * que llegó tarde). NO se permite reviving otros estados terminales: una orden
 * `declined`/`voided`/`error` es un cierre, no un pago perdido.
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
  | { outcome: "already_approved"; granted: number; existing: number }
  | { outcome: "ignored"; status: string | null };

/** Estados desde los que un APPROVED verificado puede reclamar la orden. */
const CLAIMABLE: readonly string[] = ["pending", "expired"];

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
  // aprobar la orden.
  const amountOk = transaction.amount_in_cents == null || transaction.amount_in_cents === order.total;
  const currencyOk = !transaction.currency || transaction.currency.toUpperCase() === order.currency.toUpperCase();
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
        options.allowExpiredRecovery
          ? inArray(schema.orders.status, [...CLAIMABLE])
          : eq(schema.orders.status, "pending"),
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
    return { outcome: "already_approved", granted: delivered.granted, existing: delivered.existing };
  }
  return { outcome: "ignored", status: recheck?.status ?? null };
}
