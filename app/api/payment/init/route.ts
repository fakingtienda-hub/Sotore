import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { buildWompiCheckoutFields, getWompiConfig } from "@/lib/server/wompi";
import { ownerMatchesOrder } from "@/lib/server/order-ownership";
import { rateLimit } from "@/lib/server/rate-limit";
import { serverEnv } from "@/lib/serverEnv";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  orderCode: z.string().trim().min(1).max(60),
});

export async function POST(request: Request) {
  // Rate limit por IP para mitigar enumeración de órdenes.
  const ip =
    (request.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";
  const limiter = rateLimit(`pay-init:${ip}`, 20, 60_000);
  if (!limiter.ok) {
    return Response.json(
      { error: "Demasiadas peticiones. Intenta de nuevo en unos instantes." },
      { status: 429, headers: { "Retry-After": String(limiter.retryAfter ?? 60) } },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Parámetros inválidos." }, { status: 400 });
  }

  // El caller debe acreditar la titularidad de la orden (cookie de
  // titularidad emitida al crearla). Evita consultar/iniciar el pago de las
  // órdenes de otros (IDOR).
  const ownsOrder = await ownerMatchesOrder(parsed.data.orderCode);
  if (!ownsOrder) {
    return Response.json({ error: "No tienes acceso a esa orden." }, { status: 403 });
  }

  const [order] = await db
    .select({
      id: schema.orders.id,
      code: schema.orders.code,
      status: schema.orders.status,
      total: schema.orders.total,
      currency: schema.orders.currency,
      userId: schema.orders.userId,
    })
    .from(schema.orders)
    .where(eq(schema.orders.code, parsed.data.orderCode))
    .limit(1);

  if (!order) {
    return Response.json({ error: "La orden no existe." }, { status: 404 });
  }
  if (order.status !== "pending") {
    return Response.json({ error: "La orden ya no está pendiente de pago.", status: order.status }, { status: 409 });
  }

  const [user] = await db
    .select({ name: schema.users.name, email: schema.users.email })
    .from(schema.users)
    .where(eq(schema.users.id, order.userId))
    .limit(1);

  const config = getWompiConfig();
  if (!config.configured) {
    return Response.json({
      configured: false,
      orderCode: order.code,
      total: order.total,
      currency: order.currency,
    });
  }

  const redirectUrl = `${serverEnv.appUrl}/checkout/payment-result?order=${order.code}`;
  const fields = buildWompiCheckoutFields({
    publicKey: config.publicKey,
    reference: order.code,
    amountInCents: order.total,
    currency: order.currency,
    customerFullName: user?.name,
    customerEmail: user?.email,
    redirectUrl,
  });

  return Response.json({
    configured: true,
    orderCode: order.code,
    total: order.total,
    currency: order.currency,
    checkout: {
      action: config.checkoutUrl,
      fields,
      redirectUrl,
    },
  });
}