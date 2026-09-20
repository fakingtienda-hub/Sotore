import { and, eq } from "drizzle-orm";
import { Readable } from "node:stream";
import type { NextRequest } from "next/server";

import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import { mimeFor, storage, StorageError } from "@/lib/server/storage";
import { rateLimit } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/files/[fileId]/view">,
) {
  const { fileId } = await ctx.params;

  // --- 1) Autenticación ---------------------------------------------------
  const session = await getSession();
  if (!session?.user) {
    return Response.json({ error: "Debes iniciar sesión para ver el archivo." }, { status: 401 });
  }
  const userId = session.user.id;

  // --- 1b) Rate limit por usuario (los rangos de vídeo generan varias peticiones)
  const limiter = rateLimit(`view:${userId}`, 300, 60_000);
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

  // --- 3) Compra activa del producto (los admins pueden probarlo sin compra) -
  const isAdmin = session.user.role === "admin";
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

  if (!purchase && !isAdmin) {
    return Response.json({ error: "No tienes acceso a este archivo." }, { status: 403 });
  }

  // --- 4) Minutos mínimos tras pago (minMinutesAfterPayment) ---------------
  if (purchase && file.minMinutesAfterPayment > 0 && purchase.grantedAt) {
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

  // Ver en línea NO descuenta del límite de descargas ni se registra en `downloads`.

  // --- 5) Servir el archivo (streaming + Range) ----------------------------
  let total = file.sizeBytes ?? null;
  if (total == null) {
    try {
      total = (await storage.stat(file.storageKey)).sizeBytes;
    } catch {
      return Response.json({ error: "Archivo no encontrado en almacenamiento." }, { status: 404 });
    }
  }

  const storedMime = file.mimeType?.trim().toLowerCase();
  const derivedMime = mimeFor(file.storageKey);
  const contentType =
    storedMime && storedMime !== "application/octet-stream" && storedMime !== "text/plain"
      ? storedMime
      : derivedMime ?? storedMime ?? "application/octet-stream";
  const baseHeaders: Record<string, string> = {
    "Content-Type": contentType,
    "Accept-Ranges": "bytes",
    "Content-Disposition": "inline",
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "private, max-age=3600",
  };

  const range = request.headers.get("range");
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (!m || (m[1] === "" && m[2] === "")) {
      return new Response(null, {
        status: 416,
        headers: { ...baseHeaders, "Content-Range": `bytes */${total}` },
      });
    }

    let start: number;
    let end: number;
    if (m[1] === "") {
      // Rango sufijo "bytes=-N": últimos N bytes.
      const suffix = m[2] === "" ? 0 : Number(m[2]);
      start = Math.max(total - suffix, 0);
      end = total - 1;
    } else {
      start = Number(m[1]);
      end = m[2] === "" ? total - 1 : Math.min(Number(m[2]), total - 1);
    }

    if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= total) {
      return new Response(null, {
        status: 416,
        headers: { ...baseHeaders, "Content-Range": `bytes */${total}` },
      });
    }

    let stream;
    try {
      stream = storage.stream(file.storageKey, { start, end });
      // Si el archivo desaparece a mitad de lectura, abortamos el stream en
      // silencio (evita un uncaughtException; el cliente ya recibe cortado).
      (stream as NodeJS.ReadableStream).on("error", () => {});
    } catch (cause) {
      if (cause instanceof StorageError && cause.code === "NOT_FOUND") {
        return Response.json({ error: "Archivo no encontrado en almacenamiento." }, { status: 404 });
      }
      return Response.json({ error: "Error al servir el archivo." }, { status: 500 });
    }

    return new Response(
      Readable.toWeb(stream as unknown as Readable) as unknown as ReadableStream,
      {
        status: 206,
      headers: {
        ...baseHeaders,
        "Content-Range": `bytes ${start}-${end}/${total}`,
        "Content-Length": String(end - start + 1),
      },
    });
  }

  let fullStream;
  try {
    fullStream = storage.stream(file.storageKey);
    (fullStream as NodeJS.ReadableStream).on("error", () => {});
  } catch (cause) {
    if (cause instanceof StorageError && cause.code === "NOT_FOUND") {
      return Response.json({ error: "Archivo no encontrado en almacenamiento." }, { status: 404 });
    }
    return Response.json({ error: "Error al servir el archivo." }, { status: 500 });
  }

  return new Response(
    Readable.toWeb(fullStream as unknown as Readable) as unknown as ReadableStream,
    {
      status: 200,
    headers: { ...baseHeaders, "Content-Length": String(total) },
  });
}