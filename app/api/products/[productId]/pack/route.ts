import { and, eq } from "drizzle-orm";
import { Readable } from "node:stream";
import type { NextRequest } from "next/server";

import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import { storage, StorageError } from "@/lib/server/storage";
import { buildProductPackZip } from "@/lib/server/pack";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/products/[productId]/pack">,
) {
  const { productId } = await ctx.params;

  // --- 1) Autenticación ---------------------------------------------------
  const session = await getSession();
  if (!session?.user) {
    return Response.json({ error: "Debes iniciar sesión para descargar." }, { status: 401 });
  }
  const userId = session.user.id;

  // --- 2) Producto + compra activa (los admins pueden probarlo sin compra) --
  const [product] = await db
    .select()
    .from(schema.products)
    .where(eq(schema.products.id, productId))
    .limit(1);

  if (!product) {
    return Response.json({ error: "Producto no encontrado." }, { status: 404 });
  }

  const [purchase] = await db
    .select()
    .from(schema.purchases)
    .where(
      and(
        eq(schema.purchases.userId, userId),
        eq(schema.purchases.productId, productId),
        eq(schema.purchases.status, "active"),
      ),
    )
    .limit(1);

  if (!purchase && session.user.role !== "admin") {
    return Response.json({ error: "No tienes acceso a este producto." }, { status: 403 });
  }

  // --- 3) Generar el pack al vuelo si aún no existe ------------------------
  if (!product.zipKey) {
    const result = await buildProductPackZip(productId);
    if (!result.ok) {
      return Response.json({ error: result.error ?? "No hay archivos para comprimir." }, { status: 404 });
    }
    product.zipKey = `products/${productId}/pack.zip`;
    product.zipSizeBytes = result.sizeBytes ?? 0;
  }

  // --- 4) Servir el ZIP ----------------------------------------------------
  let total = product.zipSizeBytes ?? null;
  try {
    if (total == null) {
      total = (await storage.stat(product.zipKey)).sizeBytes;
    }
  } catch {
    return Response.json({ error: "El pack no se encontró en almacenamiento." }, { status: 404 });
  }

  let stream;
  try {
    stream = storage.stream(product.zipKey);
  } catch (cause) {
    if (cause instanceof StorageError && cause.code === "NOT_FOUND") {
      return Response.json({ error: "El pack no se encontró en almacenamiento." }, { status: 404 });
    }
    return Response.json({ error: "Error al servir el pack." }, { status: 500 });
  }

  const safeSlug = product.slug.replace(/[^a-z0-9-]/gi, "") || product.id;

  return new Response(
    Readable.toWeb(stream as unknown as Readable) as unknown as ReadableStream,
    {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Length": String(total),
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`${safeSlug}.zip`)}`,
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}