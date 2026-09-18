import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { buildWompiCheckoutFields, getWompiConfig } from "@/lib/server/wompi";
import { serverEnv } from "@/lib/serverEnv";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  orderCode: z.string().trim().min(1).max(60),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Parámetros inválidos." }, { status: 400 });
  }

  const [order] = await db
    .select()
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