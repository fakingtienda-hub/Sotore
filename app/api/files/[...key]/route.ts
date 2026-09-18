import type { NextRequest } from "next/server";

import { StorageError, storage } from "@/lib/server/storage";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ key: string[] }> },
) {
  const { key } = await ctx.params;
  const storageKey = key.join("/");

  let object;
  try {
    object = await storage.get(storageKey);
  } catch (cause) {
    if (cause instanceof StorageError && cause.code === "NOT_FOUND") {
      return Response.json({ error: "Archivo no encontrado." }, { status: 404 });
    }
    return Response.json({ error: "Error al leer el archivo." }, { status: 500 });
  }

  const { data, mimeType, sizeBytes } = object;
  const fileName = storageKey.split("/").pop() ?? "archivo";

  return new Response(new Uint8Array(data), {
    status: 200,
    headers: {
      "Content-Type": mimeType ?? "application/octet-stream",
      "Content-Length": String(sizeBytes),
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
}