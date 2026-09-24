import "server-only";

import { eq } from "drizzle-orm";
import { cookies } from "next/headers";

import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
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
 * Verifica que quien invoca conoce el token de titularidad de la orden
 * (guardado en `orders.owner_token` y en una cookie httpOnly emitida al crear
 * la orden). Las órdenes legadas (sin token) NO se auto-curan: necesitan el
 * backfill de `scripts/backfill-order-tokens.ts` para dejar de buscarse, y
 * mientras tanto se rechazan (evita reclamar órdenes ajenas adivinando el
 * código).
 */
export async function ownerMatchesOrder(code: string): Promise<boolean> {
  const [order] = await db
    .select({ ownerToken: schema.orders.ownerToken })
    .from(schema.orders)
    .where(eq(schema.orders.code, code))
    .limit(1);
  if (!order) return false;

  if (!order.ownerToken) {
    return false;
  }

  const cookieToken = await readOrderTokenCookie(code);
  if (!cookieToken) return false;
  return safeTokenEqual(cookieToken, order.ownerToken);
}