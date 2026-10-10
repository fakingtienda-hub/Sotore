"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { randomBytes, randomUUID } from "node:crypto";
import { headers } from "next/headers";

import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { ensureOrderEntitlements } from "@/lib/server/entitlements";
import { claimCouponForApprovedOrder } from "@/lib/server/coupon-usage";
import { setOrderTokenCookie, ownerMatchesOrder } from "@/lib/server/order-ownership";
import { rateLimit } from "@/lib/server/rate-limit";
import { getWompiConfig } from "@/lib/server/wompi";
import { confirmOrderWithWompi } from "@/lib/server/reconciliation";
import { getSession } from "@/lib/auth/session";
import { serverEnv } from "@/lib/serverEnv";
import { orderExpiresAt, expireStalePendingOrders } from "@/lib/server/order-expiry";

async function createOrderAccessVerification(userId: string): Promise<string | null> {
  const [user] = await db
    .select({ email: schema.users.email, name: schema.users.name })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  if (!user?.email) return null;

  const token = randomBytes(24).toString("base64url");
  await db.insert(schema.verifications).values({
    id: randomUUID(),
    identifier: token,
    value: JSON.stringify({ email: user.email, name: user.name ?? "" }),
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
  });

  // El browser navega directamente al endpoint oficial de verify: ahí Better
  // Auth valida el token, crea la sesión y guarda su cookie SOLA (sin
  // intermediar el Set-Cookie desde una Server Action, que en Next no se
  // propaga de forma fiable). El callbackURL nos devuelve a /library.
  const url = new URL("/api/auth/magic-link/verify", serverEnv.appUrl);
  url.searchParams.set("token", token);
  url.searchParams.set("callbackURL", "/library");
  return url.toString();
}

const checkoutSchema = z.object({
  slug: z.string().trim().min(1).max(200),
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(255),
  phone: z
    .string()
    .trim()
    .regex(/^\d{6,15}$/, "El teléfono debe contener entre 6 y 15 dígitos.")
    .optional()
    .or(z.literal("")),
  phonePrefix: z.string().trim().max(8).optional(),
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
    .select({
      id: schema.products.id,
      slug: schema.products.slug,
      title: schema.products.title,
      shortDescription: schema.products.shortDescription,
      price: schema.products.price,
      compareAtPrice: schema.products.compareAtPrice,
      currency: schema.products.currency,
      coverImageUrl: schema.products.coverImageUrl,
      theme: schema.products.theme,
    })
    .from(schema.products)
    .where(and(eq(schema.products.slug, slug), eq(schema.products.status, "published")))
    .limit(1);
  return rows[0] ?? null;
}

// Producto elegido EXPRESAMENTE para vitrina (destacado / CTA del hero): se
// muestra su imagen y precio aunque siga en borrador (misma regla que el tema:
// la elección del admin manda). Para COMPRAR sí se exige publicado
// (getPublishedProductBySlug / createPendingOrder), por eso se expone `status`:
// la landing oculta los CTA de compra cuando el producto no está publicado.
// Se seleccionan solo los campos que el panel de vitrina usa (sin zipKey/seo/peso).
export async function getLandingShowcaseProduct(slug: string) {
  const rows = await db
    .select({
      id: schema.products.id,
      slug: schema.products.slug,
      title: schema.products.title,
      price: schema.products.price,
      compareAtPrice: schema.products.compareAtPrice,
      currency: schema.products.currency,
      coverImageUrl: schema.products.coverImageUrl,
      theme: schema.products.theme,
      status: schema.products.status,
    })
    .from(schema.products)
    .where(eq(schema.products.slug, slug))
    .limit(1);
  return rows[0] ?? null;
}

async function getOrCreateGuestUser(
  name: string,
  email: string,
  phone?: string,
  phonePrefix?: string,
): Promise<string> {
  const normalized = email.trim().toLowerCase();
  const existing = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, normalized))
    .limit(1);

  if (existing.length > 0) {
    // El teléfono que el comprador acaba de escribir es la fuente más
    // reciente: se actualiza para que el pre-llenado de Wompi siempre use el
    // contacto vigente.
    if (phone) {
      await db
        .update(schema.users)
        .set({ phone, phonePrefix: phonePrefix ?? null, updatedAt: new Date() })
        .where(eq(schema.users.id, existing[0].id));
    }
    return existing[0].id;
  }

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
      phone: phone || null,
      phonePrefix: phonePrefix || null,
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
  const { slug, name, email, phone, phonePrefix, couponCode } = parsed.data;

  const reqHeaders = await headers();
  const ip = reqHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = rateLimit(`create-order:${ip}`, 10, 60_000);
  if (!rl.ok) {
    return { ok: false, error: "Demasiados intentos. Espera un momento e inténtalo de nuevo." };
  }

  const product = await getPublishedProductBySlug(slug);
  if (!product) {
    return { ok: false, error: "El producto no está disponible." };
  }

  const userId = await getOrCreateGuestUser(name, email, phone || undefined, phonePrefix || undefined);

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
      expiresAt: orderExpiresAt(),
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
  const config = await getWompiConfig();
  if (serverEnv.isProd || config.configured) {
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

  revalidatePath("/admin/sales");
  return { ok: true };
}

