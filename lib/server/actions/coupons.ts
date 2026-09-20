"use server";

import { and, desc, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import { COUPON_TYPES } from "@/lib/constants";

const couponSchema = z
  .object({
    id: z.string().uuid().optional(),
    code: z.string().trim().min(3).max(60),
    type: z.enum(COUPON_TYPES),
    value: z.coerce.number().min(0, "El valor no puede ser negativo"),
    maxUses: z.preprocess(
      (v) => (v === "" || v == null ? null : v),
      z.coerce.number().int().min(1).nullable(),
    ),
    productScope: z.array(z.string().uuid()).optional().default([]),
    startsAt: z.preprocess((v) => (v === "" || v == null ? null : v), z.coerce.date().nullable()).nullable(),
    endsAt: z.preprocess((v) => (v === "" || v == null ? null : v), z.coerce.date().nullable()).nullable(),
    status: z.enum(["active", "disabled"]).default("active"),
  })
  .refine((data) => (data.endsAt == null ? true : data.startsAt == null || data.startsAt < data.endsAt), {
    message: "La fecha de fin debe ser posterior a la de inicio.",
    path: ["endsAt"],
  })
  .refine((data) => (data.type === "percentage" ? data.value >= 0 && data.value <= 100 : data.value >= 0), {
    message: "El porcentaje debe estar entre 0 y 100.",
    path: ["value"],
  });

export async function listCoupons() {
  await requireAdmin();
  return db.select().from(schema.coupons).orderBy(desc(schema.coupons.createdAt));
}

export async function listProductsForCoupons() {
  await requireAdmin();
  return db
    .select({ id: schema.products.id, title: schema.products.title, slug: schema.products.slug, price: schema.products.price })
    .from(schema.products)
    .orderBy(desc(schema.products.createdAt));
}

export async function saveCoupon(input: unknown): Promise<{ ok: boolean; error?: string; id?: string }> {
  await requireAdmin();
  const parsed = couponSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((e) => e.message).join("; ") };
  }
  const { id, code, type, value, maxUses, productScope, startsAt, endsAt, status } = parsed.data;
  const normalizedCode = code.toUpperCase();

  const duplicate = await db
    .select({ id: schema.coupons.id })
    .from(schema.coupons)
    .where(and(eq(schema.coupons.code, normalizedCode), id ? ne(schema.coupons.id, id) : undefined))
    .limit(1);
  if (duplicate.length > 0) {
    return { ok: false, error: "Ya existe un cupón con ese código." };
  }

  const values = {
    code: normalizedCode,
    type,
    value,
    maxUses,
    productScope: productScope.length > 0 ? productScope : null,
    startsAt,
    endsAt,
    status,
  };

  let couponId = id;
  if (id) {
    await db.update(schema.coupons).set({ ...values, updatedAt: new Date() }).where(eq(schema.coupons.id, id));
  } else {
    const inserted = await db
      .insert(schema.coupons)
      .values(values)
      .returning({ id: schema.coupons.id });
    couponId = inserted[0].id;
  }

  revalidatePath("/admin/coupons");
  return { ok: true, id: couponId };
}

export async function toggleCouponStatus(id: string): Promise<{ ok: boolean }> {
  await requireAdmin();
  const [coupon] = await db.select().from(schema.coupons).where(eq(schema.coupons.id, id)).limit(1);
  if (!coupon) return { ok: false };
  const next = coupon.status === "active" ? "disabled" : "active";
  await db.update(schema.coupons).set({ status: next, updatedAt: new Date() }).where(eq(schema.coupons.id, id));
  revalidatePath("/admin/coupons");
  return { ok: true };
}

export async function deleteCoupon(id: string): Promise<{ ok: boolean }> {
  await requireAdmin();
  const used = await db
    .select({ id: schema.orders.id })
    .from(schema.orders)
    .where(eq(schema.orders.couponId, id))
    .limit(1);
  if (used.length > 0) return { ok: false };
  await db.delete(schema.coupons).where(eq(schema.coupons.id, id));
  revalidatePath("/admin/coupons");
  return { ok: true };
}