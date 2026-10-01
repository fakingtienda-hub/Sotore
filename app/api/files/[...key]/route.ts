import { eq } from "drizzle-orm";
import { Readable } from "node:stream";
import type { NextRequest } from "next/server";

import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import { StorageError, mimeFor, storage } from "@/lib/server/storage";

/**
 * Ruta de acceso público por storageKey.
 *
 * Se usa para servir IMÁGENES DE PORTADA pública (`coverImageUrl` = `/api/files/...`).
 * Todo lo demás (archivos del curso, miniaturas, ZIP del pack…) se sirve por
 * rutas dedicadas que validan sesión/compra (`download`, `view`, `thumb`,
 * `pack`); aquí se bloquea para no exponer claves predecibles
 * (`products/{id}/pack.zip`, thumbnails, etc.) sin autenticación.
 *
 * Única excepción: un admin autenticado puede previsualizar cualquier clave
 * (usado por el gestor de archivos del admin).
 */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ key: string[] }> },
) {
  const { key } = await ctx.params;
  const storageKey = key.join("/");

  const session = await getSession();
  const isAdmin = session?.user?.role === "admin";

  if (!isAdmin) {
    const publicPath = `/api/files/${storageKey}`;
    const [cover] = await db
      .select({ id: schema.products.id })
      .from(schema.products)
      .where(eq(schema.products.coverImageUrl, publicPath))
      .limit(1);
    if (!cover) {
      return Response.json({ error: "Archivo no encontrado." }, { status: 404 });
    }
  }

  let total: number;
  try {
    total = (await storage.stat(storageKey)).sizeBytes;
  } catch (cause) {
    if (cause instanceof StorageError && cause.code === "NOT_FOUND") {
      return Response.json({ error: "Archivo no encontrado." }, { status: 404 });
    }
    return Response.json({ error: "Error al leer el archivo." }, { status: 500 });
  }

  let stream;
  try {
    stream = await storage.stream(storageKey);
    (stream as NodeJS.ReadableStream).on("error", () => {});
  } catch (cause) {
    if (cause instanceof StorageError && cause.code === "NOT_FOUND") {
      return Response.json({ error: "Archivo no encontrado." }, { status: 404 });
    }
    return Response.json({ error: "Error al leer el archivo." }, { status: 500 });
  }

  const fileName = storageKey.split("/").pop() ?? "archivo";

  return new Response(
    Readable.toWeb(stream as unknown as Readable) as unknown as ReadableStream,
    {
      status: 200,
      headers: {
        "Content-Type": mimeFor(storageKey) ?? "application/octet-stream",
        "Content-Length": String(total),
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": isAdmin
          ? "private, max-age=3600"
          : "public, max-age=3600, stale-while-revalidate=86400",
      },
    },
  );
}