/**
 * Estado real de una orden en el camino de pago. Lo llama la página
 * `/checkout/payment-result` (a la que Wompi redirige al comprador) para no
 * dejar al usuario en "verificación" infinita. Administra titularidad vía la
 * cookie de la orden (IDOR). NO crea sesiones aquí: el acceso a la biblioteca
 * se concede con `getLibraryAccessUrl` (navegando al verify de Better Auth).
 */
export async function getCheckoutOrderStatus(
  orderCode: string,
): Promise<{ ok: true; status: string } | { ok: false; error?: string }> {
  const rl = rateLimit(`order-status:${orderCode}`, 60, 60_000);
  if (!rl.ok) {
    return { ok: false, error: "Demasiadas consultas de estado." };
  }

  await expireStalePendingOrders();

  const ownsOrder = await ownerMatchesOrder(orderCode);
  if (!ownsOrder) {
    return { ok: false, error: "No tienes acceso a esa orden." };
  }

  const [order] = await db
    .select({ status: schema.orders.status })
    .from(schema.orders)
    .where(eq(schema.orders.code, orderCode))
    .limit(1);

  if (!order) {
    return { ok: false, error: "La orden no existe." };
  }

  // Confirmación a demanda: mientras la orden siga pendiente se le pregunta a
  // Wompi AHORA, en vez de esperar a que llegue el webhook o a que corra la
  // reconciliación (que necesita un cron externo que puede no estar puesto).
  // Antes de esto el comprador veía "Confirmando…" hasta agotar los sondeos,
  // con el pago ya cobrado. Un fallo de la consulta no rompe la página: se
  // devuelve el estado que haya en la base.
  let status = order.status;
  if (status === "pending") {
    const confirmed = await confirmOrderWithWompi(orderCode).catch(() => null);
    if (confirmed && confirmed !== status) {
      status = confirmed;
      // El acceso recién concedido tiene que verse en la biblioteca sin esperar
      // a que otra petición revalide la ruta.
      revalidatePath("/library");
      revalidatePath("/admin/sales");
    }
  }

  return { ok: true, status };
}

/**
 * URL de acceso a la biblioteca para una orden aprobada. Solo el titular de la
 * orden (cookie de orden) puede pedirla. Si el comprador ya tiene sesión
 * activa devuelve `/library` directo; si no, emite una verificación de magic
 * link single-use (10 min) y devuelve la URL oficial de verify para que el
 * navegador cree la sesión con su propio Set-Cookie.
 */
export async function getLibraryAccessUrl(
  orderCode: string,
): Promise<{ ok: true; url: string } | { ok: false; error?: string }> {
  const rl = rateLimit(`library-access:${orderCode}`, 60, 60_000);
  if (!rl.ok) {
    return { ok: false, error: "Demasiadas solicitudes. Intenta en unos segundos." };
  }

  await expireStalePendingOrders();

  const ownsOrder = await ownerMatchesOrder(orderCode);
  if (!ownsOrder) {
    return { ok: false, error: "No tienes acceso a esa orden." };
  }

  const [order] = await db
    .select({ userId: schema.orders.userId, status: schema.orders.status })
    .from(schema.orders)
    .where(eq(schema.orders.code, orderCode))
    .limit(1);

  if (!order) {
    return { ok: false, error: "La orden no existe." };
  }
  if (order.status !== "approved") {
    return { ok: false, error: "El pago todavía no se ha confirmado." };
  }

  const session = await getSession();
  if (session?.user?.id === order.userId) {
    return { ok: true, url: "/library" };
  }

  const url = await createOrderAccessVerification(order.userId);
  if (!url) {
    return { ok: false, error: "No se pudo iniciar sesión automáticamente." };
  }
  return { ok: true, url };
}