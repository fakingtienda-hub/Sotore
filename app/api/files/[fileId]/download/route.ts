import { and, count, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";

import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import { storage, StorageError } from "@/lib/server/storage";

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

  // --- 2) Archivo ---------------------------------------------------------
  const [file] = await db
    .select()
    .from(schema.productFiles)
    .where(eq(schema.productFiles.id, fileId))
    .limit(1);

  if (!file) {
    return Response.json({ error: "Archivo no encontrado." }, { status: 404 });
  }

  // --- 3) Compra activa del producto --------------------------------------
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

  if (!purchase) {
    return Response.json(
      { error: "No tienes acceso a este archivo." },
      { status: 403 },
    );
  }

  // --- 4) Límite de descargas por archivo + usuario -----------------------
  if (file.downloadLimit != null) {
    const [{ cnt }] = await db
      .select({ cnt: count() })
      .from(schema.downloads)
      .where(
        and(
          eq(schema.downloads.userId, userId),
          eq(schema.downloads.fileId, fileId),
        ),
      );

    if (cnt >= file.downloadLimit) {
      return Response.json(
        { error: `Has alcanzado el límite de ${file.downloadLimit} descarga(s) para este archivo.` },
        { status: 429 },
      );
    }
  }

  // --- 5) Minutos mínimos tras pago (minMinutesAfterPayment) ---------------
  if (file.minMinutesAfterPayment > 0 && purchase.grantedAt) {
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

  // --- 6) Registrar descarga ----------------------------------------------
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    null;
  const userAgent = request.headers.get("user-agent") ?? null;

  await db.insert(schema.downloads).values({
    userId,
    productId: file.productId,
    fileId: file.id,
    purchaseId: purchase.id,
    ipAddress: ip,
    userAgent,
  });

  // --- 7) Servir el archivo -----------------------------------------------
  try {
    const object = await storage.get(file.storageKey);

    return new Response(new Uint8Array(object.data), {
      status: 200,
      headers: {
        "Content-Type": object.mimeType ?? "application/octet-stream",
        "Content-Length": String(object.sizeBytes),
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (cause) {
    if (cause instanceof StorageError && cause.code === "NOT_FOUND") {
      return Response.json({ error: "Archivo no encontrado en almacenamiento." }, { status: 404 });
    }
    return Response.json({ error: "Error al servir el archivo." }, { status: 500 });
  }
}
