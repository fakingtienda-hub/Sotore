import { and, count, eq, sql } from "drizzle-orm";
import { Readable } from "node:stream";
import type { NextRequest } from "next/server";

import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import { mimeFor, storage, StorageError } from "@/lib/server/storage";
import { rateLimit } from "@/lib/server/rate-limit";

export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/files/[fileId]/download">,
) {
  const { fileId } = await ctx.params;

  // --- 1) Autenticación ---------------------------------------------------
  const session = await getSession();
  if (!session?.user) {
    return Response.json({ error: "Debes iniciar sesión para descargar." }, { status: 401 });
  }
  const userId = session.user.id;

  // --- 1b) Rate limit por usuario+archivo ---------------------------------
  const limiter = rateLimit(`dl:${userId}:${fileId}`, 30, 60_000);
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
    return Response.json(
      { error: "No tienes acceso a este archivo." },
      { status: 403 },
    );
  }

  // --- 5) Minutos mínimos tras pago (minMinutesAfterPayment) ---------------
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

  // --- 6) Registrar la descarga (solo clientes; el admin de prueba no cuenta)
  // Se registra en `downloads` después de comprobar almacenamiento, y una
  // descarga fallida no debe consumir el límite ni el historial.
  if (purchase) {
    const ip = (
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      null
    )?.slice(0, 45) ?? null;
    const userAgent = request.headers.get("user-agent") ?? null;

    if (file.downloadLimit != null) {
      // Conteo + inserción atómicos con advisory lock por usuario+archivo, para
      // que dos descargas concurrentes no excedan el límite.
      let overLimit = false;
      await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`dl:${userId}:${fileId}`}))`);
        const [{ cnt }] = await tx
          .select({ cnt: count() })
          .from(schema.downloads)
          .where(and(eq(schema.downloads.userId, userId), eq(schema.downloads.fileId, fileId)));
        if (cnt >= (file.downloadLimit as number)) {
          overLimit = true;
          return;
        }
        await tx.insert(schema.downloads).values({
          userId,
          productId: file.productId,
          fileId: file.id,
          purchaseId: purchase.id,
          ipAddress: ip,
          userAgent,
        });
      });
      if (overLimit) {
        return Response.json(
          { error: `Has alcanzado el límite de ${file.downloadLimit} descarga(s) para este archivo.` },
          { status: 429 },
        );
      }
    } else {
      await db
        .insert(schema.downloads)
        .values({
          userId,
          productId: file.productId,
          fileId: file.id,
          purchaseId: purchase.id,
          ipAddress: ip,
          userAgent,
        })
        .catch(() => {});
    }
  }

  // --- 7) Servir el archivo por streaming (sin cargarlo en memoria) --------
  let total: number;
  try {
    total = file.sizeBytes ?? (await storage.stat(file.storageKey)).sizeBytes;
  } catch (cause) {
    if (cause instanceof StorageError && cause.code === "NOT_FOUND") {
      return Response.json({ error: "Archivo no encontrado en almacenamiento." }, { status: 404 });
    }
    return Response.json({ error: "Error al servir el archivo." }, { status: 500 });
  }

  let stream;
  try {
    stream = await storage.stream(file.storageKey);
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
      status: 200,
      headers: {
        "Content-Type": file.mimeType?.trim() || mimeFor(file.storageKey) || "application/octet-stream",
        "Content-Length": String(total),
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
