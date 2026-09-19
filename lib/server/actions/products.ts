"use server";

import { desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/session";

import { FILE_TYPES, PRODUCT_STATUSES, DEFAULT_LANDING_THEME, isLandingTheme } from "@/lib/constants";
import { buildProductPackZip } from "@/lib/server/pack";
import { storage } from "@/lib/server/storage";

const priceSchema = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z.coerce.number().min(0).finite(),
);

const productInputSchema = z.object({
  title: z.string().trim().min(2).max(200),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(200)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug inválido (solo minúsculas, números y guiones)."),
  shortDescription: z.string().trim().max(300).optional(),
  description: z.string().trim().max(10000).optional(),
  price: priceSchema,
  compareAtPrice: priceSchema.optional().nullable(),
  currency: z.enum(["COP", "USD", "MXN", "EUR"]).default("COP"),
  theme: z.string().trim().refine(isLandingTheme, { message: "Apariencia de la landing inválida." }).default(DEFAULT_LANDING_THEME),
  categoryId: z.string().uuid().nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(12).optional(),
  status: z.enum(PRODUCT_STATUSES).default("draft"),
  coverImageUrl: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .nullable()
    .refine(
      (value) => {
        if (value == null || value === "") return true;
        if (value.startsWith("/") || /^https?:\/\//i.test(value)) return true;
        try {
          new URL(value);
          return true;
        } catch {
          return false;
        }
      },
      { message: "coverImageUrl debe ser una URL absoluta o una ruta local (/…) " },
    ),
});

const fileInputSchema = z.object({
  productId: z.string().uuid(),
  files: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(200),
        description: z.string().trim().max(500).optional(),
        fileType: z.enum(FILE_TYPES).default("other"),
        mimeType: z.string().trim().max(120).optional().nullable(),
        sizeBytes: z.coerce.number().int().min(0).default(0),
        storageKey: z.string().trim().min(1).max(512),
        storageProvider: z.enum(["local", "s3-compatible"]).default("s3-compatible"),
        downloadLimit: z.coerce.number().int().min(0).nullable().optional(),
        groupId: z.string().uuid().nullable().optional(),
        sortOrder: z.coerce.number().int().default(0),
      }),
    )
    .min(1),
});

const groupInputSchema = z.object({
  productId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
});

export type ProductListResult = {
  id: string;
  title: string;
  slug: string;
  price: number;
  currency: string;
  theme: string;
  status: string;
  categoryId: string | null;
  coverImageUrl: string | null;
  shortDescription: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const listSelect = {
  id: schema.products.id,
  title: schema.products.title,
  slug: schema.products.slug,
  price: schema.products.price,
  currency: schema.products.currency,
  theme: schema.products.theme,
  status: schema.products.status,
  categoryId: schema.products.categoryId,
  coverImageUrl: schema.products.coverImageUrl,
  shortDescription: schema.products.shortDescription,
  createdAt: schema.products.createdAt,
  updatedAt: schema.products.updatedAt,
} as const;

export async function listProducts(): Promise<ProductListResult[]> {
  return db.select(listSelect).from(schema.products).orderBy(desc(schema.products.createdAt));
}

export async function getProduct(idOrSlug: string) {
  const rows = await db.select().from(schema.products).where(eq(schema.products.id, idOrSlug));
  return rows[0] ?? null;
}

export async function createProduct(input: unknown): Promise<{ ok: boolean; error?: string; id?: string }> {
  await requireAdmin();
  const parsed = productInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((e) => e.message).join("; ") };
  }
  const data = parsed.data;
  const inserted = await db
    .insert(schema.products)
    .values({
      title: data.title,
      slug: data.slug,
      shortDescription: data.shortDescription ?? null,
      description: data.description ?? null,
      price: data.price,
      compareAtPrice: data.compareAtPrice ?? null,
      currency: data.currency,
      categoryId: data.categoryId ?? null,
      tags: data.tags ?? [],
      theme: data.theme,
      status: data.status,
      coverImageUrl: data.coverImageUrl ?? null,
    })
    .returning({ id: schema.products.id });
  revalidatePath("/admin/products");
  return { ok: true, id: inserted[0].id };
}

export async function updateProduct(id: string, input: unknown): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  const parsed = productInputSchema.partial().safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((e) => e.message).join("; ") };
  }
  const data = parsed.data;
  await db
    .update(schema.products)
    .set({
      ...(data.title !== undefined && { title: data.title }),
      ...(data.slug !== undefined && { slug: data.slug }),
      ...(data.shortDescription !== undefined && { shortDescription: data.shortDescription ?? null }),
      ...(data.description !== undefined && { description: data.description ?? null }),
      ...(data.price !== undefined && { price: data.price }),
      ...(data.compareAtPrice !== undefined && { compareAtPrice: data.compareAtPrice }),
      ...(data.currency !== undefined && { currency: data.currency }),
      ...(data.categoryId !== undefined && { categoryId: data.categoryId }),
      ...(data.tags !== undefined && { tags: data.tags }),
      ...(data.status !== undefined && { status: data.status }),
      ...(data.coverImageUrl !== undefined && { coverImageUrl: data.coverImageUrl }),
      ...(data.theme !== undefined && { theme: data.theme }),
      updatedAt: new Date(),
    })
    .where(eq(schema.products.id, id));
  revalidatePath("/admin/products");
  revalidatePath("/", "layout");
  revalidatePath("/que-incluye");
  return { ok: true };
}

