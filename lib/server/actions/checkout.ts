"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { randomBytes, randomUUID } from "node:crypto";
import { cookies } from "next/headers";

import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { ensureOrderEntitlements } from "@/lib/server/entitlements";
import { claimCouponForApprovedOrder } from "@/lib/server/coupon-usage";
import { setOrderTokenCookie, ownerMatchesOrder } from "@/lib/server/order-ownership";
import { getWompiConfig } from "@/lib/server/wompi";
import { auth } from "@/lib/auth/server";
import { serverEnv } from "@/lib/serverEnv";

async function setBuyerSessionCookie(userId: string) {
  const [user] = await db
    .select({ email: schema.users.email, name: schema.users.name })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  if (!user) return;

  const ctx = await auth.$context;
  const token = randomBytes(24).toString("base64url");
  await ctx.internalAdapter.createVerificationValue({
    identifier: token,
    value: JSON.stringify({ email: user.email, name: user.name ?? "" }),
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
  });

  const url = new URL("/api/auth/magic-link/verify", serverEnv.appUrl);
  url.searchParams.set("token", token);
  url.searchParams.set("callbackURL", "/library");
  const res = await auth.handler(new Request(url));

  const cookieStore = await cookies();
  const setCookieEntries =
    typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  for (const entry of setCookieEntries) {
    const cookiePart = entry.split(";")[0].trim();
    const eqIdx = cookiePart.indexOf("=");
    if (eqIdx === -1) continue;
    const name = cookiePart.slice(0, eqIdx).trim();
    if (!name.startsWith("fakingstore")) continue;
    let rawValue = cookiePart.slice(eqIdx + 1).trim();
    if (rawValue.startsWith('"') && rawValue.endsWith('"')) {
      rawValue = rawValue.slice(1, -1);
    }
    let value: string;
    try {
      value = decodeURIComponent(rawValue);
    } catch {
      value = rawValue;
    }
    cookieStore.set(name, value, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: serverEnv.isProd,
      maxAge: 7 * 24 * 60 * 60,
    });
  }
}

const checkoutSchema = z.object({
  slug: z.string().trim().min(1).max(200),
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(255),
  couponCode: z.string().trim().max(60).optional(),
});

const couponLookupSchema = z.object({
  code: z.string().trim().min(1).max(60),
  productId: z.string().uuid(),
});

type CouponResolution = {
  coupon: schema.Coupon | null;
  discount: number;
  error?: string;
};

async function resolveCoupon(code: string, productId: string, price: number): Promise<CouponResolution> {
  const normalized = code.trim().toUpperCase();
  const [coupon] = await db
    .select()
    .from(schema.coupons)
    .where(eq(schema.coupons.code, normalized))
    .limit(1);

  if (!coupon) {
    return { coupon: null, discount: 0, error: "El cupón no existe." };
  }
  if (coupon.status !== "active") {
    return { coupon: null, discount: 0, error: "Este cupón ya no está activo." };
  }
  const now = new Date();
  if (coupon.startsAt && coupon.startsAt > now) {
    return { coupon: null, discount: 0, error: "El cupón todavía no está vigente." };
  }
  if (coupon.endsAt && coupon.endsAt < now) {
    return { coupon: null, discount: 0, error: "El cupón ya venció." };
  }
  if (coupon.maxUses != null && coupon.usedCount >= coupon.maxUses) {
    return { coupon: null, discount: 0, error: "El cupón alcanzó su límite de usos." };
  }
  const scope = coupon.productScope ?? [];
  if (scope.length > 0 && !scope.includes(productId)) {
    return { coupon: null, discount: 0, error: "Este cupón no aplica para este producto." };
  }

  let discount = 0;
  if (coupon.type === "percentage") {
    discount = Math.round((price * coupon.value) / 100);
  } else {
    discount = coupon.value;
  }
  discount = Math.min(Math.max(0, Math.round(discount)), price);

  return { coupon, discount };
}

export async function getCouponDiscount(
  code: string,
  productId: string,
): Promise<{ ok: boolean; discount?: number; error?: string }> {
  const parsed = couponLookupSchema.safeParse({ code, productId });
  if (!parsed.success) {
    return { ok: false, error: "Cupón o producto inválido." };
  }
  const [product] = await db
    .select({ id: schema.products.id, price: schema.products.price })
    .from(schema.products)
    .where(eq(schema.products.id, parsed.data.productId))
    .limit(1);
  if (!product) {
    return { ok: false, error: "Producto inválido." };
  }
  const result = await resolveCoupon(parsed.data.code, product.id, product.price);
  if (result.error || !result.coupon) {
    return { ok: false, error: result.error ?? "Cupón inválido." };
  }
  return { ok: true, discount: result.discount };
}

export async function getPublishedProductBySlug(slug: string) {
  const rows = await db
    .select()
    .from(schema.products)
    .where(and(eq(schema.products.slug, slug), eq(schema.products.status, "published")))
    .limit(1);
  return rows[0] ?? null;
}

