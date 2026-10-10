import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { revokeOrderEntitlements } from "@/lib/server/entitlements";
import { releaseCouponForOrder } from "@/lib/server/coupon-usage";
import { approveOrderFromTransaction } from "@/lib/server/order-approval";
import { getWompiConfig, verifyWompiEventChecksum, type WompiEventPayload } from "@/lib/server/wompi";
import { expireStalePendingOrders } from "@/lib/server/order-expiry";
import { wrapEmailLayout, sendEmail } from "@/lib/email/send";

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

async function sendApprovedEmail(order: schema.Order) {
  const [user] = await db
    .select({ name: schema.users.name, email: schema.users.email })
    .from(schema.users)
    .where(eq(schema.users.id, order.userId))
    .limit(1);
  if (!user) return;

  const items = await db
    .select({ title: schema.orderItems.productTitleSnapshot })
    .from(schema.orderItems)
    .where(eq(schema.orderItems.orderId, order.id));
  const listHtml = items
    .map((i) => `<li style="margin:4px 0;">${i.title}</li>`)
    .join("");

  await sendEmail({
    to: user.email,
    subject: `Tu pedido ${order.code} fue aprobado`,
    // La clave de idempotencia es lo que garantiza UN correo por compra: si el
    // webhook reintenta (o la reconciliación vuelve a aprobar la orden), el
    // guardia lo omite en vez de repetir el aviso al cliente.
    kind: "order_approved",
    dedupeKey: `order:${order.id}:approved`,
    orderId: order.id,
    html: wrapEmailLayout(
      "¡Pago recibido!",
      `<p>Hola ${user.name ?? "comprador"}, tu pedido <strong>${order.code}</strong> fue aprobado y ya puedes descargar lo que compraste.</p>
       <ul style="padding-left:18px;">${listHtml}</ul>
       <p><a href="${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/library" style="display:inline-block;padding:12px 20px;background:#a83a1e;color:#fff;border-radius:6px;text-decoration:none;">Ir a mi biblioteca</a></p>`,
    ),
  });
}

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

  if (signature.checksum && headerChecksum && signature.checksum.toLowerCase() !== headerChecksum.toLowerCase()) {
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
    const result = await approveOrderFromTransaction(order, {
      ...transaction,
      status,
    });

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
      await sendApprovedEmail(order).catch(() => {});
      revalidatePath("/library");
      revalidatePath("/admin/sales");
      return Response.json({ ok: true, granted: result.granted });
    }

    if (result.outcome === "already_approved") {
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
    // Transacción distinta a la aprobada, u orden todavía pendiente: se
    // registra la firma pero NO se cambia el estado de la orden, de modo que
    // un APPROVED posterior (de la transacción real) sigue siendo procesable.
    return Response.json({
      ok: true,
      ignored: order.status === "approved" ? "transacción distinta a la aprobada" : "orden aún no aprobada",
    });
  }

  // PENDING u otros estados no terminales: no cambian la orden.
  return Response.json({ ok: true, ignored: status });
}