export async function deleteProduct(id: string): Promise<void> {
  await requireAdmin();
  const files = await db
    .select({ storageKey: schema.productFiles.storageKey, storageProvider: schema.productFiles.storageProvider })
    .from(schema.productFiles)
    .where(eq(schema.productFiles.productId, id));
  await db.delete(schema.productFiles).where(eq(schema.productFiles.productId, id));
  await db.delete(schema.products).where(eq(schema.products.id, id));
  for (const file of files) {
    if (file.storageProvider === "local") {
      await storage.remove(file.storageKey);
    }
  }
  revalidatePath("/admin/products");
}

export async function saveProductFiles(id: string, input: unknown): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  if (typeof input !== "object" || input === null || (input as Record<string, unknown>)?.["productId"] !== id) {
    return { ok: false, error: "El id del producto no coincide con el payload." };
  }
  const parsed = fileInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((e) => e.message).join("; ") };
  }
  const fileRows = parsed.data.files.map((f) => ({
    productId: parsed.data.productId,
    name: f.name,
    description: f.description ?? null,
    fileType: f.fileType,
    mimeType: f.mimeType ?? null,
    sizeBytes: f.sizeBytes,
    storageKey: f.storageKey,
    storageProvider: f.storageProvider,
    downloadLimit: f.downloadLimit ?? null,
    groupId: f.groupId ?? null,
    sortOrder: f.sortOrder,
  }));

  const previous = await db
    .select({ storageKey: schema.productFiles.storageKey, storageProvider: schema.productFiles.storageProvider })
    .from(schema.productFiles)
    .where(eq(schema.productFiles.productId, id));

  await db.delete(schema.productFiles).where(eq(schema.productFiles.productId, id));
  await db.insert(schema.productFiles).values(fileRows);

  const activeKeys = new Set(fileRows.map((f) => f.storageKey));
  for (const prev of previous) {
    if (prev.storageProvider === "local" && !activeKeys.has(prev.storageKey)) {
      await storage.remove(prev.storageKey);
    }
  }

  revalidatePath("/admin/products");
  return { ok: true };
}

export async function listProductFiles(productId: string): Promise<schema.ProductFile[]> {
  await requireAdmin();
  return db
    .select()
    .from(schema.productFiles)
    .where(eq(schema.productFiles.productId, productId))
    .orderBy(desc(schema.productFiles.sortOrder));
}

export async function listProductFileGroups(productId: string): Promise<schema.ProductFileGroup[]> {
  await requireAdmin();
  return db
    .select()
    .from(schema.productFileGroups)
    .where(eq(schema.productFileGroups.productId, productId))
    .orderBy(schema.productFileGroups.position);
}

export async function createProductFileGroup(
  input: unknown,
): Promise<{ ok: boolean; error?: string; id?: string }> {
  await requireAdmin();
  const parsed = groupInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((e) => e.message).join("; ") };
  }
  const { productId, name } = parsed.data;
  const nextPosition = (await db
    .select({ pos: schema.productFileGroups.position })
    .from(schema.productFileGroups)
    .where(eq(schema.productFileGroups.productId, productId))
    .orderBy(desc(schema.productFileGroups.position))
    .limit(1))[0] as { pos: number } | undefined;

  const inserted = await db
    .insert(schema.productFileGroups)
    .values({ productId, name, position: (nextPosition?.pos ?? -1) + 1 })
    .returning({ id: schema.productFileGroups.id });
  revalidatePath("/admin/products");
  return { ok: true, id: inserted[0].id };
}

export async function renameProductFileGroup(
  id: string,
  name: string,
): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  const trimmed = name.trim().slice(0, 120);
  if (!trimmed) return { ok: false, error: "El nombre no puede estar vacío." };
  await db
    .update(schema.productFileGroups)
    .set({ name: trimmed, updatedAt: new Date() })
    .where(eq(schema.productFileGroups.id, id));
  revalidatePath("/admin/products");
  return { ok: true };
}

export async function deleteProductFileGroup(id: string): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  await db.delete(schema.productFileGroups).where(eq(schema.productFileGroups.id, id));
  revalidatePath("/admin/products");
  return { ok: true };
}

export async function generatePackZip(
  productId: string,
): Promise<{ ok: boolean; error?: string; sizeBytes?: number }> {
  await requireAdmin();
  const [product] = await db
    .select()
    .from(schema.products)
    .where(eq(schema.products.id, productId))
    .limit(1);

  if (!product) return { ok: false, error: "El producto no existe." };

  const result = await buildProductPackZip(productId);
  revalidatePath("/admin/products");
  return result;
}
