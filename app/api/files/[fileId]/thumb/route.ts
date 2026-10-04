import { and, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";

import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import { rateLimit } from "@/lib/server/rate-limit";
import { getOrCreateThumb, thumbDefFor } from "@/lib/server/thumbs";

export const dynamic = "force-dynamic";
/* Renderizar un PDF/imagen (mupdf/sharp) puede tardar en el primer uso por el
   cold start del WASM/addon; damos margen sobre el timeout por defecto. */
export const maxDuration = 60;

export async function GET(
  _request: NextRequest,
  ctx: RouteContext<"/api/files/[fileId]/thumb">,
) {
  const { fileId } = await ctx.params;

  // --- 1) Autenticación ---------------------------------------------------
  const session = await getSession();
  if (!session?.user) {
    return Response.json({ error: "Debes iniciar sesión para ver el archivo." }, { status: 401 });
  }
  const userId = session.user.id;

  // --- 0) Rate limit por usuario ------------------------------------------
  // Una biblioteca con lote de miniaturas usa HOY hasta ~235 peticiones al
  // cargar todas las fichas; 600/min frena abuso/DoS por usuario sin romper
  // la experiencia del scroll.
  const limiter = rateLimit(`thumb:${userId}`, 600, 60_000);
  if (!limiter.ok) {
    return Response.json(
      { error: "Demasiadas peticiones. Intenta de nuevo en unos instantes." },
      { status: 429, headers: { "Retry-After": String(limiter.retryAfter ?? 60) } },
    );
  }

  // --- 2) Archivo ---------------------------------------------------------
  const [file] = await db
    .select()
    .from(schema.productFiles)
    .where(and(eq(schema.productFiles.id, fileId), eq(schema.productFiles.isActive, true)))
    .limit(1);

  if (!file) {
    return Response.json({ error: "Archivo no encontrado." }, { status: 404 });
  }

  // --- 3) Compra activa del producto (los admins pueden probarlo) ----------
  const [purchase] = await db
    .select()
    .from(schema.purchases)
    .where(
      and(
        eq(schema.purchases.userId, userId),
        eq(schema.purchases.productId, file.productId),
        eq(schema.purchases.status, "active"),
      ),
    )
    .limit(1);

  if (!purchase && session.user.role !== "admin") {
    return Response.json({ error: "No tienes acceso a este archivo." }, { status: 403 });
  }

  // --- 4) Minutos mínimos tras pago ---------------------------------------
  if (file.minMinutesAfterPayment > 0 && purchase?.grantedAt) {
    const elapsed = Date.now() - purchase.grantedAt.getTime();
    const minMs = file.minMinutesAfterPayment * 60_000;
    if (elapsed < minMs) {
      const remaining = Math.ceil((minMs - elapsed) / 60_000);
      return Response.json(
        { error: `El acceso a este archivo está disponible en ${remaining} minuto(s).` },
        { status: 423 },
      );
    }
  }

  // --- 5) Sin miniatura disponible (PDF/imagen) ---------------------------
  if (!thumbDefFor(file)) {
    return Response.json({ error: "Este archivo no tiene miniatura." }, { status: 404 });
  }

  // --- 6) Generar (y cachear) la miniatura --------------------------------
  let thumb;
  try {
    thumb = await getOrCreateThumb(file);
  } catch {
    return Response.json({ error: "No se pudo generar la miniatura." }, { status: 500 });
  }

  return new Response(new Uint8Array(thumb.data), {
    status: 200,
    headers: {
      "Content-Type": thumb.mimeType,
      "Content-Length": String(thumb.data.byteLength),
      "Cache-Control": "private, max-age=86400, stale-while-revalidate=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}