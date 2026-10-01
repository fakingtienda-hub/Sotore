import { and, eq, isNotNull, max } from "drizzle-orm";
import { Readable } from "node:stream";
import type { NextRequest } from "next/server";

import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import { storage, StorageError } from "@/lib/server/storage";
import { getOrBuildProductPackZip } from "@/lib/server/pack";
import { rateLimit } from "@/lib/server/rate-limit";
import { serverEnv } from "@/lib/serverEnv";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/products/[productId]/pack">,
) {
  const { productId } = await ctx.params;

  // --- 0) Rate limit por usuario+producto (la generación es costosa) -------
  const session = await getSession();
  if (!session?.user) {
    return Response.json({ error: "Debes iniciar sesión para descargar." }, { status: 401 });
  }
  const userId = session.user.id;
  const limiter = rateLimit(`pack:${userId}:${productId}`, 10, 60_000);
  if (!limiter.ok) {
    return Response.json(
      { error: "Demasiadas peticiones. Intenta de nuevo en unos instantes." },
      { status: 429, headers: { "Retry-After": String(limiter.retryAfter ?? 60) } },
    );
  }

  // --- 2) Producto + compra activa (los admins pueden probarlo sin compra) --
  const [product] = await db
    .select({
      id: schema.products.id,
      slug: schema.products.slug,
      zipKey: schema.products.zipKey,
      zipSizeBytes: schema.products.zipSizeBytes,
    })
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

  // --- 3) Ventana post-pago del ZIP ---------------------------------------
  // El pack agrupa los archivos activos en carpetas; si alguno define
  // `minMinutesAfterPayment`, el ZIP respeta esa misma ventana (la más
  // restrictiva de los archivos incluidos) para no saltarse el desbloqueo
  // progresivo descargando todo junto.
  const [agg] = await db
    .select({ maxMin: max(schema.productFiles.minMinutesAfterPayment) })
    .from(schema.productFiles)
    .where(
      and(
        eq(schema.productFiles.productId, productId),
        eq(schema.productFiles.isActive, true),
        isNotNull(schema.productFiles.groupId),
      ),
    );

  const maxMin = agg?.maxMin ?? 0;
  if (maxMin > 0 && purchase?.grantedAt) {
    const elapsed = Date.now() - purchase.grantedAt.getTime();
    const minMs = maxMin * 60_000;
    if (elapsed < minMs) {
      const remaining = Math.ceil((minMs - elapsed) / 60_000);
      return Response.json(
        { error: `El pack estará disponible en ${remaining} minuto(s).` },
        { status: 423 },
      );
    }
  }

  // --- 4) Localizar el pack ------------------------------------------------
  const conventionalKey = `products/${productId}/pack.zip`;

  if (!product.zipKey && storage.kind === "r2") {
    // Con R2 el pack se sube a mano al bucket. Si el producto todavía no tiene
    // `zipKey` guardado, se adopta la clave convencional si el objeto existe, y
    // se persiste: no hace falta tocar la base de datos a mano por cada producto.
    const exists = await storage.exists(conventionalKey).catch(() => false);
    if (exists) {
      product.zipKey = conventionalKey;
      const { sizeBytes } = await storage.stat(conventionalKey);
      product.zipSizeBytes = sizeBytes;
      await db
        .update(schema.products)
        .set({ zipKey: conventionalKey, zipSizeBytes: sizeBytes, zipGeneratedAt: new Date() })
        .where(eq(schema.products.id, productId));
    }
  }

  if (!product.zipKey) {
    // Sin driver remoto se puede generar al vuelo (single-flight).
    if (storage.kind === "r2") {
      return Response.json(
        { error: "Este producto todavía no tiene un pack en el bucket." },
        { status: 404 },
      );
    }
    const result = await getOrBuildProductPackZip(productId);
    if (!result.ok) {
      return Response.json({ error: result.error ?? "No hay archivos para comprimir." }, { status: 404 });
    }
    product.zipKey = conventionalKey;
    product.zipSizeBytes = result.sizeBytes ?? 0;
  }

  const safeSlug = product.slug.replace(/[^a-z0-9-]/gi, "") || product.id;

  // --- 5) Servir el ZIP ----------------------------------------------------
  let total = product.zipSizeBytes ?? null;
  try {
    if (total == null) {
      total = (await storage.stat(product.zipKey)).sizeBytes;
    }
  } catch {
    return Response.json({ error: "El pack no se encontró en almacenamiento." }, { status: 404 });
  }

  // Con un driver remoto (R2) redirigimos a una URL firmada en vez de hacer
  // proxy de los bytes: los packs llegan a cientos de MB y pasarían enteros
  // por la función de Vercel. La autorización ya se validó arriba; la URL solo
  // existe unos minutos y R2 no cobra por salida a internet.
  if (storage.kind === "r2") {
    try {
      const signed = await storage.signedUrl(product.zipKey, {
        expiresInSeconds: serverEnv.signedUrlTtlSeconds,
        downloadName: `${safeSlug}.zip`,
      });
      if (signed) {
        return Response.redirect(signed, 302);
      }
    } catch (cause) {
      if (cause instanceof StorageError && cause.code === "NOT_FOUND") {
        return Response.json({ error: "El pack no se encontró en almacenamiento." }, { status: 404 });
      }
      return Response.json({ error: "Error al preparar la descarga." }, { status: 500 });
    }
  }

  let stream;
  try {
    stream = await storage.stream(product.zipKey);
    (stream as NodeJS.ReadableStream).on("error", () => {});
  } catch (cause) {
    if (cause instanceof StorageError && cause.code === "NOT_FOUND") {
      return Response.json({ error: "El pack no se encontró en almacenamiento." }, { status: 404 });
    }
    return Response.json({ error: "Error al servir el pack." }, { status: 500 });
  }

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