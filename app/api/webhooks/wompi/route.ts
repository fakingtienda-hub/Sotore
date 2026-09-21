import { createHmac } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { ensureOrderEntitlements, revokeOrderEntitlements } from "@/lib/server/entitlements";
import { claimCouponForApprovedOrder, releaseCouponForOrder } from "@/lib/server/coupon-usage";
import { getWompiConfig } from "@/lib/server/wompi";
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

function verifySignature(rawBody: string, secret: string, signature: string | null): boolean {
  if (!signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  return signature === expected;
}

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
  const signature = request.headers.get("x-event-signature");

  const config = getWompiConfig();
  if (!config.eventsSecret) {
    return Response.json(
      { error: "WOMPI_EVENTS_SECRET no configurado; webhook desactivado." },
      { status: 503 },
    );
  }
  if (!verifySignature(rawBody, config.eventsSecret, signature)) {
    return Response.json({ error: "Firma del webhook inválida." }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }

  const body = payload as { event?: string; data?: { transaction?: WompiTransaction } };
  const transaction = body.data?.transaction;
  if (body.event !== TX_UPDATED || !transaction) {
    return Response.json({ ok: true, ignored: "evento no procesado" });
  }

  const reference = transaction.reference?.trim();
  if (!reference) {
    return Response.json({ ok: true, ignored: "sin referencia" });
  }

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
  const updateBase = {
    gateway: "wompi",
    gatewayReference: txId,
    gatewayStatus: status,
    gatewayPayload: { ...transaction },
    updatedAt: new Date(),
  } as const;

  if (status === "APPROVED") {
    // Validar que el pago realmente corresponde a la orden (monto y moneda).
    // El reference del checkout no protege el monto (solo la firma de
    // integridad lo hace al crear el checkout), así que un APPROVED con otro
    // monto NO debe aprobar la orden.
    const amountOk = transaction.amount_in_cents == null || transaction.amount_in_cents === order.total;
    const currencyOk = !transaction.currency || transaction.currency.toUpperCase() === order.currency.toUpperCase();
    if (!amountOk || !currencyOk) {
      await db
        .update(schema.orders)
        .set({
          gateway: "wompi",
          gatewayReference: txId,
          gatewayStatus: status,
          gatewayPayload: { ...transaction, ignoredReason: "monto o moneda no coinciden" },
          updatedAt: new Date(),
        })
        .where(eq(schema.orders.id, order.id));
      return Response.json({ ok: true, ignored: "monto o moneda no coinciden con la orden" });
    }

    // Aprobación atómica: solo una de las dos aprobaciones concurrentes
    // (o reintentos) consigue reclamar el giro pending→approved.
    const claimed = await db
      .update(schema.orders)
      .set({
        ...updateBase,
        status: "approved",
        paidAt: transaction.created_at ? new Date(transaction.created_at) : new Date(),
      })
      .where(and(eq(schema.orders.id, order.id), eq(schema.orders.status, "pending")))
      .returning({ id: schema.orders.id });

    if (claimed.length > 0) {
      const delivered = await ensureOrderEntitlements(order.id);
      if (!delivered.ok) {
        return Response.json(
          { error: delivered.reason ?? "No se pudo entregar el producto." },
          { status: 500 },
        );
      }
      await claimCouponForApprovedOrder(order.id);
      await sendApprovedEmail(order).catch(() => {});
      revalidatePath("/library");
      revalidatePath("/admin/sales");
      return Response.json({ ok: true, granted: delivered.granted });
    }

    // La orden ya estaba processada: auto-reparamos entregas que pudieron
    // fallar en un intento anterior (ensure es idempotente y no reinicia el
    // reloj de minMinutesAfterPayment de compras ya activas).
    const [recheck] = await db
      .select({ status: schema.orders.status })
      .from(schema.orders)
      .where(eq(schema.orders.id, order.id))
      .limit(1);
    if (recheck?.status === "approved") {
      if (order.gatewayReference !== txId) {
        await db
          .update(schema.orders)
          .set({ gatewayReference: txId, updatedAt: new Date() })
          .where(eq(schema.orders.id, order.id));
      }
      const delivered = await ensureOrderEntitlements(order.id);
      await claimCouponForApprovedOrder(order.id);
      return Response.json({
        ok: true,
        granted: delivered.ok ? delivered.granted : 0,
        existing: delivered.ok ? delivered.existing : 0,
      });
    }
    return Response.json({ ok: true, ignored: `orden en estado ${recheck?.status ?? "desconocido"}` });
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
        .set({ ...updateBase, status: status.toLowerCase() })
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