// Producto elegido EXPRESAMENTE para vitrina (destacado / CTA del hero): se
// muestra su imagen y precio aunque siga en borrador (misma regla que el tema:
// la elección del admin manda). Para COMPRAR sí se exige publicado
// (getPublishedProductBySlug / createPendingOrder).
export async function getLandingShowcaseProduct(slug: string) {
  const rows = await db
    .select()
    .from(schema.products)
    .where(eq(schema.products.slug, slug))
    .limit(1);
  return rows[0] ?? null;
}

async function getOrCreateGuestUser(name: string, email: string): Promise<string> {
  const normalized = email.trim().toLowerCase();
  const existing = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, normalized))
    .limit(1);

  if (existing.length > 0) return existing[0].id;

  const id = randomUUID();
  await db
    .insert(schema.users)
    .values({
      id,
      name: name.trim(),
      email: normalized,
      emailVerified: false,
      role: "customer",
      status: "active",
    })
    .onConflictDoNothing({ target: schema.users.email });

  const after = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, normalized))
    .limit(1);
  return after[0]?.id ?? id;
}

function generateOrderCode(): string {
  const stamp = Date.now().toString(36).toUpperCase().slice(-5);
  return `FS-${stamp}-${randomUUID().slice(0, 6).toUpperCase()}`;
}

export async function createPendingOrder(input: unknown): Promise<{
  ok: boolean;
  orderId?: string;
  orderCode?: string;
  error?: string;
}> {
  const parsed = checkoutSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((e) => e.message).join("; ") };
  }
  const { slug, name, email, couponCode } = parsed.data;

  const product = await getPublishedProductBySlug(slug);
  if (!product) {
    return { ok: false, error: "El producto no está disponible." };
  }

  const userId = await getOrCreateGuestUser(name, email);

  let discount = 0;
  let couponId: string | null = null;
  let couponUsedCode: string | null = null;
  if (couponCode && couponCode.trim() !== "") {
    const resolved = await resolveCoupon(couponCode, product.id, product.price);
    if (resolved.error || !resolved.coupon) {
      return { ok: false, error: resolved.error ?? "Cupón inválido." };
    }
    discount = resolved.discount;
    couponId = resolved.coupon.id;
    couponUsedCode = resolved.coupon.code;
  }

  const subtotal = Math.round(product.price);
  const total = Math.max(0, subtotal - discount);
  const orderId = randomUUID();
  const orderCode = generateOrderCode();
  const ownerToken = randomBytes(24).toString("base64url");

  let insertedOrderId: string | undefined;
  await db.transaction(async (tx) => {
    await tx.insert(schema.orders).values({
      id: orderId,
      code: orderCode,
      userId,
      status: "pending",
      subtotal,
      discount,
      total,
      currency: product.currency,
      couponCode: couponUsedCode,
      couponId,
      ownerToken,
    });
    await tx.insert(schema.orderItems).values({
      orderId,
      productId: product.id,
      productTitleSnapshot: product.title,
      unitPrice: subtotal,
      quantity: 1,
      currency: product.currency,
    });
    // NOTA: el cupón NO se consume al crear la orden (las órdenes abandonadas
    // no deben agotar el presupuesto). `claimCouponForApprovedOrder` lo
    // consume de forma atómica solo cuando la orden se aprueba.
    insertedOrderId = orderId;
  });

  revalidatePath("/admin/sales");
  await setOrderTokenCookie(orderCode, ownerToken);
  return { ok: true, orderId: insertedOrderId, orderCode };
}

/**
 * Modo demo (local): marca la orden como aprobada sin pasar por Wompi.
 * Solo para desarrollo/testing sin Wompi configurada: en producción o con la
 * pasarela activa la acción se niega, y además el caller debe acreditar la
 * titularidad de la orden (cookie de titularidad + ownerToken en BD).
 */
export async function simulateDemoPayment(orderCode: string): Promise<{ ok: boolean; error?: string }> {
  if (serverEnv.isProd || getWompiConfig().configured) {
    return {
      ok: false,
      error: "El pago demo solo está disponible en desarrollo sin Wompi configurada.",
    };
  }

  const ownsOrder = await ownerMatchesOrder(orderCode);
  if (!ownsOrder) {
    return { ok: false, error: "No tienes acceso a esa orden." };
  }

  const [order] = await db
    .select()
    .from(schema.orders)
    .where(eq(schema.orders.code, orderCode))
    .limit(1);
  if (!order) {
    return { ok: false, error: "La orden no existe." };
  }

  const claimed = await db
    .update(schema.orders)
    .set({
      status: "approved",
      gateway: "demo",
      gatewayStatus: "approved",
      paidAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(schema.orders.id, order.id), eq(schema.orders.status, "pending")))
    .returning({ id: schema.orders.id });

  if (claimed.length === 0) {
    return { ok: false, error: "La orden ya no está pendiente." };
  }

  const delivered = await ensureOrderEntitlements(order.id);
  if (!delivered.ok) {
    return { ok: false, error: delivered.reason ?? "No se pudo activar la entrega." };
  }

  await claimCouponForApprovedOrder(order.id);

  await setBuyerSessionCookie(order.userId);

  revalidatePath("/admin/sales");
  return { ok: true };
}