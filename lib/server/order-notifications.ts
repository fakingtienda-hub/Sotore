import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { wrapEmailLayout, sendEmail } from "@/lib/email/send";

type ApprovedOrderRef = Pick<schema.Order, "id" | "code" | "userId">;

/**
 * Escapa texto que el usuario controla (su nombre, títulos de producto) antes de
 * interpolarlo en el HTML del correo. Sin esto, un nombre como
 * `<a href="…">…</a>` se renderiza como enlace/HTML arbitrario en el cliente de
 * correo del comprador según su proveedor.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Aviso al comprador de que su pedido quedó aprobado y ya puede descargar.
 *
 * Vive aquí (y no en el webhook) porque hay TRES caminos que aprueban una
 * orden: el webhook, la reconciliación (nivel 1 y 2) y las órdenes de total
 * cero. Antes solo lo enviaba el webhook, así que un pago recuperado por el
 * cron —o uno cuyo primer envío falló y luego se entregó— dejaba al comprador
 * sin correo aunque tuviera el producto.
 *
 * La idempotencia la garantiza `dedupeKey`: llamar de más no repite el correo.
 */
export async function sendOrderApprovedEmail(order: ApprovedOrderRef): Promise<void> {
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
    .map((i) => `<li style="margin:4px 0;">${escapeHtml(i.title)}</li>`)
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
      `<p>Hola ${escapeHtml(user.name ?? "comprador")}, tu pedido <strong>${escapeHtml(order.code)}</strong> fue aprobado y ya puedes descargar lo que compraste.</p>
       <ul style="padding-left:18px;">${listHtml}</ul>
       <p><a href="${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/library" style="display:inline-block;padding:12px 20px;background:#a83a1e;color:#fff;border-radius:6px;text-decoration:none;">Ir a mi biblioteca</a></p>`,
    ),
  });
}
