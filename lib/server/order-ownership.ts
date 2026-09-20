import "server-only";

import { eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";

import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { serverEnv } from "@/lib/serverEnv";

const COOKIE_PREFIX = "fakingstore.order_token";

export function orderTokenCookieName(code: string): string {
  return `${COOKIE_PREFIX}.${code}`;
}

/** Comparación constante en tiempo (evita timing attacks sobre el token). */
export function safeTokenEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
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
 * la orden). Las órdenes legadas (sin token, creadas antes de este fix) se
 * auto-curan: se les emite token y se considera al caller como titular, para
 * no dejar órdenes pendientes existentes inaccesibles.
 */
export async function ownerMatchesOrder(code: string): Promise<boolean> {
  const [order] = await db
    .select({ ownerToken: schema.orders.ownerToken })
    .from(schema.orders)
    .where(eq(schema.orders.code, code))
    .limit(1);
  if (!order) return false;

  if (!order.ownerToken) {
    const token = randomBytes(24).toString("base64url");
    await db
      .update(schema.orders)
      .set({ ownerToken: token })
      .where(eq(schema.orders.code, code));
    await setOrderTokenCookie(code, token);
    return true;
  }

  const cookieToken = await readOrderTokenCookie(code);
  if (!cookieToken) return false;
  return safeTokenEqual(cookieToken, order.ownerToken);
}