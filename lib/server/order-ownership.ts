import "server-only";

import { eq } from "drizzle-orm";
import { cookies } from "next/headers";

import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import { serverEnv } from "@/lib/serverEnv";
import { safeTokenEqual } from "@/lib/server/safe-token";

const COOKIE_PREFIX = "fakingstore.order_token";

export function orderTokenCookieName(code: string): string {
  return `${COOKIE_PREFIX}.${code}`;
}

export async function setOrderTokenCookie(code: string, token: string) {
  const store = await cookies();
  store.set(orderTokenCookieName(code), token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: serverEnv.isProd,
    maxAge: 7 * 24 * 60 * 60,
  });
}

async function readOrderTokenCookie(code: string): Promise<string | null> {
  const store = await cookies();
  return store.get(orderTokenCookieName(code))?.value ?? null;
}

/**
 * Verifica que quien invoca es el titular de la orden. Dos vías, ambas atadas a
 * la MISMA orden (no basta con conocer el código):
 *
 *   1. Cookie httpOnly `fakingstore.order_token.{code}` cuyo valor coincide con
 *      `orders.owner_token`. Es la vía del comprador invitado que pagó aquí.
 *   2. Sesión iniciada cuyo usuario es el dueño de la orden (`orders.user_id`).
 *      Cubre al comprador que pagó en un dispositivo y vuelve en otro, o al que
 *      perdió la cookie (bloqueada, borrada, o porque el redirect de Wompi cayó
 *      en un host distinto al que la emitió). Sin esta vía quedaba encerrado sin
 *      su compra aunque hubiera iniciado sesión con el mismo email.
 *
 * Las órdenes legadas (sin token) NO se auto-curan: necesitan el backfill de
 * `scripts/backfill-order-tokens.ts`; mientras tanto solo se accede a ellas por
 * la vía de la sesión, nunca adivinando el código.
 */
export async function ownerMatchesOrder(code: string): Promise<boolean> {
  const [order] = await db
    .select({ ownerToken: schema.orders.ownerToken, userId: schema.orders.userId })
    .from(schema.orders)
    .where(eq(schema.orders.code, code))
    .limit(1);
  if (!order) return false;

  if (order.ownerToken) {
    const cookieToken = await readOrderTokenCookie(code);
    if (cookieToken && safeTokenEqual(cookieToken, order.ownerToken)) {
      return true;
    }
  }

  // Segunda vía: sesión del propio comprador. `getSession` necesita contexto de
  // petición (server action / route handler), que es donde se llama siempre.
  const session = await getSession();
  return !!session?.user?.id && session.user.id === order.userId;
}