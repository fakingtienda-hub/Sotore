import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { revokeOrderEntitlements } from "@/lib/server/entitlements";
import { releaseCouponForOrder } from "@/lib/server/coupon-usage";
import {
  approveOrderFromTransaction,
  markOrderTerminalFromTransaction,
} from "@/lib/server/order-approval";
import {
  getWompiConfig,
  safeChecksumEqual,
  verifyWompiEventChecksum,
  type WompiEventPayload,
} from "@/lib/server/wompi";
import { expireStalePendingOrders } from "@/lib/server/order-expiry";
import { sendOrderApprovedEmail } from "@/lib/server/order-notifications";

export const dynamic = "force-dynamic";

const TX_UPDATED = "transaction.updated";
const TERMINAL_STATUSES = ["DECLINED", "VOIDED", "ERROR"] as const;

type WompiTransaction = {
  id: string;
  reference: string;
  status: string;
  amount_in_cents?: number;
  currency?: string;
  created_at?: string;
  [key: string]: unknown;
};

export async function POST(request: Request) {
  const rawBody = await request.text();
  const headerChecksum = request.headers.get("x-event-checksum");

  const config = await getWompiConfig();
  if (!config.eventsSecret) {
    return Response.json(
      { error: "WOMPI_EVENTS_SECRET no configurado; webhook desactivado." },
      { status: 503 },
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }
  const eventPayload = payload as WompiEventPayload;
  const signature = eventPayload.signature ?? {};
  const checksum = signature.checksum ?? headerChecksum;

  if (!checksum || !Array.isArray(signature.properties) || signature.properties.length === 0) {
    return Response.json({ error: "Firma del webhook inválida." }, { status: 401 });
  }

  if (signature.checksum && headerChecksum && !safeChecksumEqual(signature.checksum, headerChecksum)) {
    return Response.json({ error: "Firma del webhook inválida." }, { status: 401 });
  }

  if (!verifyWompiEventChecksum(eventPayload, config.eventsSecret, checksum)) {
    return Response.json({ error: "Firma del webhook inválida." }, { status: 401 });
  }

  const body = eventPayload as unknown as { event?: string; data?: { transaction?: WompiTransaction } };
  const transaction = body.data?.transaction;
  if (body.event !== TX_UPDATED || !transaction) {
    return Response.json({ ok: true, ignored: "evento no procesado" });
  }

  const reference = transaction.reference?.trim();
  if (!reference) {
    return Response.json({ ok: true, ignored: "sin referencia" });
  }

  await expireStalePendingOrders();

  const [order] = await db
    .select()
    .from(schema.orders)
    .where(eq(schema.orders.code, reference))
    .limit(1);

  // Orden desconocida: respondemos 200 para que Wompi no reintente sin fin.
  if (!order) {
    return Response.json({ ok: false, reason: "orden no encontrada" }, { status: 200 });
  }

  const status = transaction.status?.toUpperCase();
  const txId = transaction.id;

  if (status === "APPROVED") {
    // Toda la aprobación (validación de monto/moneda, claim atómico,
    // idempotencia) vive en `approveOrderFromTransaction`, el mismo módulo que
    // usa la reconciliación: así un pago confirmado por evento y uno confirmado
    // por consulta a la API se tratan igual.
    //
    // `allowExpiredRecovery`: el barrido de caducidad corre JUSTO ANTES (línea
    // anterior) y puede haber vencido esta orden. Sin recuperar `expired` aquí,
    // un APPROVED verificado que llega tarde (el comprador pagó en el último
    // instante del plazo) se ignoraba y el pago quedaba sin entregar hasta que
    // corriera el cron. El evento está firmado y pasa la validación de
    // monto/moneda, así que reclamar una orden vencida es seguro.
    const result = await approveOrderFromTransaction(
      order,
      {
        ...transaction,
        status,
      },
      { allowExpiredRecovery: true },
    );

    if (result.outcome === "amount_mismatch") {
      return Response.json({ ok: true, ignored: "monto o moneda no coinciden con la orden" });
    }

    if (result.outcome === "granted") {
      if (!result.deliveryOk) {
        // 500 para que la pasarela reintente: la orden ya quedó `approved`, y
        // tanto su reintento como la reconciliación terminan la entrega.
        return Response.json(
          { error: result.reason ?? "No se pudo entregar el producto." },
          { status: 500 },
        );
      }
      await sendOrderApprovedEmail(order).catch(() => {});
      revalidatePath("/library");
      revalidatePath("/admin/sales");
      return Response.json({ ok: true, granted: result.granted });
    }

    if (result.outcome === "already_approved") {
      // La orden ya estaba aprobada (reintento del webhook, o la aprobó la
      // reconciliación). Si la entrega de ESTE intento falló, el correo también
      // se omite para no avisar de algo que aún no está listo; el reintento de
      // Wompi o el cron volverán a pasar por aquí. Si la entrega está bien, se
      // (re)envía: la `dedupeKey` lo deja en un único correo por compra, y así
      // se cubre el caso de una aprobación previa cuyo primer envío se perdió.
      if (result.deliveryOk) {
        await sendOrderApprovedEmail(order).catch(() => {});
      }
      return Response.json({
        ok: true,
        granted: result.granted,
        existing: result.existing,
      });
    }

    return Response.json({ ok: true, ignored: `orden en estado ${result.status ?? "desconocido"}` });
  }

  if ((TERMINAL_STATUSES as readonly string[]).includes(status)) {
    // El estado terminal solo afecta a una orden cuya transacción APROBADA es
    // exactamente esta (mismo transaction.id). Comparar contra gatewayReference
    // evita que una anulación/reintento de OTRA transacción revoque un pago
    // legítimo, y que un evento terminal que llegue antes que el APPROVED
    // "mate" un pago válido: una orden pending NO se marca terminal aquí
    // (esa expiración la maneja la lógica de caducidad, no el webhook).
    const isSameTransaction = !!txId && order.gatewayReference === txId;
    if (order.status === "approved" && isSameTransaction) {
      await revokeOrderEntitlements(order.id);
      await releaseCouponForOrder(order.id);
      await db
        .update(schema.orders)
        .set({
          gateway: "wompi",
          // Aquí `txId === order.gatewayReference` (es la misma transacción que
          // aprobó), así que reescribirlo no cambia la transacción canónica.
          gatewayReference: txId,
          gatewayStatus: status,
          gatewayPayload: { ...transaction },
          updatedAt: new Date(),
          status: status.toLowerCase(),
        })
        .where(eq(schema.orders.id, order.id));
      revalidatePath("/admin/sales");
      revalidatePath("/library");
      return Response.json({ ok: true, revoked: true, transactionId: txId });
    }
    // Orden todavía pendiente: el intento se cayó y la tienda lo refleja ya.
    // Antes se ignoraba con el argumento de no "matar" un pago válido, pero eso
    // dejaba el rechazo invisible: el comprador agotaba los sondeos viendo
    // «Confirmando…» y al administrador le quedaba una orden pending. El riesgo
    // que se quería evitar queda cubierto por `approveOrderFromTransaction`,
    // que SÍ puede reclamar una orden ya en `declined` si llega un APPROVED
    // verificado (reintento con otra tarjeta), así que un reintento no se pierde.
    if (order.status === "pending") {
      const marked = await markOrderTerminalFromTransaction(order, { ...transaction, status });
      return Response.json(
        marked ? { ok: true, terminal: status } : { ok: true, ignored: "orden ya no pendiente" },
      );
    }
    // Transacción distinta a la aprobada, u orden ya en otro estado: se registra
    // el hecho pero no se cambia el estado, de modo que un APPROVED posterior de
    // la transacción real siga siendo procesable.
    return Response.json({
      ok: true,
      ignored:
        order.status === "approved" ? "transacción distinta a la aprobada" : `orden en estado ${order.status}`,
    });
  }

  // PENDING u otros estados no terminales: no cambian la orden.
  return Response.json({ ok: true, ignored: status });
}